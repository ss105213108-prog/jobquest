# JOBQUEST JOB SNAPSHOT MIGRATION DESIGN

2026-09-29。Type: **DESIGN ONLY**。
Status: **DESIGN_COMPLETE_AWAITING_APPROVAL**。
Recommended next action: **APPROVE_MINIMAL_MIGRATION_IMPLEMENTATION**。

結論：在既有 `public.user_job_actions` 增加一個 nullable `job_snapshot jsonb`
欄位，足以承載操作過的 REAL 104 職缺之最小可恢復 metadata。沒有需要新表、
identity、RLS、policy、grant 或額外 index 的證據。欄位本身不會修復 App；
後續仍須明確授權 repository／action metadata handoff／resolution／count 實作。
本文件只定義設計，沒有執行 migration、建立正式 migration 檔或修改 production。

## 1. Evidence 與 Exact Existing Schema

本次重新以 read-only catalog SQL 查詢 JobQuest project `neqwkiruqfevlchiajor`
的 `public.user_job_actions`，確認 columns、constraints、indexes、ACL、RLS 與
updated_at trigger。沒有讀取或寫入使用者 rows、credentials 或其他表內容。
上一份 [ghost-job investigation](jobquest-ghost-saved-job-investigation.md)
已重現 badge=2/cards=1 與 badge=1/cards=0；本次不重跑 bug 或人工驗收。

Local schema 對照：

- `supabase/migrations/20260919114039_create_job_quest_user_data.sql`。
- `src/types/database.ts` 的 user_job_actions Row/Insert/Update。
- `src/repositories/jobActionRepository.ts` 的 SELECT/upsert mapping。

| Column | Exact live type | Nullable | Default |
| --- | --- | --- | --- |
| user_id | uuid | NO | none |
| job_key | text | NO | none |
| source | text | NO | none |
| favorite | boolean | NO | false |
| viewed | boolean | NO | false |
| applied | boolean | NO | false |
| rejected | boolean | NO | false |
| created_at | timestamp with time zone (timestamptz) | NO | now() |
| updated_at | timestamp with time zone (timestamptz) | NO | now() |

Live 與 local 欄位／constraints／四個 owner policies 一致。Exact constraints：

| Name | Definition |
| --- | --- |
| user_job_actions_pkey | PRIMARY KEY (user_id, job_key) |
| user_job_actions_user_id_fkey | FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE |
| user_job_actions_source_check | CHECK source IN ('104', '1111') |

唯一查到的 index 是 `user_job_actions_pkey`：unique btree `(user_id, job_key)`。
沒有額外 unique constraint 或 snapshot/JSON index。既有 restore 按 user_id 篩選，
upsert conflict target 是 `user_id,job_key`；此 PK 的 leading user_id 可供既有
owner lookup 使用，本設計沒有查詢 JSON properties 或建立 GIN index 的需求。

`set_user_job_actions_updated_at` 是 BEFORE UPDATE、FOR EACH ROW trigger，呼叫
既有 `set_updated_at()`。兩個 row timestamps 表示 action row 建立／更新，
不等於職缺 capture time；snapshot 的 capturedAt 不得由 updated_at 代替。

Repository 現在只 SELECT `job_key,source,favorite,viewed,applied,rejected`，
映射成 StatusMap；寫入只有 owner、job_key/source 與四個 booleans。
沒有 metadata/snapshot 的可重用欄位或既有讀寫 mapping。

**Schema gap confirmed: YES。** 任意 metadata 不能塞入 job_key/source，否則破壞
identity/source contract；既有 booleans 與 timestamps 也不能承載 job facts。

## 2. Exact Column 與 Sufficiency

| Property | Proposed value |
| --- | --- |
| Existing table | public.user_job_actions |
| New column | job_snapshot |
| Type | jsonb |
| Nullable | YES |
| Effective default | SQL NULL; omit DEFAULT clause |
| Existing rows | remain valid with SQL NULL |
| Backfill | NONE |
| New table / index / constraint / trigger | NONE |

SQL NULL 表示沒有 snapshot；JSON literal null、`{}` 或不完整 object 不表示已有
可恢復職缺。採用單一 versioned object 可容納下述 V1，無需拆成多個 columns。
V1 shape／identity binding 由後續 application 寫入和讀取邊界驗證。
本次不新增 JSON CHECK、DB function 或 RLS 規則；JSONB 本身不保證內容 schema。
若將來要求 DB 必須拒絕每一個 malformed JSON，即是額外明確需求，不能把本
column-only migration 宣稱具有該能力。

**Sufficient: YES，作為 schema evolution。** 後續經驗證的 serializer/resolver
能從一個 object 恢復相容的 Job；不必擴張資料庫 schema，也不必改 Matching。
只加入 column 而沒有後續 App implementation，ghost bug 仍會存在。

## 3. Minimal V1 Snapshot Contract

採用現有 normalized Job 欄位名稱；不永久保存整個 Job/JobWithMatch。
以下是 **SYNTHETIC shape example**，不是實際職缺、backfill 或雲端資料：

```json
{
  "schemaVersion": 1,
  "sourceKey": "104:844qv",
  "title": "範例職稱",
  "company": "範例公司",
  "location": "台中市",
  "salary": "待遇面議",
  "experience": "未提供",
  "description": "",
  "capturedAt": "2026-09-29T04:00:00.000Z"
}
```

### Candidate Classification

| Candidate | Class | V1 key / reason |
| --- | --- | --- |
| schemaVersion | REQUIRED | schemaVersion=1；拒絕 unsupported versions，防止未來誤解 payload |
| source | NOT_NEEDED | authoritative row.source 已存在；V1 resolver 僅接受 row.source='104' |
| sourceKey | REQUIRED | copy exact Job.id/row.job_key 作 binding check；不成為 identity authority |
| title | REQUIRED | Job.title；卡片、技能／職涯分析所需 |
| company | REQUIRED | Job.company；顯示來源公司，不能從其他 job 補值 |
| location | REQUIRED | Job.location；卡片既有地區顯示 |
| salaryText | REQUIRED | 必要 salary 概念保存為既有 normalized key salary=Job.salary；不另存 salaryText alias |
| experienceText / equivalent | REQUIRED | 必要 experience 概念保存為 experience=Job.experience；卡片與年資 Matching 所需 |
| canonicalUrl | NOT_NEEDED | 從 authoritative row.job_key 的 jobId 呼叫既有 build104CanonicalUrl；不存可分歧 URL |
| capturedAt | REQUIRED | Job.collectedAt 的 canonical ISO time；保留 capture provenance 與原本排序語義 |
| description | REQUIRED | 額外有程式證據的欄位：Job.description，僅既有 normalized 公開 snippet；可為空字串 |

**Required fields：** schemaVersion、sourceKey、title、company、location、salary、
experience、description、capturedAt。**Optional fields：NONE。** 缺值語義已由
目前 normalizer 表達，不再增設第二套 optional/fallback 模型。

字串 title/company/location/salary/experience 須符合目前 normalized 非空契約。
`experience='未提供'` 只能是既有 normalizer 的實際輸出，不可猜測年資。
description 必須存在且是 string；空字串表示原始 normalized Job 沒有 snippet，
不表示任意缺欄位可以補空後繼續 Matching。
capturedAt 必須是合法 canonical ISO instant，保留來源值，不能改成保存時間。

V1 writer 限定現有 frozen REAL normalizer 的輸出：id/externalId/url、固定 category/
status、publishedAt=collectedAt，以及由 title+description 產生的 requiredSkills
均須與該 normalizer 契約一致。若來源不是這個相容 shape，不得藉省略欄位保存
成貌似完整的 V1；先停止該 metadata write，而不是擴張 schema 或修 Matching。

V1 closed allowlist：writer 明確投影上列九個 keys；reader 對 SQL NULL、JSON null、
wrong types、missing required fields、unknown keys、unknown version 或 binding
mismatch 視為沒有可用 persisted snapshot，不刪 action、不 fabricate Job。
不得直接把任意 DB JSON cast 成 Job。snapshot.sourceKey 須精確等於 row.job_key，
且 row.source='104'、row.job_key 符合現有 REAL `104:[a-z0-9]+` 契約。

### Explicitly Not Persisted

| Field / data | Why excluded |
| --- | --- |
| user_id、action flags、row timestamps | already in authoritative row；不能從 snapshot 覆蓋 |
| source、externalId、id、url/canonicalUrl | derive from row.source/job_key and existing canonical URL function |
| category | current REAL normalizer 固定 '104 公開職缺'，不需重複保存 |
| requiredSkills | current REAL normalizer 可從 title + normalized description 重新產生 |
| publishedAt | current REAL normalizer 使用 capture time；從 capturedAt 恢復，不宣稱實際刊登時間 |
| collectedAt | capturedAt 已保存同一 normalized instant，不重複 keys |
| status | current REAL normalizer 固定 capture-time 'active'；不是即時在招查詢 |
| salaryText、experienceText、snippetText aliases | 使用 normalized salary/experience/description，避免雙重名稱 |
| matchScore、Match %、grade、confidence、matched/missing skills、breakdown、reasons | derive at runtime from restored Confirmed Resume + unchanged Matching Engine |
| raw HTML、page source、cookies、account data、browsing history、raw Connector envelope/sourceUrl | not required for card/identity/matching；不可持久化 |
| 不必要完整職缺全文、額外爬取的 description、Resume、PDF、AI payload | not part of this minimal existing public evidence contract |

## 4. Matching Compatibility — Exact Evidence

`normalize104CapturedJob` 的現有輸出：description 來自 optional public snippet，
requiredSkills = detectCanonicalSkills(title + description)，category 固定為
'104 公開職缺'，publishedAt/collectedAt 均等於 capturedAt，status 固定為 active。
目前 extraction script 不提供 snippet，故正常可能得到 description='';
型別與 integration tests 也支援已有公開 snippet 的 capture。

`analyzeJobRequirements` 會讀 requiredSkills、title、description、category、experience。
description 不只用於詳情：它參與 skills detection、context 與 confidence（包含
長度 >=50 的既有信號）。`scoreCalculator` 以 confidence 控制分數 ceiling。
因此只有 title/company/location/salary 的 display snapshot 不足以忠實恢復 Matching；
把有內容的 description 擅自截斷、刪除或從名稱猜技能，會改變原本分析輸入。
V1 保存既有 normalized snippet 是必要資料，不是新增 full-page extraction。

未來 adapter 的設計路徑（**沒有實作**）：

1. 驗證 authoritative row 與 snapshot binding；jobId 只取自 row.job_key。
2. 使用 row identity 和 snapshot 的真實欄位，建立給既有 normalizer 的 input：
   externalId=canonical jobId、sourceKey=row.job_key、title/company/location 原值、
   salaryText=snapshot.salary、experienceText=snapshot.experience、
   snippetText=snapshot.description、canonicalUrl=既有 helper 的結果。
3. 呼叫未修改的 `normalize104CapturedJob(input, snapshot.capturedAt)`。
   不走 Connector、外部 navigation 或 TTL-gated working-session import。
4. 僅把恢復出的 compatible Job 與 restored Confirmed ResumeProfile 交給
   未修改的 matchingService.matchJobs；Match % 留在 memory。

這可恢復目前 frozen normalizer 的全套 Job 欄位，包括可推導的欄位；不需要
永久保存 derived skill list。同一 Resume、同一輸入、同一 frozen engine 應有
相同 matching output，須由後續 round-trip test 證明，本設計不宣稱測試 PASS。
日後若 normalizer/skill semantics 改變，須另行審查 V1 compatibility/version，
不可在此 Ticket 改 algorithm 或填入推測技能。

Captured snapshot 是歷史公開擷取資料，不能保證 source page 仍在招。
保留 capture-time active 的既有 normalized 語義，不把 restore 宣稱成新擷取。
SessionStorage 的 30-minute TTL 仍只保護 recent working-session jobs；persisted
interacted snapshot **不因超過 30 分鐘而失效**，否則無法滿足關閉／重開的目標。
Persisted snapshot 不可重新塞回 Board working cache 或延長其 TTL。

## 5. Identity / Write / Read / Legacy Contracts

### Identity Authority

Identity authority 永遠是既有 `(user_id, job_key)` 及 row.source。
REAL 104 的 approved sourceKey 是 `104:{jobId}`。Snapshot 中 sourceKey 只是
一致性檢查：若它與 row.job_key 不同，拒用 metadata，不能改 row 的 key、
搬 action 或依 title/company/index/score 搜尋其他職缺。原始頁 URL 只由 canonical
row identity 推導，任意 JSON URL 不得成為導航 authority。

### Future Write

- 只在使用者對 REAL 104 job 收藏、已看、已投遞或不適合的既有 action trigger
  保存／更新該 row 的 flags + projected snapshot；盡可能用同一次 row write。
- normalized Job 必須來自當時有效的既有 REAL import/session evidence；key/source
  與 action target 一致。已還原且 validated 的 persisted snapshot 可以保留；
  對它的 flag 操作不表示取得了新的 job facts，也不能更新 capturedAt。
- import/search/matching 本身不新增任何 user_job_actions rows。不能以有 jobs
  列表為由呼叫 importMany 做 snapshot bulk persistence。
- 現有 interacted legacy row 在同 key 重新匯入時，可以補／refresh 那一 row 的
  snapshot；限已有非空 action 的 row 與實際重現的 normalized evidence，不新增
  untouched jobs。不做猜測、按名稱 backfill 或全庫補資料。
- 缺少 metadata 時仍可保存合法 action flags，保留既有 snapshot，不能用 NULL
  清掉它；新 legacy row 沒有 snapshot 時保持 SQL NULL。後續須實測 flag-only
  Supabase upsert 的 omitted-column 行為，不靠假設宣告 snapshot preservation。
- 取消收藏或 flags 全 false 不刪 row/snapshot；reset/unmount 不做 DB cleanup。
- 保留既有 optimistic UI、owner/epoch guards、ordered writes、per-job version/retry。
  Retry 的 flags 和 metadata 必須綁定同一 canonical target，不能取得別張卡資料。
  不用 older known capture 覆蓋較新的已知 snapshot。跨裝置的全域時間單調性
  不是 column-only migration 的保證；本設計不新增 CAS/RPC/trigger。
- DEMO/1111 繼續原 flags contract；V1 不為它們新增 REAL snapshot。

### Future Read / Count

每個 owner+canonical key 的解析順序固定：

1. **current valid REAL session job**：優先使用該 key 的 current normalized metadata。
2. **validated persisted V1 snapshot**：current job 不存在時，依上述 adapter 恢復。
3. **unresolved action**：沒有相容 metadata；保留 flags，沒有 card。

每個 sourceKey 最多一個 resolved Job；兩個 title/company 相同的 ID 分開處理。
Future favorites/history 和 badge 使用同一份 resolved/renderable list：
favorite badge = 可呈現且有 favorite flag 的 items 數，不能直接 count raw action map。
Matching 尚未 ready 或失敗、列表未呈現卡片時，也不能計入尚不可呈現的 item。
History 使用相同 resolution，只改成既有 viewed/applied/rejected 篩選。

Legacy SQL NULL 是合法 row。沒有 current metadata：action 留在 DB，卡片不偽造，
count 不包含它。同 key 再匯入：使用該 Job rejoin 原 row，依前述限定補 snapshot，
PK upsert 不產生 duplicate action。Malformed snapshot 同樣保留 action 並視為
unresolved；不得自動刪除或用其他 key 的 snapshot 修補。

關閉分頁後需沿用既有 authenticated owner，待 confirmed resume/actions restore
完成，在使用者選擇的 REAL scope 解析 saved/history metadata。不改 fresh-tab Demo
預設，不藉 Preferences restore 自動選 REAL、開 104 或觸發 Connector。

## 6. RLS / Grants / Indexes

Live RLS enabled=true、forced=false；四個 policies 的 role 都是 authenticated：

| Policy | Command | USING | WITH CHECK |
| --- | --- | --- | --- |
| user_job_actions_select_own | SELECT | (SELECT auth.uid()) = user_id | none |
| user_job_actions_insert_own | INSERT | none | (SELECT auth.uid()) = user_id |
| user_job_actions_update_own | UPDATE | (SELECT auth.uid()) = user_id | (SELECT auth.uid()) = user_id |
| user_job_actions_delete_own | DELETE | (SELECT auth.uid()) = user_id | none |

新增欄位不改 row owner 或政策 predicate；因此同一 row 的 snapshot 受同樣 owner
限制。這與 [Supabase owner-policy contract](https://supabase.com/docs/guides/database/postgres/row-level-security)
一致；本次確認的是 catalog，不是實際 owner-session CRUD 驗收。

Live table ACL exact value：
`{postgres=arwdDxtm/postgres,service_role=Dxtm/postgres,authenticated=arwd/postgres}`。
所有目前 columns 的 `attacl` 都是 NULL，沒有獨立 column grants。Effective metadata
顯示 authenticated 有 public USAGE 與此表 SELECT/INSERT/UPDATE/DELETE；anon 四種
table privileges 均為 false。Local migration 也明確把四種 table privileges 授給
authenticated。新增 snapshot 應使用目前 authenticated client，不能改用 service key。

由 table-level privileges 可存取各 columns，既有 grant 足以涵蓋新欄位；不需要
新增 column privilege 或擴大 anon 權限。參見 [PostgreSQL GRANT](https://www.postgresql.org/docs/current/sql-grant.html)
與 [Supabase column privileges](https://supabase.com/docs/guides/database/postgres/column-level-security)。

**RLS change required: NO。Policy change required: NO。Grant change required: NO。
Column privilege change required: NO。New index required: NO。**
RLS 保護 owner，不驗證 job facts；錯配 JSON 必須由上述 binding validation 拒用。

## 7. Migration / Rollback Proposal — NOT EXECUTED

最小 proposed forward SQL（僅本文件，不是已建立的 migration）：

```sql
ALTER TABLE public.user_job_actions
  ADD COLUMN job_snapshot jsonb;
```

不加 NOT NULL、`{}` default、backfill、CHECK、new index 或新表。
沒有 DEFAULT clause 時 effective default 為 SQL NULL；此形式不需要 table rewrite。
但 ALTER TABLE 仍需 ACCESS EXCLUSIVE lock，不能宣稱零阻塞。
[PostgreSQL ALTER TABLE](https://www.postgresql.org/docs/current/sql-altertable.html)

未來執行前須核對同一 project、既有 schema/ACL 未 drift、新欄位尚不存在；不要用
IF NOT EXISTS 默默忽略一個型別或 default 不同的同名欄位。採用受控短交易與
lock/statement timeout，避免等待既有長交易；實際 timeout 值留給執行環境確認。
不要把外部操作或資料 backfill 放進這個 DDL transaction。

Rollback 提案（亦未執行）：先停用／回退讀寫新欄位的 App 版本，再執行：

```sql
ALTER TABLE public.user_job_actions
  DROP COLUMN job_snapshot RESTRICT;
```

不使用 CASCADE；若存在新增依賴，先停止並調查。Rollback 會移除已保存的
snapshot metadata，**不保證能恢復那部分資料**；原 owner/identity/flags/row
timestamps/PK/RLS 保留。不刪除 action rows 或重建 table。若 snapshot 值需要保留，
須先另行授權保存它們，不能把可逆 schema 誤稱成 snapshot 零資料損失。

### Risks / Compatibility

- DDL lock：即使沒有 rewrite 仍可能等待／短暫阻擋讀寫，需受控執行窗口。
- JSON validity：nullable JSONB 不自行強制 V1 shape；reader/writer validation 是
  必要 future implementation，malformed data 保留 row、不能渲染錯卡。
- Staleness：snapshot 是 historical evidence，不能保證最新 salary 或仍在招。
  Current valid metadata 優先；不得把 capture time 改成 restore time。
- Writer compatibility：舊 explicit SELECT 與不帶 snapshot 的 insert 仍有合法
  schema；新實作必須驗證舊／flag-only upsert 不會清除既有 snapshot。
- Concurrency：保留現有 per-owner/job write guards；一欄 JSONB 不保證跨裝置的
  capture-time 單調更新。沒有證據要求新的 schema/RPC，故本設計不擴張。
- Rollback：只可接受新 snapshot 資料移除；rollback 後 ghost 的 schema gap 會重現。

## 8. Future Executable Test Contract — NOT WRITTEN / NOT RUN

以下是未來實作與 migration verification 必須達成的 assertions，不是 PASS 記錄。
DB tests 應使用另行授權的 owner A/B fixture；不得對 production legacy rows 做清理。

| # | Setup / action | Required assertions |
| --- | --- | --- |
| 1 | 既有 row + migration；新 flags-only insert | legacy/new row snapshot 都為 SQL NULL；原 key/flags/timestamps 不被 backfill 改寫 |
| 2 | 使用者對 valid normalized REAL job 依次 favorite/viewed/applied/rejected | 每個 trigger 只 upsert 該 owner+key 的九欄 projection；flags 語義不變；一個 row |
| 3 | 同 key 的 title/company 更新 | identity 和 canonical URL 仍只取 row.job_key；不同 metadata 不改 owner/key/source |
| 4 | 兩個相同 title/company、不同 jobId，各自操作 | 兩筆 PK、各自 flags/snapshot/link；不按名稱或順序 cross-attach |
| 5 | writer job.id 不等於 target；DB snapshot.sourceKey 被改成另一 key | writer 拒用錯配 snapshot；reader 不畫錯卡、不覆寫 identity；合法 action 保留 |
| 6 | legacy NULL + no session；之後同 key 匯入 | 沒有 DELETE；badge=renderable card count；rejoin/補值不產生 duplicate；不新增 untouched rows |
| 7 | REAL 104 colon key、DEMO 104 hyphen key、1111 fixture | REAL metadata 只解析 colon scope；DEMO/1111 不保存或套用 REAL snapshot |
| 8 | authenticated owner A/B 與 anon，含 read/insert/update/reassign owner/delete | A 只能存取自己的 row/snapshot；B/anon 不得取得或改動 A 資料；UPDATE WITH CHECK 仍生效 |
| 9 | normalized Job -> nine-field snapshot -> validated adapter -> normalized Job | 九欄 round-trip；有／無 snippet、有／無年資證據都與原 Job/Matching 等價；保存中無 Match %；canonical URL 相同 |
| 10 | import/search/matching 多個 jobs，未互動；再互動一個 | 未互動為零 DB writes；單一互動只寫該 row；legacy refresh 只涉及既有 interacted keys，沒有 all-jobs importMany |

Additional contract checks：超過 session TTL 且 sessionStorage 空時，valid interacted
snapshot 仍可在 REAL collection/history 呈現；current session metadata 優先且不
duplicate；malformed/version/unknown-field failures不刪 row、不 fabrication；
flags-only save、unfavorite、retry、owner switch 保留正確 snapshot binding。
在 future approval 下驗證 nullable/type/default、RLS/ACL unchanged、forward/down
行為與 row preservation；再做 focused regressions、TypeScript/build。
本設計不新增 implementation tests、不執行 final browser acceptance。

## 9. Deliverable / Boundary

| Report field | Result |
| --- | --- |
| Existing table | public.user_job_actions |
| Schema gap confirmed | YES — current live/local has no job metadata field |
| Proposed column | job_snapshot |
| Type | jsonb |
| Nullable | YES |
| Default | SQL NULL (implicit, no DEFAULT clause) |
| Migration required | YES |
| New table required | NO |
| RLS / policy change required | NO |
| Grant / column privilege change required | NO |
| Existing rows remain valid | YES |
| Backfill required | NO |
| Canonical identity changed | NO |
| Minimal snapshot schema | closed V1 object, nine required keys above |
| Required fields | schemaVersion, sourceKey, title, company, location, salary, experience, description, capturedAt |
| Optional fields | NONE |
| Explicitly excluded fields | duplicate/derivable normalized fields, scores, raw/private/AI data, unnecessary full text |
| Legacy orphan behavior | preserve action; unresolved excludes card/count; same-key evidence may rejoin/populate existing row |
| Migration risks | DDL lock, malformed/stale metadata, writer compatibility, concurrency, snapshot loss on down |
| Future implementation boundary | after explicit authorization: one-column migration and separately scoped App serializer/resolver/count glue; existing frozen modules unchanged |
| Recommended next action | APPROVE_MINIMAL_MIGRATION_IMPLEMENTATION |
| Production / test / schema / RLS files changed | NO |
| Migration executed / new migration file | NO |
| OpenRouter / AI / final browser acceptance | NO |

設計完成即 STOP。Recommendation 不是 approval；不執行 migration，不自動開始
implementation，不將既有 ghost bug 標成 FIXED 或人工驗收 PASS。
