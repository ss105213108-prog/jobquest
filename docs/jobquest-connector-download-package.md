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
| Production ZIP HTTP / hash | PASS；實際下載 HTTP 200、Content-Type `application/zip`、6,120 bytes、SHA-256 與 local 完全相同；正式下載檔再解壓，7 檔逐一與 source hash 相同 |
| Git push / Vercel auto deploy | PASS；commit `70375ecea38d53f24f7b903fc2c5b7092ca3917b` → `dpl_GNZ8BqpRQAnFtmyynHgn9CYMd6hA`；`source = git`、`target = production`、`readyState = READY` |
| Production domain / homepage | PASS；`jobquest-snowy.vercel.app` 仍屬原 project 並指派新 deployment，`aliasAssigned = true`、`aliasError = null`；首頁 HTTP 200，正式 JS bundle 包含下載入口 |
| Protected product / configuration files | PASS；除授權 UI 檔案外，293 個 tracked files SHA-256 全部未變，包含 Extension runtime、Batch、Matching、Auth、Supabase 與 config |
| Chrome / Edge Load unpacked from downloaded ZIP | NOT VERIFIED；目前 automation 只有 IAB，不能操作外部 Extensions 頁面 |
| Freshly installed ZIP detected by production Job Quest | NOT VERIFIED；需外部 Chrome／Edge 人工證據，不用 fixture 取代 |

**Final：BLOCKED_CONNECTOR_DOWNLOAD_PACKAGE**

實作、ZIP、正式下載與自動部署已完成。尚缺此次正式下載 ZIP 在外部 Chrome／Edge 的 Load unpacked、正式站實際 missing 狀態入口，以及安裝後 Connector 偵測／匯入人工證據。使用者已收到正式下載網址與這三項驗收要求；目前 browser inventory 只有 Codex IAB 與 MCP Apps，沒有可操作的外部 Chrome／Edge。這是驗收工具限制，不是已觀察到的套件失敗；未以 static／fixture PASS 取代 native acceptance，也未重試 GitHub／Supabase 內建瀏覽器登入。

既有 source 的人工 PASS 不會直接當成此次下載 ZIP 的新安裝驗收。收到這次人工結果後再更新狀態。AI／PDF production runtime 仍為 Pending，1111 仍為 Roadmap。

本證據更新會以 docs-only follow-up commit 保存，push 後再確認自動部署與 clean Git status；實際 follow-up SHA 見 [main history](https://github.com/ss105213108-prog/jobquest/commits/main/)。
