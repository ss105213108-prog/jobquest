# JOBQUEST REAL104 BATCH MATCHER ADAPTER

**Final status: REAL104_BATCH_MATCHER_ADAPTER = PASS**

本工作項只新增 Foundation `MatcherPort` 到既有 `matchingService.matchJobs` 的 Adapter。Adapter 原樣傳入呼叫端提供的**目前已確認** `ResumeProfile` 和 Foundation 提供的**當前批次** `Job[]`，原樣回傳既有 `JobWithMatch[]`；不自行選履歷、不重新排序、不計算分數或等級。40 筆自動提交時，Foundation 的 `getConfirmedResume` 注入點仍負責取得當下已確認履歷；此步尚未與 App 接線。

Files changed:

- `src/services/real104BatchMatcher.ts`：新增 `matchReal104BatchJobs`，型別直接符合 `Real104BatchDependencies['matchJobs']`，只委派現有 Matching。
- `tests/real104BatchMatcherAdapter.test.ts`：新增具體 Matcher 與 Foundation 的 Adapter 契約測試。
- `docs/jobquest-real104-batch-matcher-adapter.md`：本報告。

| 契約 | 結果 |
| --- | --- |
| partial 已提交 batch 與同一個已確認履歷送進既有 Matching | PASS |
| 27 筆 partial 可匹配，Adapter 無十筆上限 | PASS |
| 第 40 筆觸發 Matching，使用該時點的已確認履歷與恰好 40 個 current jobs | PASS |
| Adapter 不改輸入 identity／首次接受順序，也不改 Matching 回傳結果 | PASS |
| 下一批 Matching 輸入不含前批 seen jobs | PASS |
| partial Matching 失敗時仍 collecting，current／seen 未變 | PASS |
| 40 筆 Matching 失敗時全部 current 可還原，未進 presented | PASS |

Foundation 仍是唯一決定 `presented` 轉換的模組：Matcher 成功且 batch state 寫入成功後才標示 presented；失敗則回報 `MATCHING_FAILED` 並保留 collecting。既有 Matching 的分數、等級與排序邏輯完全未修改；相關回歸另行驗證。

Verification（按工作項順序）：

1. 新 Matcher Adapter tests：**7 PASS / 0 FAIL**。
2. Batch Foundation tests：**40 PASS / 0 FAIL**。
3. Matching regressions：**82 PASS / 0 FAIL**（`matchingEngine` 與 `real104MatchingFlow`）。
4. 其餘 REAL 104、舊 session、地區、snapshot/action regressions：**287 PASS / 0 FAIL**。
5. Typecheck：**PASS**（production `npm run typecheck`；新增測試另作 TypeScript 檢查）。
6. Production build：**PASS**（既有 Vite chunk-size 警告）。
7. Full suite：**2246 PASS / 5 FAIL**。五項 PDF reconstruction 失敗的名稱及完整錯誤訊息與既有基線 JSON 完全相同；**新回歸 NONE**。

Matching core changed: **NO**。Batch domain changed: **NO**。App/UI changed: **NO**。Connector changed: **NO**。sessionStorage Adapter changed: **NO**。Database/RLS/Auth/Resume changed: **NO**。

此處驗證的是具體 Matcher Adapter 與 Foundation 的接合；真正 App 的履歷來源、Connector 多頁擷取和 Quest Board 呈現仍待後續整合及使用者驗收。

STOP.
