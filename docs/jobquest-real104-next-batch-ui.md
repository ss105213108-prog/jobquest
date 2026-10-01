# JOBQUEST REAL104 NEXT BATCH UI

日期：2026-09-30。Type：INTEGRATION。

Final status: **READY_FOR_REAL104_NEXT_BATCH_MANUAL_ACCEPTANCE**

## 完成行為

presented Batch 顯示批號、已配對筆數、待續職缺數及「下一批」。collecting 顯示目前第幾批、N/40、待續數，保留原 partial commit／40 筆 Matching retry；collecting 不顯示下一批按鈕。

按鈕透過 `useReal104Batch.nextBatch()` 委派既有 V2 domain `startNextBatch`，不在 UI 自行搬移 current/pending/seen。前批 presented IDs 加入 seen、pending 優先填入下一批、pending 不足 40 時等待後續使用者匯入，完全沿用已 PASS 的 V2 規則。

例：21＋20 → Batch 1 配對 40、待續 1；按下一批 → Batch 2 收集 1/40，第一筆為先前保存的 pending。匯入後續頁面時，前批 seen 與目前 sourceKey 仍會略過。沒有自動開啟下一頁或擷取。

切批期間用既有 Matching busy state 停用按鈕／匯入／搜尋，並以同一操作 epoch 的同步 ref 防止重複點擊。若搜尋、UID 或清除操作使 epoch 失效，延遲結果不能覆寫新畫面。相同 UID 與操作仍有效時，publish domain 的新 view；pending 已滿 40 的 Matching 結果直接沿用，不重複配對。

Storage failure 顯示既有 error，保留 presented 與 pending，可再按一次重試。pending 已滿 40 而 Matching 失敗時，顯示新批次 collecting 40＋剩餘 pending，沿用目前 40 筆 retry。F5 還原批號、current/pending/seen；presented 以目前 Confirmed Resume 重算，collecting 不自行 Matching。

## 變更範圍

- `src/hooks/useReal104Batch.ts`：新增 nextBatch UI operation、busy／連點／延遲結果保護。
- `src/components/search/Real104BatchProgress.tsx`：presented 的下一批控制與 pending count，沿用現有 primary-button 樣式。
- `src/pages/BoardPage.tsx`：接入 onNext callback。
- `tests/real104BatchAppIntegration.test.tsx`：將上一票「暫不提供下一批 UI」契約更新為本票批准的按鈕流程，保留 pending／seen／F5 斷言並新增 9 個 UI integration cases。

未修改 V2 domain、Storage Adapter、Matcher Adapter、Matching service、capture script、background worker、payload schema、legacy REAL session。本輪前後以上八個檔案 SHA-256 相同。DB/RLS/Auth/Resume 沒有改動。

## 自動驗證

| 檢查 | 結果 |
| --- | --- |
| App integration（含 next-batch UI） | 23/23 PASS |
| 既有 Batch Foundation | 40/40 PASS |
| Continuous contract | 20/20 PASS |
| V2 pending/restore boundaries | 15/15 PASS |
| Storage / Matcher Adapters | 10/10、7/7 PASS |
| 19 個 Batch／Connector／REAL／Matching／Snapshot suites 的 focused run | 468/468 PASS；其後新增兩個延遲結果 cases 亦 PASS，並包含於 full suite |
| App 與更新測試 Typecheck | PASS |
| Production build | PASS |
| Full suite | **2340 PASS / 5 FAIL** |
| 新 regression | **NONE** |

五個失敗的 fullName 與完整 failureMessages 逐項符合前票 V2 baseline，皆為已記錄的 RP-014 PDF reconstruction failures。沒有 skip、刪除或弱化 PDF tests，也沒有其他 EXPECTED RED。證據：系統 TEMP 的 `jobquest-next-batch-ui-full.json`，baseline 為 `jobquest-continuous-batch-v2-full.json`。

App cases 覆蓋：21＋20 → pending 1、Batch 1→2→3 不重複、pending 立即消耗、seen 排除、full pending 只 Matching 一次、連點停用、pending 空時等待手動匯入、presented／collecting F5、keyword／region reset、Storage／Matching 失敗重試、延遲結果不覆蓋新搜尋／另一 UID 畫面。

## 瀏覽器驗證範圍

使用暫時的本機隔離 QA 頁，載入正式 `useReal104Batch`、進度元件、Matching adapter 與真正 sessionStorage。fixture 只提供固定本機 profile／UID／capture，不登入、不讀寫 Supabase。頁面完成後已關閉，兩個暫時 source files 已移除。

實際點擊／重新整理已驗證：

1. 21＋20 完成 Batch 1，顯示下一批與待續 1。
2. 按下一批立即顯示 Batch 2 的 1/40；seen 40，current 為 pending 首筆。
3. reload 保持 Batch 2、1/40 與 seen 40。
4. 後續頁含前批重複 sourceKey，Batch 2 仍只匹配新 40，待續 1。
5. 再按下一批，Batch 3 為 1/40，seen 80；reload 後相同。
6. 換 keyword 回 Batch 1、0/40、pending 0、seen 0。

畫面：[隔離 UI 瀏覽器證據](C:/Users/user/.codex/visualizations/2026/09/29/01a0eb07-2eb1-7013-9686-e1339b2534ac/real104-next-batch-ui.png)。下一批按鈕、批號與 pending count 可見且無重疊。

這是正式 UI/hook 的隔離瀏覽器驗證；**不是**真實 104 capture、正式登入 App 或使用者產品人工 PASS。真實端到端仍待使用者 acceptance。

## 人工驗收步驟

1. 在已確認履歷與 REAL 104 模式下明確開始搜尋，依序「擷取一頁 → 回 App 匯入」。每頁有效筆數依實際頁面，不預設 21 或 20。
2. 累積跨過 40 後確認 Batch 1 呈現 40、待續顯示 overflow 數，並出現下一批。
3. 按下一批，確認 Batch 2 先顯示待續職缺；若少於 40，畫面為 N/40 且等待後續頁面，不呈現前批卡片。
4. 重新整理，确认第幾批、N/40 與待續數不變；再匯入後續頁面，前批 sourceKey 不得再次出現。
5. 完成 Batch 2 後再按下一批，確認 Batch 3 從剩餘候選接續；可用原始 104 job URL 身份核對不重複。
6. 改 keyword 或 region 開始新搜尋，確認回到 Batch 1、0/40、待續 0；可重新接受新 fingerprint 的候選。

普通 capture 仍僅保留 Extension 的最近一頁；每頁需先匯入，再擷取下一頁。沒有改動 TTL、latest-capture 或 Connector 診斷契約。

STOP。
