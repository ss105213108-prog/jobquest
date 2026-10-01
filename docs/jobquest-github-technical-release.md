# JOBQUEST GITHUB TECHNICAL RELEASE

日期：2026-10-01

**Final：JOBQUEST_GITHUB_TECHNICAL_RELEASE = PASS**

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

## GitHub release verification

| 項目 | 結果 |
| --- | --- |
| Repository | [ss105213108-prog/jobquest](https://github.com/ss105213108-prog/jobquest)，Public |
| Branch / origin | `main`；`https://github.com/ss105213108-prog/jobquest.git` |
| GitHub CLI | 已登入正確 owner，HTTPS protocol；credential 保留於系統 keyring，未放入 repository |
| 首次 commit | [37f1a0ce56146595fa15751e8993d49aac35582b](https://github.com/ss105213108-prog/jobquest/commit/37f1a0ce56146595fa15751e8993d49aac35582b)：`Initial technical release: Job Quest Guild` |
| 首次 push | PASS；`main` tracking `origin/main`，GitHub commits API SHA 與 local HEAD 相同 |
| Remote tree | 376 個 blob paths 與已掃描 local index 一致；沒有 env／credentials／generated private paths |
| GitHub README | PASS；匿名公開瀏覽器可讀完整標題、表格、程式區塊、功能與驗收狀態 |
| README images | PASS；兩張圖片 complete=true，原始尺寸 1280×720 與 855×656 |
| Mermaid | PASS；README 一張 flowchart，以及 architecture 的 composition／capture sequence／batch state 共三張圖，GitHub 已呈現 diagram content |
| Docs / screenshots links | PASS；入口相對連結可在 tracked tree 解出，architecture 與 migration directory 亦已在 GitHub 實際開啟 |
| Live Demo | 正確指向 `https://jobquest-snowy.vercel.app`；公開入口直接載入，正式流程另外依使用者人工 PASS 記錄 |
| Initial push 後工作目錄 | CLEAN，`main...origin/main`，沒有未提交差異 |
| Product code changed | **NO**；290 個 protected files 的 SHA-256 與 release 前相同 |

首次 commit／push 驗證完成後，本報告以獨立的 docs-only commit 記錄實際結果；不 amend、不 force push。該 follow-up commit 的實際 SHA 由 [GitHub main history](https://github.com/ss105213108-prog/jobquest/commits/main/) 記錄，push 後另以 CLI 核對最終 SHA 與 clean status。

## Pre-push verification

- 376 個 staged files：可辨識的 secret／token／JWT／service-role／private key findings 為 0；另檢視 13 個 credential-like literal 候選，皆為測試 mocks、assertion 或合成 sentinel，非 live credentials。
- `.env.local`、各種 `.env.*`、`.vercel`、`.vitest`、node_modules、dist、work、Supabase CLI temp 與常見憑證均排除；`.env.example` 的 publishable key 空白。
- 36 個入口文件的 relative links：存在且包含於 release，包含 screenshot 與 migrations directory。
- 290 個既有 source／Extension／tests／config／migrations SHA-256 與 release 前一致，產品程式碼未變。
- 新 release 文件／metadata 的 whitespace check PASS。初次加入的歷史 source／Markdown 有既有 EOF／hard-break whitespace 提示，不改產品以消除該非功能性提示。
- [先前完整測試](jobquest-connector-production-origin.md)：2384 PASS／5 個相同 PDF baseline FAIL。此 release 只新增文件／metadata／read-only guard，沒有產品或測試變更，不重跑無關 PDF 診斷。

安全結論適用於 actual staged／committed tree 的已辨識格式與禁止路徑；13 個 synthetic fixture literals 保留為測試資料，沒有把它們當 live credentials。secret scan 不宣稱能辨識所有未知憑證格式。`.env.local` 與實際 key 未提交；publishable/public 設定方法保留，service-role key 未提交。

歷史工作項目文件保留當時的 Pending／BLOCKED 等證據，不將舊文件覆寫成新驗收。此次正式 production manual PASS 以本報告、README／architecture 與使用者最新回報為準。

沒有重新部署 Vercel、修改 Supabase 設定、建立產品測試帳號，或開啟 AI runtime／1111 下一階段工作。STOP。
