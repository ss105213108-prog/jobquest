# REAL104 BATCH FOUNDATION IMPLEMENTATION — BLOCKED

日期：2026-09-30。依本工作項「If contradiction is found: STOP and report it」，在修改 production 前停止。只新增本阻擋報告；沒有實作批次、改動既有測試或執行後續 integration。

## 已核對的契約衝突

1. **Matching 的時序與職責**：已核准[架構](jobquest-real104-batch-design.md)要求收滿 40 或顯式提交 partial 時，先由 Matching 成功計算，再保存 `presented`；[測試設計](jobquest-real104-batch-test-design.md)的 test-only 介面在 factory 注入 `matchJobs` 與 `getConfirmedResume`，`tests/real104BatchDomain.contract.test.ts` 於滿 40 後斷言 `presented` 且 Matcher 已被呼叫，partial commit 也斷言呼叫 Matcher。本 foundation 工作項卻同時要求「Do NOT integrate Matching itself in this ticket」，只暴露可由**下一張** integration ticket 傳給 Matching 的 committed-batch output。若遵守 foundation 限界，該 **domain** 測試不能依原斷言轉綠；若為使它轉綠而呼叫 matcher，則超過本票明確範圍。
2. **session 的時序與職責**：測試專用 factory 注入 `storage`，`tests/real104BatchSession.contract.test.ts` 要求跨 instance（F5）、corrupt、UID、TTL 與寫入失敗時立即從新批次模組的 storage 還原。foundation 工作項明定「This ticket is NOT application session integration」；只允許必要的純 `serialize`／`deserialize`／`validateRestoredState` 工具，實際 session integration 留待後案。雖然新 module 的注入式 storage 不會修改既有 `real104Session.v1`，但為滿足這些斷言仍須提供有狀態的讀寫／還原 orchestration；不是僅有純 serialization。

這兩點不是新發現的 Connector 行為，也不是請求解凍 Matching 公式或舊版 REAL session。現行 Connector 對同份重複 ID、任何 malformed job 整份拒絕的裁決仍一致。矛盾在**此次 foundation 應把新 module 做到哪一層**：39 個已核准測試的公開介面同時跨越 domain、Matcher 調用與 storage lifecycle；測試分檔並未把上述整合斷言從 domain 測試隔離。依「Do NOT change an approved assertion unless there is a documented contradiction」及「If contradiction is found: STOP and report it」，本票不得自行把測試改弱，或為追求全綠而加入禁止的整合。

## 解除阻擋所需裁決

請下一個明確工作項在以下其中一個界線上作選擇：

- **擴大 foundation 範圍**：允許新批次 module 只透過注入的 `matchJobs`、`getConfirmedResume` 與 storage port 完成新 envelope 的 Matching/restore orchestration，但仍不接 App、Connector、舊 session key 或 UI。現有 39 個測試可作為本票目標。
- **維持純 domain foundation**：先核准拆分測試契約，讓純 fingerprint、收集、去重、容量、current/seen、next/reset 的測試針對純 transition 介面；將呼叫 Matcher、`presented` 和讀寫 session 的斷言移到後續 integration 工作項。保留原本行為要求，不刪除或弱化斷言，只調整由哪張票驗證。

本工作項的「一旦發現矛盾 STOP」阻止在本輪代選。下一步須由使用者給出修訂的 scope／測試分層指令後，才能安全實作。

## 交付狀態

| 報告欄位 | 結果 |
|---|---|
| Files changed | 只新增 `docs/jobquest-real104-batch-foundation-implementation.md`。 |
| Production batch module | **NOT STARTED — BLOCKED**。 |
| Search fingerprint / current batch / seen history | **NOT VERIFIED**；本輪沒有 production 實作。 |
| Within-batch / cross-batch dedupe / 40-job cap | **NOT VERIFIED**。 |
| Partial commit / next-batch transition / search reset | **NOT VERIFIED**。 |
| Connector validation boundary preserved | **YES（未修改）**；本輪未重跑。 |
| Focused batch tests | 上一張 TEST DESIGN 工作項為 **0 PASS / 39 EXPECTED RED**（production module 缺席）；本輪因 STOP 未重跑。 |
| Remaining expected RED | 原 39 個，未在本輪改變。 |
| Existing REAL regressions | 上一張工作項 **369 PASS / 0 FAIL**；本輪未重跑，不冒稱現在新驗證。 |
| Connector / Matching / production sessionStorage integration / database / RLS / Auth changed | **NO**。 |
| Typecheck / production build / full suite | **NOT RUN**；發現衝突即 STOP，沒有 production 變更可驗證。 |
| New regressions | **NOT VERIFIED**；未改 production，也未執行本輪回歸。 |
| Recommended next work item | **BLOCKED_REAL104_BATCH_FOUNDATION**，先裁決上述 scope 與測試分層。 |

STOP：本輪不開始 foundation implementation，也不進入 `REAL104_BATCH_SESSION_INTEGRATION`。
