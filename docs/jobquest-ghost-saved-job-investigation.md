# JOBQUEST GHOST SAVED JOB FIX

2026-09-29。狀態：**BLOCKED**。
`SCHEMA_GAP_REQUIRES_SEPARATE_MIGRATION_DESIGN`

本 Ticket 按使用者的 schema STOP 規則完成重現與既有 schema 調查後停止。
沒有進行 production implementation、建立 migration 檔、執行 migration、
改 RLS 或重新宣告人工驗收 PASS。以下是調查結果與未執行的最小提案。

## Step 1 — 重現

`BUG_REPRODUCED: YES`

使用合成的已保存 `user_job_actions` row fixture，經實際
`jobActionRepository.getAll('owner-a')` 映射，再執行實際 App、GuildSidebar、
CollectionPage 與 JobList/JobCard。Auth、雲端 transport 與 hook 的 action 輸入
在診斷 harness 中隔離；REAL session hook、cache validator 與 Matching 使用
現有程式。沒有讀取或新增 live 使用者 action rows，沒有 final browser acceptance。
這是 deterministic development reproduction；使用者原先的人工 bug 報告保持有效。

暫時的診斷命令，連續執行兩次得到相同的兩個 assertion failures：

```powershell
npx.cmd vitest run tests/ghostSavedJobReproduction.test.tsx -t 'ghost saved job reproduction'
```

```text
cache=true  persistedFavorites=2 badge=2 visibleCards=1 orphanRetained=true
cache=false persistedFavorites=1 badge=1 visibleCards=0 orphanRetained=true
favorite badge must equal renderable favorite cards: expected 2 to be 1
favorite badge must equal renderable favorite cards: expected 1 to be +0
Tests: 2 failed, 20 skipped
```

第二個案例保留 REAL mode marker、移除所有 job cache metadata；mode marker
不是 job metadata。第一個案例的 valid cache 只包含近期 job B；舊 job A
只有 canonical favorite action，沒有 metadata。兩者都不生成 A 的假卡片，
action 仍在 fixture 還原的狀態中，但 badge 計入了無法呈現的 A。

## Root Cause 與區分假設

1. **Confirmed — 生命周期／計數集合不同。** App 先依 source/mode 篩選 action
   map，再直接計算所有 favorite flags；CollectionPage 只從目前有效的
   `realSession.matches` 篩出有 action 的卡片。沒有目前 metadata 的 action
   因而計入 badge，卻無法成為 card。
2. **Canonical identity mismatch 不是本次根因。** 控制實驗只補回同一
   `104:orphan123` 的 normalized metadata，兩個不同 ID 的職缺即使有相同
   title/company，也正確呈現各自連結；badge=2、cards=2。沒有依名稱 join。
3. **TTL 不是本次根因。** 未補 metadata 時，cache status 已是 `ready`、近期
   job B 可正常匹配，仍有 badge=2、cards=1。沒有改動時間或 TTL。

控制實驗命令：

```powershell
npx.cmd vitest run tests/ghostSavedJobReproduction.test.tsx -t 'resolution hypothesis probes'
```

兩個 probes PASS（22 個其他 tests skipped）；分別確認 metadata 缺失與補回的
既有行為。這不是 fix verification，也不是使用者要求十個案例的回歸 PASS。

相關現行程式：`src/App.tsx`、`src/pages/CollectionPage.tsx`、
`src/repositories/jobActionRepository.ts`、`src/services/jobActionService.ts`、
`src/hooks/useJobActions.ts`、`src/services/real104Session.ts`。本 Ticket 沒有修改它們。

## Step 2 — Existing Schema

只以 read-only catalog query 調查 JobQuest project `neqwkiruqfevlchiajor` 的
`public.user_job_actions`。Live 欄位、constraints、RLS policies、effective grants
與 updated_at trigger 均與既有 local migration/database types 一致。
沒有查詢個人 records、其他表的內容或 credentials。

| Existing field | Exact type | Null / default |
| --- | --- | --- |
| user_id | uuid | NOT NULL |
| job_key | text | NOT NULL |
| source | text | NOT NULL |
| favorite | boolean | NOT NULL, false |
| viewed | boolean | NOT NULL, false |
| applied | boolean | NOT NULL, false |
| rejected | boolean | NOT NULL, false |
| created_at | timestamp with time zone (timestamptz) | NOT NULL, now() |
| updated_at | timestamp with time zone (timestamptz) | NOT NULL, now() |

- Primary key：`(user_id, job_key)`。
- Owner foreign key：`user_id -> auth.users(id) ON DELETE CASCADE`。
- Source constraint：`source IN ('104', '1111')`。
- `set_user_job_actions_updated_at` 在 UPDATE 前呼叫既有 `set_updated_at()`。
- RLS enabled=true、forced=false。四個 owner policies 限定 authenticated。
  SELECT/DELETE 的 USING、INSERT 的 WITH CHECK、UPDATE 的 USING 與 WITH CHECK
  都是 `(SELECT auth.uid()) = user_id`。
- authenticated 有 SELECT/INSERT/UPDATE/DELETE effective grants；anon 四者均無。
  本次只確認政策 metadata，沒有再次執行 live owner-session CRUD 測試。

Repository 的 SELECT 只有 `job_key,source,favorite,viewed,applied,rejected`，
以 `user_id` 篩選；讀取結果投影為 `StatusMap`。Upsert 只保存 owner、identity
與四個 flags，conflict key 為 `user_id,job_key`。Service/action handlers 只有
job ID 與狀態輸入，沒有 snapshot 保存／還原路徑。

`EXISTING_SCHEMA_SUPPORTS_JOB_SNAPSHOT: NO`

**Exact field：NONE。** 不存在 metadata、job_data、job_snapshot、payload 或
任何 JSON/JSONB 欄位。現有 booleans／timestamps 無法承載 title、company、
location、salary、URL；把 JSON 塞進 job_key/source 會破壞 canonical identity
與 source contract。因此缺的是 schema 能力，不能只改 repository mapping 解決。

## Minimum Required Field / Proposed Minimal Migration

提案欄位：既有 `public.user_job_actions` 增加 **`job_snapshot jsonb NULL`**。
以下 SQL 僅供另一個 migration design Ticket 審查，**未建立 migration 檔或執行**：

```sql
ALTER TABLE public.user_job_actions
  ADD COLUMN job_snapshot jsonb;
```

只有一個 nullable 欄位，不建新表。既有 rows 保留 NULL，不使用空物件假裝
已有職缺，不刪除或猜測 backfill。Primary key、owner、source constraint、
timestamps 與既有 RLS 均維持原 contract；目前沒有需要改 RLS 的證據。
正式值驗證與 snapshot-to-Job/Matching 的相容性需在獨立設計中確認。

擬議的 minimal metadata allowlist（**尚未實作**）：

| Snapshot concept | Existing normalized field |
| --- | --- |
| source | Job.source |
| sourceKey | Job.id (`104:{jobId}`), authority remains row.job_key |
| title | Job.title |
| company | Job.company |
| location | Job.location |
| salary | Job.salary |
| experience, when available | Job.experience |
| canonicalUrl | Job.url |
| capturedAt | Job.collectedAt |

未來只在使用者對 REAL job 收藏／已看／已投遞／不適合時保存或更新 metadata；
Connector import 不得批次永久保存所有 jobs。Snapshot 是 metadata，不是 identity
或永久 match score。不得保存 HTML、cookies、private account data、raw payload、
完整頁面／不必要全文或 browsing history。

後續設計須保持 current valid session job > validated persisted snapshot > unresolved
orphan 的解析順序；Matching 使用 restored Confirmed Resume 與既有 engine，
所需 normalized 輸入須明確處理，不得憑空製造缺失技能或真實分數。
SessionStorage 的原 30 分鐘 TTL 與 recent working-session 責任維持不變。

## Legacy Orphans / Stop Boundary

現況：舊 action 保留，但 metadata 無法 resolve 時不呈現卡片；badge 仍可能
比卡片多，**此 bug 尚未修復**。沒有做 destructive cleanup、count-only patch
或新增假的 job。未來同一 sourceKey 再匯入時可 join，補 snapshot 與修正
renderable count 屬後續明確授權的實作，不在本 Ticket 越過 schema gate。

暫時 harness 已從 project tests 移除，避免把已知紅燈測試混入既有 suite。
診斷 source、兩次 red outputs、probe output 與 baseline hashes 保存於本機 temp：
`%TEMP%\jobquest-ghost-saved-20260929-f7f1f59d`。
如需重跑，須先把該 temp harness 複製回 `tests/ghostSavedJobReproduction.test.tsx`，
執行上列 focused 命令，完成後移除這個診斷檔。

## Deliverable

| Report field | Result |
| --- | --- |
| Bug reproduced | YES — deterministic development repro, twice |
| Root cause | Persistent action count includes metadata-unresolved jobs; cards resolve only current transient cache |
| Existing schema supports job snapshot | NO |
| Snapshot field reused | NONE |
| Schema changed | NO |
| RLS changed | NO |
| Minimal snapshot fields | Proposed allowlist above; none persisted by this Ticket |
| Legacy orphan behavior | Preserved; no deletion/fabrication; count mismatch still exists |
| Badge/card mismatch fixed | NO |
| Saved job visible without sessionStorage | NO — current schema cannot restore absent job metadata |
| Canonical sourceKey preserved | YES — production identity code unchanged |
| 104 Connector changed | NO |
| Normalization changed | NO |
| Matching changed | NO |
| Resume changed | NO |
| Job Preferences changed | NO |
| OpenRouter called | NO |
| Focused tests | Repro: 2 intentional failures, repeated; probes: 2 PASS. Required fix cases 1–10 NOT VERIFIED |
| TypeScript | NOT RUN — schema STOP gate, no production changes |
| Build | NOT RUN — schema STOP gate, no production changes |
| Manual acceptance performed by Codex | NO |
| Final status | BLOCKED |
| Exact blocker | SCHEMA_GAP_REQUIRES_SEPARATE_MIGRATION_DESIGN; no existing snapshot field |

先前 session-restore 的 248/248、TypeScript/build PASS 是上一個 checkpoint，
不是本次 ghost bug 已修復的證據。本次不要求使用者開始完成版 A–F 驗收，
不 freeze、不自動開下一個 Ticket 或 RP。STOP。
