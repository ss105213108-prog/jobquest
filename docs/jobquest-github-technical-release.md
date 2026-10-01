# JOBQUEST GITHUB TECHNICAL RELEASE

日期：2026-10-01

目前狀態：**PENDING_REMOTE_VERIFICATION**。尚未宣稱 commit／push／GitHub render 完成。

## Release scope

初始資料夾不是 Git repository；git status／remote／branch 都回報 no repository。已初始化 `main`。GitHub Connector 及完成外部 device flow 後的 `gh auth status` 已確認 owner `ss105213108-prog`，CLI 登入有效；未重試內建瀏覽器登入。

已確認同名 repository 不存在，再建立公開 [ss105213108-prog/jobquest](https://github.com/ss105213108-prog/jobquest)，設定 `origin = https://github.com/ss105213108-prog/jobquest.git`，homepage 為正式網址。

新增 [完整 README](../README.md)、[架構說明](architecture.md)、[截圖與來源](screenshots/README.md)、[read-only release guard](../scripts/verify-release.mjs)。`.gitignore` 排除所有 env（只保留無 key 的 `.env.example`）、generated／work／Vercel／test reports、常見憑證。

`.gitattributes` 將 PDF／DOCX／PNG 標為 binary，保留 fixtures 與 screenshot 原始 bytes；沒有為清除既有 whitespace 提示而修改 production 或測試。

提交身份使用此 repository 專用的 GitHub handle／noreply email，不修改全域 Git 設定。

本工作項目不修改產品、測試、schema、Auth 或 Connector 功能，也不重新部署。[Live Demo](https://jobquest-snowy.vercel.app) 的公開 Auth 入口已直接讀取並截圖。

## Product acceptance status

| 項目 | 狀態／證據 |
| --- | --- |
| Production manual acceptance | **PASS**；2026-10-01 使用者人工回報正式站可正常使用 |
| Production Connector | **PASS**；使用者已在正式網址人工驗收，`CONNECTOR_PRODUCTION_ORIGIN = PASS` |
| REAL104／Matching／Batch／Next Batch production flow | **PASS**；使用者回報正式流程正常 |
| AI／PDF production runtime | **Pending**；尚未完成，不宣稱上線 |
| 1111 | **Roadmap**；尚未完成 |

Production 人工證據來源為 **USER_MANUAL_BROWSER_TEST**。GitHub push／render 是否完成另由本 release 驗證；不能混用 Pending remote verification 與已 PASS 的 production manual acceptance。沒有由人工回報推定 Supabase Dashboard 的 URL 實值。

## 待完成驗證

- GitHub repository 名稱／visibility／origin。
- staged blobs 的敏感資料與 portable README／架構／截圖 links。
- 首次 commit／push，remote SHA 與本機 HEAD 一致。
- GitHub README 與圖片、Mermaid 正常呈現。
- protected production hashes unchanged。
- release record 完成後 commit／push，最終 git status clean。

尚未完成的欄位在驗證後更新；不把預計網址當 actual repository URL。

## Pre-push verification

- 376 個 staged files：可辨識的 secret／token／JWT／service-role／private key findings 為 0；另檢視 13 個 credential-like literal 候選，皆為測試 mocks、assertion 或合成 sentinel，非 live credentials。
- `.env.local`、各種 `.env.*`、`.vercel`、`.vitest`、node_modules、dist、work、Supabase CLI temp 與常見憑證均排除；`.env.example` 的 publishable key 空白。
- 35 個入口文件的 relative links：存在且包含於 release，包含 screenshot 與 migrations directory。
- 290 個既有 source／Extension／tests／config／migrations SHA-256 與 release 前一致，產品程式碼未變。
- 新 release 文件／metadata 的 whitespace check PASS。初次加入的歷史 source／Markdown 有既有 EOF／hard-break whitespace 提示，不改產品以消除該非功能性提示。
- [先前完整測試](jobquest-connector-production-origin.md)：2384 PASS／5 個相同 PDF baseline FAIL。此 release 只新增文件／metadata／read-only guard，沒有產品或測試變更，不重跑無關 PDF 診斷。
