# JOBQUEST JOB SNAPSHOT MIGRATION FOUNDATION

2026-09-29。Work Item 7：IMPLEMENTATION — FOUNDATION。
Status: **DATABASE_FOUNDATION_READY**。
Recommended next action: **IMPLEMENT_JOB_SNAPSHOT_WRITE_READ_AND_GHOST_FIX**。

本 Work Item 已依使用者明確授權，在唯一允許的 JobQuest project
`neqwkiruqfevlchiajor` 增加 `public.user_job_actions.job_snapshot jsonb NULL`。
沒有 snapshot data writes、backfill、repository/UI/Matching/Connector 行為變更。
**Ghost Saved Job bug 尚未修復**；本次只解除 database schema foundation 的缺口。

## Pre-Migration Gate

建立或套用 migration 前，以 read-only catalog query 驗證：

- public.user_job_actions 存在；job_snapshot **ABSENT**。
- 原九個 columns、types、nullability、defaults 與
  [approved design](jobquest-job-snapshot-migration-design.md) 完全相同。
- PK `(user_id, job_key)`、owner FK 與 source CHECK unchanged。
- RLS enabled=true、forced=false；四個 authenticated owner policies unchanged。
- Table ACL、column ACL、authenticated/anon effective privileges unchanged。
- 既有 unique btree PK index 與 updated_at trigger unchanged。
- 遠端只有兩筆既有 migration，version/name 與 local 兩個 migration 檔一致。

Pre-migration schema verified: **YES**。沒有 COLUMN_ALREADY_EXISTS 或
SCHEMA_DRIFT_FROM_APPROVED_DESIGN；沒有 project list/scanning 或其他 project 操作。

另外讀取 aggregate count 與 fingerprints，不輸出個人 row contents：
一份涵蓋全部原九個欄位（含 owner/key/source、flags 與 timestamps），
另一份涵蓋 identity。後續與相同 SQL 的 post-migration aggregates 比對。

## Exactly One Migration

CLI 2.118.0 的 `--help`、`migration --help` 與 `migration new --help` 已確認。
使用 `migration new add_job_snapshot_to_user_job_actions` 建立唯一 migration。
CLI 僅用來建立 local file；雲端 DDL 使用 Supabase apply_migration，target 明確
固定為 `neqwkiruqfevlchiajor`。沒有 db push/reset、db recreation、history repair、
修改其他 migrations 或讀取 project credentials。

實際唯一 migration：
`supabase/migrations/20260929041121_add_job_snapshot_to_user_job_actions.sql`。

```sql
-- Work Item 7: nullable snapshot foundation only; no backfill or behavior change.
ALTER TABLE public.user_job_actions
  ADD COLUMN job_snapshot jsonb NULL;
```

Local contract check 確認去除 comment 後只有上述一個 ALTER TABLE statement。
apply_migration 回傳 success=true。Read-only migration history 查到唯一新增項目：
version `20260929041121`、name `add_job_snapshot_to_user_job_actions`；原兩項 unchanged。

CLI 原先產生的 local timestamp 為 20260929041030；套用工具產生實際遠端 version
後，只重新命名這一個新檔案，使 local/remote history version 相符。沒有第二個
migration、重新套用或變更原 migration history。Local 命名沿用
[Supabase migration convention](https://supabase.com/docs/reference/cli/supabase-migration-new)
的 timestamp_name.sql；檔案內容保持相同。

## Post-Migration Evidence

只使用 read-only catalog/aggregate checks，不讀出私人 records、不建立測試 rows。

| Contract check | Result |
| --- | --- |
| job_snapshot exists | PASS |
| Type=jsonb | PASS |
| Nullable=YES | PASS |
| column_default IS NULL (effective SQL NULL) | PASS |
| Exactly one new column; original nine unchanged | PASS |
| Existing rows before / after | 7 / 7 — PASS |
| NULL snapshots / non-NULL snapshots | 7 / 0 — PASS |
| Original nine-field aggregate fingerprint unchanged | PASS |
| Owner/job_key/source aggregate fingerprint unchanged | PASS |
| RLS enabled/forced unchanged | PASS |
| All four owner policies unchanged | PASS |
| Table ACL and original column ACL unchanged | PASS |
| Original effective grants unchanged | PASS |
| New column attacl | NULL — no new column grants |
| New column authenticated SELECT/INSERT/UPDATE | true / true / true, inherited from existing table grants |
| New column anon SELECT/INSERT/UPDATE | false / false / false |
| Constraints/PK/index/updated_at trigger unchanged | PASS |
| Migration history only one additive entry | PASS |

Aggregates agree on both row identity and all pre-existing fields, proving the
before/after observed rows preserved their original contents. No DELETE、UPDATE、
backfill 或 fabricated snapshot statement was executed. 每筆舊 row 的 snapshot
都是 SQL NULL。RLS 驗證為 schema/policy metadata preservation；沒有執行新的
owner-session CRUD acceptance，也沒有對 snapshot 寫入任何值。

## Mechanical DB Types Only

修改前先報告 exact evidence：`src/lib/supabase.ts` 用
`createClient<Database>` / `SupabaseClient<Database>`，而
`src/types/database.ts` 以 Row/Insert/Update 逐欄維護目前表的 static schema。
因此只機械同步 user_job_actions 的三個 type declarations：

- Row：`job_snapshot: Json | null`。
- Insert：`job_snapshot?: Json | null`。
- Update：`job_snapshot?: Json | null`。

沿用既有 Json type，不加 V1 domain schema、serializer、reader、writer 或 action
metadata state。不改其他 table types 或任何 repository SELECT/upsert behavior。
舊 insert/update payload 仍可省略此 optional 欄位；本次不驗收 future snapshot
round-trip 或 preservation write paths，因為它們尚未實作。

由於有 type declaration change，執行：

```powershell
npm.cmd run typecheck
npm.cmd run build
```

TypeScript: **PASS**。Build: **PASS**，保留既有非阻斷的 >500 kB chunk-size warning。
沒有修改 bundle config、執行 unrelated/broad suites 或 browser acceptance。

## Preservation / Scope

Workspace 的 before/after SHA-256 manifest 排除 generated/dependency directories
node_modules/dist/.git/.vitest/.vite。只允許本 migration、上述 mechanical DB types
與本次 documentation/context 改動；既有兩個 migrations 與其他 source/tests/config
保持不變。DB 前後 catalog/row aggregate evidence 與 local baseline 保存在：
`%TEMP%\jobquest-snapshot-foundation-20260929-7a5120bd`。
其中 verification-evidence.json 只有 schema metadata、aggregate counts/fingerprints
與 verification flags，沒有個人 row values。

Frozen Resume Review、Confirmed Resume/Job Preferences persistence、Auth/client、
user action repository/service/controller、104 extraction/normalization/canonical
helper、Matching、Board/Collection/JobCard、REAL sessionStorage 與 TTL 均 unchanged。
沒有 AI/OpenRouter、snapshot writes、legacy cleanup、新 table、新 RP 或新增 UI。

## Deliverable

| Report field | Result |
| --- | --- |
| Pre-migration schema verified | YES |
| Migration created | YES — exactly one |
| Migration applied | YES |
| Target project | neqwkiruqfevlchiajor |
| Column | job_snapshot |
| Type | jsonb |
| Nullable | YES |
| Default | SQL NULL / no explicit default |
| Existing rows preserved | YES — 7/7, both aggregate fingerprints unchanged |
| Backfill performed | NO |
| RLS changed | NO |
| Grants changed | NO |
| Canonical identity changed | NO |
| Production behavior changed | NO — only mechanical schema type declarations |
| Ghost bug fixed | NO |
| Migration/schema verification | PASS |
| TypeScript | PASS |
| Build | PASS |
| Browser acceptance | NOT_REQUIRED / NOT_PERFORMED |
| Recommended next action | IMPLEMENT_JOB_SNAPSHOT_WRITE_READ_AND_GHOST_FIX |
| Final status | DATABASE_FOUNDATION_READY |

Work Item 7 完成即 STOP。不要開始 repository implementation、snapshot writes/reads、
badge/UI fix 或 browser acceptance。等待下一個明確授權的 Work Item。
