# JOBQUEST CONNECTOR PRODUCTION ORIGIN

日期：2026-10-01

**Final：CONNECTOR_PRODUCTION_ORIGIN = PASS**

本次完成 Extension 的 production origin 支援及自動驗證。僅允許以下兩個 origin：

- `http://localhost:5173`
- `https://jobquest-snowy.vercel.app`

## 修改範圍

| 檔案 | 修改 |
| --- | --- |
| `browser-extension/jobquest-104-connector/manifest.json` | 保留 localhost match，加入 `https://jobquest-snowy.vercel.app/*`。描述改為暫存資料僅提供給允許的 Job Quest 網站。 |
| `browser-extension/jobquest-104-connector/app-bridge.js` | 對目前頁面的 origin 使用明確 allowlist；原有同視窗、同 origin、channel、command、request ID 檢查保留。成功／錯誤回應的 `targetOrigin` 都限定目前已核准的頁面 origin。 |
| `browser-extension/jobquest-104-connector/service-worker.js` | `isAppBridgeSender` 以 URL parser 取得 sender origin，再核對相同的兩項 allowlist。其他 worker 行為未改。 |
| `browser-extension/jobquest-104-connector/README.md` | 更新支援網址、權限範圍及重新載入說明。 |
| `tests/connectorProductionOrigin.test.ts` | 新增 38 個 manifest、bridge、worker 及兩者往返的 origin／安全邊界測試。 |
| `docs/jobquest-connector-production-origin.md` | 本報告。 |

Manifest 的 `/*` 僅匹配指定 host 下的路徑，沒有加入任意 host wildcard、`<all_urls>`、Vercel preview 網域或新 `host_permissions`。既有 `activeTab`、`scripting`、`storage` 權限保持不變。104 擷取仍使用既有手動 `activeTab` 流程。

`src/integrations/job104/connectorClient.ts` 已依 `window.location.origin` 傳送並核對訊息，無需修改。119 個受保護檔案（全部 src，以及 capture script、popup JS／HTML）的 SHA-256 與修改前一致。worker 的 payload validation、latest capture 回應及 TTL 區塊與修改前 source 比較完全相同。

未修改 capture、payload validation、Batch／pending／下一批、Matching、App、Supabase／Auth／DB／RLS／Resume；未重新部署 Vercel。重建後的 HTML／JS／CSS 雜湊也與既有 production deploy 報告一致。

## 安全邊界驗證

- localhost 與正式站皆可經實際 bridge／worker 腳本進行 STATUS、GET_LATEST、CLEAR 訊息往返，回應只送往該頁 origin。
- 未授權 host、同名偽裝 host、子網域、Vercel preview、不同 protocol／port、`127.0.0.1`、URL userinfo 偽裝、query 內嵌正式網址、無效或缺少 sender URL 都被拒絕。
- 頁面即使同在 allowlist，來自另一個 origin 或另一個 window 的訊息仍被拒絕。
- 原有 channel／command／request ID 限制保持；App 仍不能 STORE_CAPTURE。寫入 capture 僅允許本 Extension 的 `popup.html`。
- 未授權 sender 不會取得、清除或覆蓋既有 latest capture。

## Verify

| 檢查 | 結果 |
| --- | --- |
| 新 production origin tests | 38/38 PASS |
| Connector／REAL104／Batch／session／region／Matching／Snapshot／ghost saved job regressions（21 個檔案，含新測試） | 530/530 PASS |
| Typecheck：`npm run typecheck` | PASS |
| Production build：`npm run build` | PASS；既有大於 500 kB bundle 提示仍存在 |
| bridge／worker `node --check` | PASS |
| Manifest JSON／MV3／版本格式／引用檔案存在／明確 hosts／原有權限 | PASS |
| Full suite | **2384 PASS / 5 FAIL / 0 skipped** |
| Known PDF failures | SAME：與前次 cleanup baseline 的測試名稱及完整 failure messages 相同 |
| New regressions | NONE |

Full suite exit code 為 1，原因僅為以下已知 baseline；不是整套全綠：

1. RP-014 approved reconstruction behavior — does not interleave sidebar content with the main experience region
2. RP-014 approved reconstruction behavior — keeps two-column sections in their own reading-order regions
3. RP-014 approved reconstruction behavior — rejoins contiguous CJK heading fragments without inserting spaces
4. RP-014 approved reconstruction behavior — separates same-Y text that belongs to different columns
5. RP-014 public PDF parser reproduction — does not merge same-Y anonymous PDF fragments from separate columns

機器可讀證據：`%TEMP%/jobquest-connector-origin-regressions.json`、`%TEMP%/jobquest-connector-origin-full.json`。比對 baseline 為 `%TEMP%/jobquest-connector-cleanup-full.json`；受保護檔案快照為 `%TEMP%/jobquest-connector-origin-before.json`。

## 套用與人工驗收界線

1. 在 `chrome://extensions` 或 `edge://extensions` 找到既有 Job Quest 104 Connector，按重新載入。
2. 重新整理 localhost 或正式 JobQuest 分頁，讓更新後的 app bridge 注入。
3. 沿既有手動流程在 104 搜尋結果頁擷取，再回 JobQuest 匯入。若使用無痕模式，使用者需自行確認 Extension 已允許在無痕模式中執行。

本次沒有在使用者的外部 Chrome／Edge 載入 Extension 或執行真實 104 擷取，因此 **loaded-extension／正式站人工 Connector acceptance：NOT VERIFIED**。PASS 指上述 implementation 與自動／靜態驗證，不代替人工驗收，也不表示 Supabase production Auth URL 已驗收。
