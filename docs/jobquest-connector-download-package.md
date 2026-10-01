# JOBQUEST CONNECTOR DOWNLOAD PACKAGE

日期：2026-10-01

## Implementation

未偵測到 Connector 時，直接顯示「下載 104 Connector」，連到 [production ZIP](https://jobquest-snowy.vercel.app/downloads/jobquest-104-connector.zip)。使用同源 `<a download>`，不增加 Extension downloads 權限。安裝說明可展開，明確指出 ZIP 無法直接安裝。

1. 下載 ZIP。
2. 解壓縮 ZIP。
3. 開啟 `chrome://extensions` 或 `edge://extensions`。
4. 開啟 Developer Mode（開發人員模式）。
5. 選擇 Load unpacked（載入未封裝項目）。
6. 選擇解壓後包含 `manifest.json` 的資料夾。
7. 重新整理 Job Quest，再按「檢查 Connector」。

只修改 `Job104ConnectorControls` 的 missing-extension 安裝區域。checking／no-capture／ready／其他狀態與 refresh／import callback、disable 條件皆沿用既有邏輯。不改 Auth、Supabase、Batch、Matching、Connector 核心或設定。

## Package contents

檔案：[public/downloads/jobquest-104-connector.zip](../public/downloads/jobquest-104-connector.zip)，6,120 bytes。SHA-256：`B418BEEB1A7017A7B219BF24C605C52915DA2120C3AA704781DFB5FAAB7BF9E8`。

ZIP 根目錄包含 7 個 runtime 檔案：`manifest.json`、`service-worker.js`、`app-bridge.js`、`capture-jobs.js`、`popup.html`、`popup.js`、`popup.css`。版本 `1.0.0`，完全取自目前已驗證的 `browser-extension/jobquest-104-connector/`，逐檔 bytes／SHA-256 相同。沒有 README、tests、credentials、env、experiments 或其他 dev artifacts。

Manifest V3 的 background、popup、content-script 路徑在解壓後均存在；popup 的 CSS／JS 與動態注入 `capture-jobs.js` 也包含於套件。只允許 localhost 與正式 Job Quest origin 的既有限制不變。

打包使用標準 ZIP／Deflate，固定 entry 時間與明確 7 檔 allowlist，不從整個開發資料夾直接壓縮。未來若 Extension runtime 更新，需重新產生 ZIP、逐檔 hash 核對並重新部署，不能把目前 ZIP 視為會自動跟隨 source 更新。

## Verification

| Check | Result |
| --- | --- |
| ZIP allowlist / source bytes | PASS，恰好 7 檔且逐檔 SHA-256 相同 |
| Extract / manifest references / runtime JS syntax | PASS，標準解壓縮成功、引用存在、4 個 JS 的 `node --check` PASS |
| Build output ZIP | PASS，`dist/downloads/jobquest-104-connector.zip` 與 public ZIP SHA-256 相同 |
| New UI tests | 3/3 PASS；missing 顯示下載與 7 步說明，ready／no-capture 保留控制項 |
| Relevant regressions | 526/526 PASS；Connector、REAL104、Batch、Matching、Snapshot、Auth 與 manualAcceptanceFlow |
| Full suite | 2387 PASS／5 FAIL／0 skipped；5 個 RP-014 PDF baseline failure 名稱與 failureMessages 完全相同，無新 regression |
| Typecheck / production build | PASS；既有 bundle size warning 保留 |
| Browser UI QA | PASS，實際 component + 既有 CSS 的 isolated fixture，下載在 collapsed details 外可見、可展開 7 步說明；ready 原 import 控制項仍正常。不是 native Extension acceptance |
| Production ZIP HTTP / hash | PENDING_DEPLOYMENT |
| Git push / Vercel auto deploy | PENDING_DEPLOYMENT |
| Chrome / Edge Load unpacked from downloaded ZIP | NOT VERIFIED；目前 automation 只有 IAB，不能操作外部 Extensions 頁面 |
| Freshly installed ZIP detected by production Job Quest | NOT VERIFIED；需外部 Chrome／Edge 人工證據，不用 fixture 取代 |

目前狀態：PENDING_PRODUCTION_AND_NATIVE_ACCEPTANCE。完成 production HTTP／hash 與 Git deployment 檢查後更新本文件。既有 source 的人工 PASS 不會直接當成此次下載 ZIP 的新安裝驗收。
