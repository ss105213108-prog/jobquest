# JOBQUEST REAL 104 BATCH — FOUNDATION BOUNDARY RESOLUTION

日期：2026-09-30。**ARCHITECTURE DESIGN ONLY**。依據已核准的 [批次架構](jobquest-real104-batch-design.md)、[39 個測試契約](jobquest-real104-batch-test-design.md)及[前次阻擋報告](jobquest-real104-batch-foundation-implementation.md)，只裁決 Foundation 與後續具體接線的職責；未修改 production、測試或既有 session 行為。

## 決議

**FOUNDATION MAY COORDINATE VIA PORTS: YES.** 新批次 coordinator 可呼叫注入的 Matcher Port，並透過注入的 Batch State Storage Port 保存／還原新批次 envelope。這是新模組內的編排，不是對現有 Matching 實作、瀏覽器 storage、App 或 Quest Board 的接線。前次阻擋報告的兩項衝突因此解除：滿 40 筆與 partial commit 可在假 Matcher 回傳成功後進入 `presented`，同一份假 storage 可在新 coordinator instance 中還原；Foundation 仍不碰 frozen concrete modules。

建議以單一 `src/services/real104BatchWorkingSet.ts` 作最小 production 模組，與現行 39 個測試 helper 的動態載入路徑一致。內部可分為純 fingerprint／eligible candidate／transition／envelope validation 函式，加上薄 coordinator；暫不為概念上的 `domain/state`、`coordinator`、`ports` 各建目錄或框架。對外只露 factory、必要的型別與已核准操作：`startOrResumeSearch`、`addCapture`、`presentCurrentBatch`、`startNextBatch`、`restore`。若實作體積確實需要拆檔，保持同一公開介面。

**MATCHER PORT:** 最小結構是 `matchJobs(resume: ResumeProfile, jobs: Job[]): Promise<JobWithMatch[]>`。Factory 注入該函式；`presentCurrentBatch` 的顯式 `resume` 或滿 40 筆時注入的 `getConfirmedResume(): ResumeProfile | null` 提供**已確認**履歷。`getConfirmedResume` 是當前呼叫者資料來源，不是批次模組去讀 Resume/Auth 的第三個 concrete adapter。Coordinator 在 1–39 筆顯式提交或 40 筆自動提交時，只把**當前批次**的 canonical Jobs 交給 Matcher Port；成功後才保存 `presented`，失敗或無已確認履歷保留可恢復的 `collecting` 與原 seen，不宣稱已顯示。Matcher 可自行決定配對排序，不能改變已接受 Job 的原始 current 順序。Foundation 不知道分數公式、等級計算、履歷解析或 Board render；未來由 integration 將現行 `matchingService.matchJobs` 適配成此函式，既有 Matching implementation 原樣保留。

**STORAGE PORT:** 最小同步結構是 `getItem(key): string | null`、`setItem(key, serialized): void`、`removeItem(key): void`，可由現有 test-only `memoryStorage()` 結構滿足。Coordinator 對單一獨立版本 key（設計例：`jobQuest.real104Batch.v1`）讀取和一次寫入完整 envelope；寫入成功後才更新可觀察 state，失敗保留先前已保存的 current／seen。`restore` 經同一 port 讀入並驗證版本、UID、fingerprint、phase、容量、canonical IDs／Job 欄位、firstCapturedAt 與 30 分鐘絕對 TTL；corrupt/expired 明示，不回退舊 v1 或 DEMO。reset 建立新的完整 envelope；清除僅在既定生命週期需要時透過 `removeItem`，不能無聲清空歷史。Port 介面可用自訂結構型別表達，避免 Foundation 依賴 DOM `Storage` 類型；測試 helper 目前用 `Pick<Storage,...>` 只是 TypeScript 形狀，運行時提供 Map，並不要求瀏覽器。

Foundation 中的 owner／TTL／狀態**規則**屬 domain validation；具體 `window.sessionStorage` 存取、取得目前 UID、登出通知與 App startup 次序屬後續 integration。後續 sessionStorage adapter 只滿足同一 Storage Port，不得重新實作批次規則、重設 capturedAt 或用 localStorage／Supabase 存 seen。新批次 key 不改寫既有 `jobQuest.real104Session.v1` 與 `useReal104Session`。

## 現有測試如何跨接抽象 Port

| 測試位置 | 目前注入／斷言 | 此決議下的 Foundation 職責 |
|---|---|---|
| `tests/helpers/real104BatchContract.ts:35–38,93–96` | 注入 `storage`、`matchJobs` fake／spy、`getConfirmedResume`。 | Factory 採用結構型 Port；不 import concrete Matching 或 browser storage。 |
| `tests/real104BatchDomain.contract.test.ts:69–89,136–146` | 滿 40 筆後 Matcher 被呼叫且狀態為 `presented`；無履歷或失敗仍是 `collecting`。 | Coordinator 調用 Matcher Port，再以 Storage Port 保存 presented；測試斷言原樣保留。 |
| `tests/real104BatchSession.contract.test.ts:49–150` | 兩個 instance 共用 Map 模擬 F5；測 UID、TTL、corrupt、寫入失敗。 | Coordinator 讀寫注入的 Storage Port、驗證 envelope；不讀寫 `window.sessionStorage`。 |
| `tests/real104BatchSeams.contract.test.ts:10–24,37–46` | spy Matcher 只接當前已提交 Job，失敗不汙染 seen。 | 同一 Matcher Port 即足夠；沒有具體 Matching import。 |
| `tests/real104BatchSeams.contract.test.ts:27–35` | **J55 直接呼叫現有 `matchingService.matchJobs`**。 | 這是獨立的 frozen Matcher 相容性回歸，藉由批次 module 的 current Jobs 驗證 40 筆可輸入；它不要求 Foundation 匯入或呼叫 concrete Matcher。此項測試本身使用 concrete Matcher，須明確標示，並非 Port 假件。 |
| `tests/real104BatchSeams.contract.test.ts:49–91` | 直接檢查既有 action/snapshot seam。 | 獨立的保存行為相容性檢查；Foundation 不調用 action persistence。 |

**Raw capture admission 的精確界線：** 既有 helper 的 `capture(...)` 產生 `Job104Payload`，`addCapture(payload: unknown, ...)` 也測整份 malformed、重複及 >10 筆的拒絕。為滿足這些**不變的測試斷言**，對外 `addCapture` 的薄入口可重用現有**純** `get104PayloadState`／`payloadMatches104Search` 與 `normalize104CapturedJob` 進行整份 admission，然後只把已驗證、已 normalized 的 Jobs 交給內部批次 transition。這不連接 Extension popup、bridge 或新擷取行為，不改 Connector validator／Normalizer，也不修復或部分採納壞 payload。若實作方案認為連匯入這些既有純函式也超出 Foundation，則當前 raw `addCapture` 測試介面和該方案仍有明確分層矛盾；不能偷偷改掉測試或讓 domain transition 接收未驗證資料。

## 不變邊界與後續工作

**CONCRETE MATCHING IN FOUNDATION: NO.** 不 import `matchingService` 或重算公式。**DIRECT sessionStorage IN FOUNDATION: NO.** 不引用 `window`／`sessionStorage`。**APP/UI IN FOUNDATION: NO.** 不修改 App startup、SearchPanel、Connector 操作、Board、Auth、Resume、資料庫、RLS 或已凍結的舊 REAL restore。

**EXISTING TEST ASSERTIONS PRESERVED: YES.** 本設計未編輯、刪除或弱化 39 個測試。**Tests requiring concrete integration:** 對**批次 coordinator**而言 **NONE**；其 Matcher／storage 依賴都能由 fake ports 提供。例外需透明標記：J55 測試在 `tests/real104BatchSeams.contract.test.ts:33` **自行直接呼叫**既有 concrete Matching，僅作 frozen implementation 的相容性檢查；K56–59 也直接檢查既有 action/snapshot。這些是測試中的獨立回歸，不是 Foundation 的依賴。session 測試使用 Map，沒有 browser sessionStorage 的具體斷言。真正的同 tab F5、登出／same-UID upgrade、App 呈現與手動多頁 Connector 流程仍需後續 integration／人工驗收，不可從 Map 測試宣稱已完成。

**Production code changed: NO.** 測試亦未修改；只新增本設計文件。本輪未執行測試、typecheck 或 build，因為沒有 implementation 變更。**Recommended next work item: `REAL104_BATCH_FOUNDATION_IMPLEMENTATION_V2`**：按上述兩 Port 和薄入口完成新模組，使適用的 39 個 RED 測試轉綠，再由獨立 integration 工作項接 concrete adapters 與 App/Connector，不能在 V2 偷做接線。

STOP：Architecture boundary resolution only；不實作 production。
