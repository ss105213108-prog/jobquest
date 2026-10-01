# JOBQUEST REAL104 FULL-PAGE CAPTURE

**Type:** IMPLEMENTATION  
**Final status:** **REAL104_FULL_PAGE_CAPTURE = PASS**

## 實作結果

Connector 在使用者主動擷取時，依目前 104 搜尋結果頁的 DOM 順序走訪所有已載入卡片，接受所有通過既有欄位驗證的有效職缺；不再於第十筆停止。沒有固定每頁 17、20 或其他數量，也沒有自動翻頁、捲動或背景抓取。

background worker 與 App payload parser 不再因合法 payload 超過十筆而拒絕。sourceKey `104:{jobId}`、canonical URL、欄位／來源／版本／時間驗證及 normalization 保持；任一 payload Job 無效或同包有重複 sourceKey，仍整包拒絕。擷取 DOM 時的同頁重複卡片仍依原規則保留首次。worker 仍只保存最近一次 capture；無效的新擷取不覆蓋上一份有效 payload。

## 檔案變更

| 檔案 | 變更 |
| --- | --- |
| `browser-extension/jobquest-104-connector/capture-jobs.js` | 移除 `MAX_JOBS = 10` 與收滿十筆的 `break`。 |
| `browser-extension/jobquest-104-connector/service-worker.js` | 只移除 payload 十筆上限；其他驗證、sender 限制、儲存 key／latest 行為及 TTL 保留。 |
| `src/integrations/job104/schema.ts` | 移除 payload 十筆長度拒絕；非空與逐筆驗證、整包拒絕、sourceKey 唯一維持。 |
| `src/integrations/job104/types.ts` | 加註現存 `JOB104_MAX_JOBS = 10` 只供 legacy REAL snapshot 使用；未改該常數數值。 |
| Extension `manifest.json`、`README.md` | 修正「最多十筆」說明，權限與 origin 不變。 |
| `tests/real104FullPageConnector.contract.test.ts` | 增加 client 整頁接收，以及第十筆後的 malformed／duplicate 整包拒絕、worker 保留原 latest payload 測試；worker fake clock 固定為 fixture 時間。 |

未修改 Batch／pendingJobs、Matching、sessionStorage adapter、Quest Board、DB／RLS／Auth／Resume。`real104Session.ts` 的十筆 snapshot 格式上限原樣保留；移除 capture 上限沒有擴張 legacy session schema。對 Batch Foundation、兩個 Adapters、batch hook、App、Board、舊 REAL session 與 normalization 共八個 production 檔做前後 SHA-256 比對，全部一致。

## 驗證結果

| 檢查 | 結果 |
| --- | --- |
| full-page Connector 新契約 | **14/14 PASS**，含 17／19／22 筆、DOM 順序、跳過無效卡、同頁去重、App parser／client、worker 全頁保存及 latest ownership。 |
| Connector regression | **12/12 PASS**，含遷移後合法超過十筆的 parser 契約。 |
| REAL session／REAL Matching 回歸 | **137/137 PASS**。與前兩項合計 **163/163 PASS**。 |
| Batch Foundation | **39 PASS / 1 EXPECTED RED**；唯一 RED 是超額候選保存 pending，未在此票實作。原 G34 full-page 接收測試現已 PASS。 |
| Batch Storage／Matcher Adapter | **17/17 PASS**。 |
| 原 Batch App Integration | **11/11 PASS**。另三個 full-page continuous App 契約仍 EXPECTED RED；上述 Batch／Adapter／App 同跑為 **67 PASS / 4 EXPECTED RED**。 |
| Production Typecheck | **PASS**。 |
| 修改後 Connector tests TypeScript 檢查 | **PASS**。 |
| Production build | **PASS**。 |
| Full suite | **2273 PASS / 27 FAIL**：**22 EXPECTED RED + 5 PDF baseline failures**，**UNEXPECTED REGRESSION = 0**。 |

Full suite 的 22 個 EXPECTED RED 都在上一輪 legacy contract migration 的 32 個 RED 名單內；本輪使整頁 Connector 的八個 RED、App parser 的 migrated case 與 Batch G34 共十個轉綠。剩餘失敗是 pending／v2 session、下一批與 legacy-to-continuous App flow；5 個 PDF baseline 的名稱及完整 failure message 逐項比對均相同。沒有刪除、skip、放寬或標記 expected-failure 來取得結果。

## 驗證界限與後續

這個 PASS 僅對本票的 full-page capture／payload 接收範圍成立。全套仍非全綠，完整 continuous batch 尚未完成：現有 Batch 超額候選仍未保存 pending，舊 REAL 單頁 lane 對新整頁 import 的切換／提示亦仍由既有 RED 契約追蹤。不能由本報告宣稱跨批無損續接或新版 App 人工驗收 PASS。

Extension 需重新載入本地套件才會執行新擷取腳本；本輪以正式腳本與 test-only DOM／Chrome fake 驗證，未操作真實 104 或執行新的人工驗收。STOP。
