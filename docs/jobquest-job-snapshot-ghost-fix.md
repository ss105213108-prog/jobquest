# JOBQUEST JOB SNAPSHOT GHOST FIX

2026-09-29。Work Item 8。Type: IMPLEMENTATION → VERIFICATION。
Final status: **READY_FOR_USER_MANUAL_TEST**。
Manual acceptance: **NOT VERIFIED / NOT PERFORMED BY CODEX**。
Freeze: **PENDING USER MANUAL ACCEPTANCE**。完成本文件即 STOP，不開始下一項工作。

## Result and Evidence Boundary

已接上既有 `public.user_job_actions.job_snapshot` 的 write/read。REAL 收藏徽章現在
只計算收藏頁能呈現的 resolved cards；legacy NULL／invalid snapshot 的 action
保留，不製造卡片、不增加 ghost count。使用者互動過的 REAL 104 職缺，可在
sessionStorage 消失後由合法 persisted snapshot 恢復。

以上為 implementation + focused automated verification 結果。測試使用 synthetic
owner/key transport，實際走 repository/service/controller、App、Collection、既有
cards 和 Matching。沒有對 live user rows 做 INSERT/UPDATE/DELETE，也沒有執行
live owner-session snapshot CRUD、瀏覽器驗收或人工 PASS。這些仍待使用者 A–H。

Read-only catalog pre-check 確認 exact project `neqwkiruqfevlchiajor` 的欄位仍為
`job_snapshot jsonb NULL`，effective default SQL NULL。本 Work Item 沒有 migration、
DDL、新 table、RLS/policy/grant change、backfill 或 legacy cleanup。

## Implementation Contract

- `src/services/jobSnapshot.ts` 是唯一 V1 adapter，使用既有 Job type。九個欄位：
  schemaVersion、sourceKey、title、company、location、salary、experience、description、
  capturedAt；沒有 optional fields、scores、raw capture/page HTML、private 或 AI data。
- Writer 明確 whitelist，核對輸入與 frozen normalizer 的完整 Job 語義一致。
  description 只取既有 normalized 公開 snippet，包含原本的空字串；experience
  的「未提供」沿用既有 normalizer，不猜測。capturedAt 保留 collectedAt。
- Reader 拒絕缺欄位、extra fields、錯誤型別、未知版本、invalid canonical ISO time、
  Demo／1111 key 及 snapshot.sourceKey 與 row.job_key 不一致。錯誤 metadata 不影響
  合法 action flags，也不觸發刪除或修補寫入。
- Identity authority 仍是 row owner + job_key + source。從 row 的 `104:{jobId}`
  取 externalId，呼叫 unchanged canonical URL helper 與 unchanged normalizer，
  重建其固定 category/status、dates、requiredSkills 等衍生欄位。沒有第二個 Job model。
- App 只在 favorite/viewed/applied/rejected callback 按 canonical key 附上 current
  normalized Job，沒有按 title/company/index/score join。Demo callbacks 維持原用法。
- Repository 在同一 `(user_id, job_key)` upsert 寫 flags + validated V1。Restore
  SELECT 同一 row 的 flags + snapshot；不使用 service key 或另一個資料表。
- 沒有 current metadata 的 flags-only payload 省略 job_snapshot，不送 NULL；新 row
  仍用 column default NULL。已有 metadata 時，controller 保存同 key 的最新已知
  capture evidence，不把保存／還原時間當成 capture time。
- 原 owner/epoch/version/queue guards 沿用；metadata 和 action 一起形成獨立 retry
  payload。Save error 保留本機 action 與 job，其他 job 成功不會掩蓋該失敗。
  Delayed restore、owner switch、discard、suspend、rapid edits 都有 focused coverage。
- Resolution 順位為 current valid working-session job > valid persisted snapshot >
  unresolved legacy action。Current matches 直接重用；只有 current 清單缺少的 interacted
  jobs 才交給 unchanged Matching。Merged results dedupe by canonical key，沿用既有
  sortMatchedJobs。沒有保存 match %／grade／skills result。
- Confirmed ResumeProfile 尚未就緒時不匹配；profile/owner/input generation 改變時，
  舊 matching completion 不得替換目前結果。Matching error/loading 沿用既有元件，
  收藏卡片未呈現時徽章為 0；retry 重用相同已驗證 facts。
- 只修改 Collection 的資料來源說明文字及 data resolution；Board/JobCard/styles
  不變。永久 snapshot 不套 session TTL。既有 REAL sessionStorage key、30m TTL、
  missing/expired/corrupt states 與新分頁 Demo 預設不變。

Flags-only preservation 的 SDK payload omission 有 focused assertion；synthetic
transport 的 round-trip 另有 assertion。PostgREST 的官方 query builder 在
merge-duplicates 時只對 insert columns 產生 UPDATE SET，因此省略欄位不在 conflict
update 中；這是 source-backed semantics，並非 live DB round-trip acceptance。
參見 [Supabase JavaScript upsert](https://supabase.com/docs/reference/javascript/upsert)
與 [PostgREST v14.1 query builder](https://github.com/PostgREST/postgrest/blob/v14.1/src/PostgREST/Query/QueryBuilder.hs#L112-L133)。

## Focused Verification

Implementation 前重新執行原 ghost reproduction，**2 failed**：
cache=true badge=2/cards=1；cache=false badge=1/cards=0；legacy action 都保留。
修正後，同樣條件分別是 **1/1** 和 **0/0**；不刪 row。

| Required case | Evidence | Result |
| --- | --- | --- |
| 1 REAL action + snapshot round-trip | 四種 action trigger、same-row flags/facts、App F5 | PASS |
| 2 current session metadata wins | old persisted title vs current title；next action update | PASS |
| 3 saved card without sessionStorage | remount → explicit REAL selection → card, no import | PASS |
| 4 legacy NULL orphan | action/row retained，no fake card，badge=cards | PASS |
| 5 canonical legacy rejoin | explicit same-key import，no import writes；next interaction one row | PASS |
| 6 separate REAL jobs | favorite/applied/rejected separated after remount | PASS |
| 7 same title/company, different IDs | distinct rows/cards/actions/original URLs | PASS |
| 8 REAL/Demo separation | REAL colon vs 104/1111 fixtures；Demo writes omit V1 | PASS |
| 9 invalid/corrupt snapshot | reject malformed/version/cross-attach；retain action, no count | PASS |
| 10 original link | URL derived by existing helper from authoritative key | PASS |
| 11 interacted saved card without cache | fresh-tab scenario; expiry/corrupt working cache; failed-save local metadata | PASS |
| 12 unchanged Matching accepts restored Job | exact Job and match result round-trip; confirmed profile recomputation | PASS |

Additional tests cover all required fields, private-property exclusion, no capture-time
refresh, no TTL on persisted evidence, latest known metadata, flags-only preservation,
retry cloning, owner/reset/queue guards, mixed current+persisted resolution, matching
failure/retry and late owner/profile completion. Automated PASS does not mean user PASS。

```powershell
npx.cmd vitest run tests/jobSnapshot.test.ts tests/jobSnapshotPersistence.test.ts tests/ghostSavedJobRegression.test.tsx tests/jobActionPersistence.test.ts tests/jobActionRepository.test.ts tests/jobActionApp.test.tsx tests/real104Session.test.ts tests/real104SessionRegression.test.tsx tests/real104MatchingFlow.test.tsx tests/job104Integration.test.ts tests/matchingEngine.test.ts tests/jobPreferencePersistence.test.ts tests/jobPreferenceRepository.test.ts tests/jobPreferenceApp.test.tsx tests/confirmedResumePersistence.test.ts tests/confirmedResumeRepository.test.ts tests/confirmedResumeApp.test.tsx tests/resumeReviewHardening.test.tsx
npm.cmd run typecheck
npm.cmd run build
```

**18 files / 283 tests PASS**，其中 **59 新增**，既有相關測試 **224**。
TypeScript **PASS**；build **PASS**。原有 >500 kB chunk-size warning 仍為 non-blocking。
沒有執行 parser/PDF/AI/unrelated broad suites。Preview HTTP `http://localhost:5173`
回應 200，僅確認服務可用，不是 browser visual/interaction acceptance。

## Preservation

Before/after SHA-256 manifests 排除 node_modules/dist/.git/.vitest/.vite。
Before **873**，after **879**：**866 unchanged、7 changed、6 added、0 removed**。
原有 tests、config、schema/types/migrations、Auth/client、Resume Review/persistence、
Preferences、104 Connector/normalizer/canonical helper、Matching、REAL session
service/hook/TTL、Board/cards/styles 全部 hash unchanged。

Changed：App、useJobActions、CollectionPage、jobActionRepository、jobActionService、
jobActionPersistence、CONTEXT.md。Added：jobSnapshot、useJobActionResolution、三個
focused test files、本文件。沒有 new RP、dependency 或 unrelated cleanup。
Baseline、red evidence、after manifest 和 verification summary 保存在
`%TEMP%\jobquest-ghost-fix-20260929-0b7f4366`；沒有 personal row values。

## Deliverable

| Report field | Result |
| --- | --- |
| Existing job_snapshot reused | YES |
| Schema changed | NO |
| RLS changed | NO |
| Snapshot write | YES — implemented / automated PASS; live manual NOT VERIFIED |
| Snapshot restore | YES — implemented / automated PASS; live manual NOT VERIFIED |
| Legacy orphan preserved | YES |
| Ghost badge mismatch fixed | YES — regression PASS; manual NOT VERIFIED |
| Saved interacted REAL job visible without sessionStorage | YES — explicit REAL scope, automated PASS; manual NOT VERIFIED |
| Canonical sourceKey preserved | YES |
| REAL / DEMO isolation | YES |
| Matching algorithm changed | NO |
| 104 Connector changed | NO |
| Resume changed | NO |
| Job Preferences changed | NO |
| OpenRouter called | NO |
| Focused tests | PASS — 18 files / 283 tests |
| TypeScript | PASS |
| Build | PASS |
| Manual acceptance performed by Codex | NO |
| User manual acceptance / Freeze | PENDING / NOT VERIFIED |
| Final status | READY_FOR_USER_MANUAL_TEST |

## MANUAL TEST INSTRUCTIONS — A–H

在原本的同一瀏覽器／profile 開啟 [JobQuest preview](http://localhost:5173)，保留
原匿名 Auth 身份，不清除 localStorage／網站資料。Cloud save message 出現前先等待。
本清單由使用者自行操作；Codex 不執行、不推定 PASS。

**A — New saved job**：選 REAL 104，透過既有 Connector 匯入，收藏 job A；等待
「職缺操作已保存至雲端。」。進收藏任務，A 卡片必須可見，徽章等於收藏卡片數。
記下 A 的 original URL/sourceKey，供後面核對。

**B — F5**：按 F5，等待履歷、偏好、職缺操作還原及 Matching 完成；A 卡片和
收藏狀態保留，badge/card count 相等。

**C — Close tab / lose sessionStorage**：關閉 JobQuest tab，再在同一瀏覽器/profile
新開 `http://localhost:5173`，不要先匯入 104。若新分頁回到原本 Demo 預設，在
佈告欄**只選 REAL 104**，不按匯入；再開收藏任務。A 應由 persisted snapshot
呈現。這個明確 mode 選擇沿用 frozen fresh-tab behavior，不混入 Demo 卡片。
若瀏覽器還原了舊 tab 的 session，可只移除 sessionStorage 的
`jobQuest.real104Session.v1` 並 F5，再只選 REAL；不要清除 Auth 的 localStorage。

**D — Canonical link**：在 A 卡片按「查看職缺」，必須開啟 A 正確的原始
`https://www.104.com.tw/job/{jobId}`，與 A 記錄的 identity 一致。

**E — Legacy ghost row**：在沒有該舊 job 的有效 current metadata/snapshot 時
查看收藏任務。舊 orphan 不應產生假卡或使 badge > cards；不刪舊 row。
可一起確認 A 等新 snapshot 卡片正常顯示。

**F — Rejoin**：用既有 Connector 重新匯入舊 orphan 的**相同 sourceKey**。
既有標記應接回正確卡片，不出現重複；再做一次已看等互動並等待 cloud save，
之後重做 C，確認已恢復該 job。若無法取得該相同職缺，F 記為 NOT VERIFIED，
不要用相同名稱的另一個 job 當作 PASS。

**G — Multi-action isolation**：對三個不同 ID 的 jobs 分別收藏／已投遞／不適合；
等待 cloud save，F5 後到收藏與任務紀錄核對每個狀態、內容、original link
仍附在正確 ID。已看亦應出現在任務紀錄。不能按卡片順序或名稱判斷 identity。

**H — Regression**：確認履歷還原與內容、偏好還原、同 tab 有效 REAL session
還原、Matching 顯示與既有規則、original links 都正常。沒有觸發 AI／PDF parsing。

請使用者回報 A/B/C/D/E/F/G/H 的 PASS／FAIL／NOT VERIFIED；FAIL 附預期與實際
結果。在使用者報告以前不 freeze、不宣稱人工驗收通過。

STOP。
