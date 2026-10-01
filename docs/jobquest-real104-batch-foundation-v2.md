# REAL104 BATCH FOUNDATION V2

依據 `jobquest-real104-batch-capability-investigation.md`、`jobquest-real104-batch-design.md`、`jobquest-real104-batch-test-design.md`、`jobquest-real104-batch-foundation-implementation.md`，並以 `jobquest-real104-batch-foundation-boundary.md` 的最新邊界決議實作。此項只完成批次 Foundation；尚未接 App、真實瀏覽器 sessionStorage 或使用者介面。

Files changed:

- `src/services/real104BatchWorkingSet.ts`：新增批次狀態、驗證與透過 Matcher／Storage Port 的協調器。
- `tests/real104BatchSeams.contract.test.ts`：J55 在 Node 測試環境提供既有 Matcher 所需的最小 `window`，保留原相容性斷言。
- `tests/real104BatchSession.contract.test.ts`：新增 storage 讀取失敗不能覆寫既有批次的回歸測試。
- `docs/jobquest-real104-batch-foundation-v2.md`：本報告。

| 項目 | 結果 | 證據／行為 |
| --- | --- | --- |
| Batch state | PASS | 單一版本化 envelope 維護 collecting／presented、current jobs、seen sourceKeys 與批號。 |
| Search fingerprint | PASS | `JSON.stringify(['REAL_104', keyword.trim(), canonicalRegion])`；不含頁碼、擷取結果或配對排序。 |
| Within-batch dedupe | PASS | 以 `104:{jobId}` 排除 current 中的重複項，保留首次接受順序。 |
| Cross-batch dedupe | PASS | 以相同 canonical sourceKey 排除 seen history。 |
| 40-job cap | PASS | 只接受前 40 個合格 unique jobs；超額計數，不淘汰既有 jobs。 |
| Partial commit | PASS | 1–39 筆可顯式交給 Matcher Port；零筆拒絕。 |
| Full commit | PASS | 接受第 40 筆後自動呼叫 Matcher Port；失敗／缺履歷仍可還原 collecting。 |
| Presented state | PASS | Matcher 成功且 Storage Port 寫入成功後才回傳 presented；seen 尚未增加。 |
| Matcher Port orchestration | PASS | 只傳當前批次 canonical Jobs；不匯入既有 concrete Matching；失敗回傳型別化錯誤。 |
| Storage Port orchestration | PASS | 全份 envelope 經注入的 `getItem`／`setItem` 保存與還原；讀寫失敗不宣稱轉換成功。 |
| Next-batch transition | PASS | presented 後才將 current IDs 併入 seen、清空 current、批號加一，並一次寫入。 |
| Search reset | PASS | 指紋不同時重建 batch 1；相同指紋保留既有狀態。storage 讀取失敗不覆寫未知舊狀態。 |
| Restore validation | PASS | 驗證版本、UID、指紋、phase、批號、容量、canonical Job／URL、唯一性與時間欄位；無效狀態明示。 |
| 30-minute TTL preserved | PASS | 最早已接受 `capturedAt` 為固定 anchor，30 分鐘整有效；後續擷取、presented 與下一批均不延長。 |
| Connector validation boundary preserved | PASS | 先以既有完整 payload validator、搜尋匹配及 normalizer 處理；不修復或部分接受不合法 capture。 |

Focused batch tests: **40 PASS / 0 FAIL**（3 files）。

Existing REAL regressions: **195 PASS / 0 FAIL**（104 integration、臺灣地區／偏好、REAL matching flow）。

Matching compatibility: **13 PASS / 0 FAIL**；批次 J55 另直接驗證既有 concrete Matcher 可接受 canonical Jobs。

Existing REAL session restore regressions: **68 PASS / 0 FAIL**。

Snapshot / actions regressions: **93 PASS / 0 FAIL**。

Production code outside batch foundation changed: **NO**。

Connector changed: **NO**。Concrete Matching changed: **NO**。Direct sessionStorage access added: **NO**。Database changed: **NO**。RLS changed: **NO**。Auth changed: **NO**。

Typecheck: **PASS**（production `npm run typecheck`；新增批次測試亦獨立執行 TypeScript 檢查）。

Production build: **PASS**（既有 Vite chunk-size 警告，不影響完成）。

Full suite: **2229 PASS / 5 FAIL**。

Known PDF baseline failures: **SAME**。與先前基線 JSON 比對，五項 PDF reconstruction 失敗的測試名稱及完整錯誤訊息完全相同。

New regressions: **NONE**。

Map storage 與注入的 Matcher 驗證的是 Foundation 契約；同 tab F5、真實 Connector 多頁擷取、App/Quest Board 呈現與 Auth 登出情境仍需後續 integration 與人工驗收。

Recommended next work item: **REAL104_BATCH_INTEGRATION_DESIGN**。

STOP.
