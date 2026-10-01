# JOBQUEST PRODUCTION DEPLOYMENT AUDIT

盤點日期：2026-10-01

**Final：READY_FOR_PRODUCTION_CONFIG**

盤點已完成，可進入 production configuration 工作項目；**目前仍有 deployment blocker，不能直接宣稱完整 REAL104 正式流程可上線**。主要阻擋是尚未選定正式 HTTPS origin、Connector 只允許本機 origin，以及正式 hosting env／Supabase URL 設定尚未驗證。

本次只讀取專案與官方文件，唯一新增檔案為此報告。沒有部署、重建 dist、安裝依賴、修改 Extension／Supabase 或執行登入、資料寫入。Dashboard、hosting 帳戶設定與線上 RLS 狀態沒有查驗，標示為 NOT VERIFIED。

## 1. Frontend build、output、start

| 項目 | 現況與證據 |
| --- | --- |
| Framework | React + TypeScript + Vite，瀏覽器端 SPA；`src/main.tsx` 在根頁掛載 `AuthGateway → App` |
| 安裝 | 有 `package-lock.json`，lockfileVersion 3；後續正式建置建議 `npm ci`，保留 lockfile |
| Build | `npm run build` = `tsc --noEmit -p tsconfig.app.json && vite build`（`package.json`） |
| Output | 預設 `dist/`；現有 `dist/index.html` 與 `dist/assets/` 可讀，沒有自訂 `build.outDir` |
| Development start | `npm run dev` = `vite`；`vite.config.ts:7–9` 指定 localhost、5173、strictPort |
| 本機 build preview | `npm run preview` = `vite preview` |
| Production start | 沒有 `start` script，也不需要常駐 Node App server；正式平台直接提供 `dist/` 靜態檔案 |
| Base／路由 | 沒有自訂 `base`，適合 origin 根路徑 `/`；App 頁面以 React state 切換，未找到 pathname router 或 `/auth/callback`／recovery route |
| Node | 本機 Node `v24.18.0`；lockfile 的 Vite 8.3.0／plugin-react 6.1.1 要求 `^20.19.0 || >=22.12.0`。建議 hosting 建置 runtime 使用 Node 24，並以 lockfile 建置 |

`vite preview` 是本機驗證用途，不能當 production server；`dist` 是 Vite 預設靜態輸出。[Vite static deployment](https://vite.dev/guide/static-deploy.html)

上一工作項目於本次對話已完成 Typecheck／build；本次沒有重新執行會寫入輸出的 build。現有 bundle 是 `dist/assets/index-C0uNNJTy.js`。這不構成已部署證據。

## 2. 部署平台與現有設定

**建議：Netlify 靜態 hosting。** 此專案已有標準 Vite build／dist 結構，Netlify 的 Vite 設定可直接使用 `npm run build` 與 `dist`，不需為此改成 SSR 或增加網站 backend。[Netlify Vite guide](https://docs.netlify.com/build/frameworks/framework-setup-guides/vite/)

| Hosting 設定 | 建議值 |
| --- | --- |
| Base directory | 此專案根目錄；在未來 repository 的位置依實際 layout 指定 |
| Build command | `npm run build` |
| Publish directory | `dist` |
| Node runtime | Node 24（建置環境） |
| Website URL | 使用者選定的穩定 HTTPS origin，以下稱 `<JOBQUEST_PRODUCTION_ORIGIN>`；尚未提供實值 |
| 網站發佈內容 | 只發佈 `dist/`，不把專案根目錄、`.env.local`、scripts、supabase 或 Extension source 當 public directory |

未找到 `netlify.toml`、`vercel.json`、`.netlify/`、`.vercel/`、`.github/workflows/`、`Dockerfile`、`wrangler.toml`、`.openai/hosting.json` 或 `_redirects`。目前 checkout 沒有 `.git/`。這只證明本機沒有相應設定，**不證明帳戶端沒有網站或部署**；hosting account／Git remote／domain ownership 均 NOT VERIFIED。

可先在平台設定 build／env；`netlify.toml` 是之後版本化設定的可選項，不是本次需建立的檔案。現在沒有 path route，不需為虛構 callback 加 rewrite。未來若新增路由，需另核對 SPA fallback。

## 3. Frontend env 與 Supabase key

前端的自訂 env 只找到以下兩項，均由 `src/lib/supabase.ts:6–7` 讀取：

| Env | 正式值來源與要求 |
| --- | --- |
| `VITE_SUPABASE_URL` | `https://neqwkiruqfevlchiajor.supabase.co` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | JobQuest 同一專案目前有效的 publishable key；从該專案 Dashboard 的 Connect／API Keys 取得，放在 hosting 的 build env。**不在本報告列出完整 key** |

`src/lib/supabase.ts:4–14` 固定預期 project ref `neqwkiruqfevlchiajor`；URL 不一致會產生 `BLOCKED: SUPABASE_TARGET_MISMATCH`，缺 env 也無法建立 client。因此不能只用 env 任意切換到另一個 production Supabase project；另選專案需獨立授權設計／設定變更。

現有 `.env.example` 有正確 URL，publishable key 留空；`.env.local` 有同一 URL 與 `sb_publishable_…` 格式 key。`.gitignore` 排除 `.env`、`.env.local`、`.env.*.local`；**並未一概排除所有 `.env.*`**。沒有找到 `.env.production`。未來不需要把 `.env.local` 上傳 hosting，也不建議為正式 key 新增會被納入版控的 env 檔。

Vite 將 `VITE_*` 在 **build time** 放入 client bundle；平台 env 改變後要重新建置。現有 dist 可見預期 Supabase URL 與 publishable key，符合公開 client 用法。其他 env 使用是 `import.meta.env.DEV` 診斷 gate，不是需要提供的 production value。`VITE_APP_ORIGIN`／`VITE_SITE_URL`／`VITE_CONNECTOR_ORIGIN` 都不是目前支援的設定。[Vite env](https://vite.dev/guide/env-and-mode.html)

### Secret exposure 結論

**未發現 frontend secret exposure。** 掃描 359 個專案文字檔，包括 src、Extension、env／設定、scripts、tests／docs 與現有 dist，未找到實際 `sb_secret_…` key、解碼 role 為 `service_role` 的 JWT，或實際 OpenRouter secret。前端沒有讀取 service-role／secret／OpenRouter credential 的 env。key 的完整內容沒有輸出到報告或工具 log。

Publishable key 可放在瀏覽器；secret／service-role 可繞過 RLS，不能進入 `VITE_*`、網站 output 或 Extension。公開 key 並不取代資料存取的 RLS；本次沒有重新審計線上 policies／grants。[Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys)

此結論針對目前可讀 source／dist 與可辨識 credential 格式，不是對 Git 歷史、hosting secret store、未讀二進位或未來 build 的保證。

## 4. Connector origin：已確認的 deployment blocker

| 位置 | 現有值／作用 | 後續必要設定 |
| --- | --- | --- |
| `browser-extension/jobquest-104-connector/manifest.json:21` | `content_scripts.matches` 只有 `http://localhost:5173/*` | 加入／改成選定的 HTTPS JobQuest host pattern；讓 bridge 能注入正式網站 |
| `browser-extension/jobquest-104-connector/app-bridge.js:2` | `APP_ORIGIN = 'http://localhost:5173'`；頁面 origin、event origin 及回傳 targetOrigin 都用此值 | 對齊正式 origin，保留原有同視窗／同來源檢查 |
| `browser-extension/jobquest-104-connector/service-worker.js:4,44` | `APP_ORIGIN` 固定 localhost；只接受該 origin 的 App bridge sender | 對齊正式 origin，保留 command 與 sender allowlist |
| `src/integrations/job104/connectorClient.ts` | 使用 `window.location.origin` 傳送／核對訊息 | **不需要修改**；正式頁面目前會因 Extension 沒有 bridge 而回報 missing-extension |

只更新 frontend env 或網站 domain **不能修復此 blocker**；Extension 的 JS／manifest 不會自動讀取 Vite env。三處需同步設定，之後重新載入／發佈新版 Extension。`https://www.…`、無 www、preview hostname 是不同 origin，不能當同一個值。

Manifest 沒有 `host_permissions`；現有 104 擷取使用 `activeTab`／`scripting` 的手動操作，不必為網站部署擴大到 `<all_urls>` 或增加 104 永久 host permission。Production origin 應維持明確受控 host；若需保留本機或 preview，後續配置工作需明確定義，不自動放行所有 preview 網站。

## 5. Supabase Site URL／Redirect URLs 與 Auth

正式設定入口：[JobQuest Authentication → URL Configuration](https://supabase.com/dashboard/project/neqwkiruqfevlchiajor/auth/url-configuration)。目前 Site URL／Redirect URLs 實值 **NOT VERIFIED**；本機 `supabase/config.toml` 只有 project id 與 `parse-resume-ai` 函式設定，沒有這些遠端 Auth 值。

| 項目 | 正式配置要求 |
| --- | --- |
| Site URL | 設為 `<JOBQUEST_PRODUCTION_ORIGIN>/`，取代任何本機預設；先選定真正受控 origin |
| Redirect URLs | 為實際使用的 callback 加入精確正式 URL；目前產品入口是根頁 `/`，沒有 `/auth/callback` 或 `/auth/confirm` 的實作，不假設這些 path 已可用 |
| Development | 若仍需本機 callback，另保留 `http://localhost:5173/`；不要將它當 production Site URL |
| Preview | 只有需要驗證該 preview callback 時才加入受控條目；不要直接放行任意 domain |

Site URL 是未提供 `redirectTo` 時的預設返回 URL；正式 redirect 建議精確路徑。[Supabase Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls)

**目前 username/password 產品沒有 email／OAuth callback 流程。** `usernameAuthService.ts` 使用 `signUp`、`signInWithPassword` 與同 UID `updateUser`；src 未找到 `emailRedirectTo`、`redirectTo`、OAuth 或 password-reset 呼叫。client 的 `detectSessionInUrl: true` 不代表產品已有 recovery／confirmation UI。Site URL 設定仍應對齊網站，但它不能代替 Auth 功能設計。

`authIdentity.ts` 使用內部 `u1.<username>@jobquest.invalid`；沒有可收信 inbox。新註冊／升級需要原核准的直接取得 confirmed identity／session 行為。部署前應只讀核對 Email/password、Anonymous、signups、Confirm email 與 manual linking 仍符合既有驗證契約；不能為部署自動改成 email confirmation／SMTP recovery。

最新 username production design 記錄 Confirm email OFF；對話中使用者已確認 Manual linking ON、Custom SMTP OFF。這些是**先前證據，非本次 live Dashboard 確認**。更早的 real-email audit 曾記錄 Confirm email ON，已由後來的 pseudonymous 設計取代，不可混用。密碼／secure email change／reauthentication 等遠端條件本次未重驗。

換 localhost → 正式 domain 不會帶走 localStorage／sessionStorage 的 Auth session 或 Batch；新網站不要宣稱自動還原本機 Guest。同一永久帳號重新登入後才能沿既有 UID 讀取其雲端資料，本次不設計 Guest 遷移。

## 6. AI Edge Function：條件設定，不是目前 REAL104 前端必要值

`supabase/functions/parse-resume-ai/index.ts` 使用 server-only `SUPABASE_URL`、`SUPABASE_ANON_KEY`、`OPENROUTER_API_KEY` 與 `RESUME_AI_ALLOWED_ORIGINS`。`index.ts:12` 與 `handler.ts:13` 的 CORS 預設只有 `http://localhost:5173`。

目前正式履歷入口／Profile 使用 manual ResumeReview；src 未找到 `parse-resume-ai`／`functions.invoke` 呼叫。**不要為這次網站部署啟用 AI 或新增 frontend API key**。若未來另行批准 AI runtime，需在 Supabase Edge Function 設定 `RESUME_AI_ALLOWED_ORIGINS` 包含正式 origin，並在 server secret store 核對 OpenRouter key 等既有依賴。這不是 Netlify 的 `VITE_*` env；只改 hosting env 不會改遠端函式 CORS。

## 7. 後續必要清單與檔案邊界

1. 選定穩定 HTTPS 正式 origin、hosting project 與發佈方式；目前均未設定或未驗證。
2. Hosting 設定 Node／build／dist，提供兩個必要公開 env；只發佈 dist。
3. 同步修改 Connector manifest、bridge、worker 的正式 origin，更新／重新載入 Extension。這是完整 REAL104 flow 的實際 blocker。
4. 核對並設定 Supabase Site URL／必要 Redirect URLs；保持原核准的 username／Guest Auth 契約，不改 schema、RLS 或身份策略。
5. 配置後才在正式 origin 驗證登入／Guest 升級、confirmed resume restore、104 capture/import、Batch／pending／下一批、F5、收藏及 snapshot。網站可載入不等於 Connector 與 owner persistence 已驗收。

| 後續可能需修改的檔案 | 必要性 |
| --- | --- |
| Extension `manifest.json`、`app-bridge.js`、`service-worker.js` | **必要**：正式 origin 尚未加入 |
| Extension `README.md:11,21` | 配置後更新正式安裝／domain 說明；可保留本機 development 指引 |
| `tests/real104FullPageConnector.contract.test.ts:46` 等相關 sender／origin 測試 | 正式 origin contract 變更時需保留本機及未授權 sender 邊界的驗證 |
| `netlify.toml`（目前不存在） | 可選：若要版本化 hosting build 設定 |
| `src/lib/supabase.ts`／`.env.example` | 沿用現有 JobQuest project 時不需要改；正式值在 hosting 提供 |
| `vite.config.ts` | 根目錄靜態部署不需為 dev port 修改；其 localhost 設定只屬 dev server |
| AI Function source | 目前不需改；未來啟用時優先透過既有 server env 配置 CORS |
| App／Batch／Matching／DB／RLS／Auth／Resume 核心 | 本次部署配置沒有提出修改需求 |

**Deployment blocker：YES（正式 origin／Connector allowlist 與 production settings 尚未完成）。Secret exposure：NO OBSERVED（上述掃描範圍）。** 缺少某個平台設定檔不是技術阻擋，遠端設定未驗證也不等於已證明錯誤。

## 附錄：localhost／127.0.0.1／5173 搜尋結果

搜尋 authored code／config／docs／tests 及現有 dist；排除 `.git`／`node_modules`。未在 src 找到三者 hardcode。以下為報告新增前的全部專案文字檔命中位置，依性質列出：

| 類別 | 檔案與行號 | 解讀 |
| --- | --- | --- |
| Connector runtime | `app-bridge.js:2`、`service-worker.js:4`、`manifest.json:21`（均在 Extension 目錄） | 必須配置正式 origin |
| Connector docs | `browser-extension/jobquest-104-connector/README.md:11,21` | Development origin 與未配置 production 的說明 |
| Development server | `vite.config.ts:7,8` | 不影響 dist 的 production hostname |
| Optional AI runtime | `supabase/functions/parse-resume-ai/index.ts:12`、`handler.ts:13` | CORS 本機預設，正式 AI 啟用才需 server env |
| Tests | `tests/helpers/resumeEditorReadabilityProbe.mjs:32,41`；`tests/parseResumeAiEdgeFunction.test.ts:36,187,189`；`tests/real104FullPageConnector.contract.test.ts:46` | 本機 browser／CORS／bridge fixtures，不是 production 網站 API 位址 |
| Context | `CONTEXT.md:121` | 本機測試紀錄 |
| Built SDK | `dist/assets/index-C0uNNJTy.js` | Supabase SDK 的 `http://localhost:9999` 預設與 localhost／127.0.0.1 host 判斷字串；App 明確提供 Supabase URL，不是實際連線到本機的證據，不改 vendor bundle |

文件歷史命中：

| `docs/` 下檔案 | 行號 |
| --- | --- |
| `jobquest-auth-configuration-evidence.md` | 35,36,61,77,89,91,93,95,102,104,109 |
| `jobquest-confirmed-resume-persistence.md` | 174 |
| `jobquest-job-preferences-persistence.md` | 198 |
| `jobquest-job-snapshot-ghost-fix.md` | 100,145,157 |
| `jobquest-manual-acceptance.md` | 83,85,86 |
| `jobquest-pseudonymous-auth-poc.md` | 20,61 |
| `jobquest-real-104-manual-integration.md` | 15,100,107,108,110 |
| `jobquest-real-104-session-restore.md` | 159 |
| `jobquest-real-104-taiwan-region-support-design.md` | 142 |
| `jobquest-real104-batch-capability-investigation.md` | 86 |
| `jobquest-real104-connector-cleanup.md` | 31 |
| `jobquest-real104-source-ui-cleanup.md` | 44 |
| `jobquest-resume-editor-ux-implementation.md` | 80 |
| `jobquest-resume-review-hardening.md` | 62 |
| `jobquest-user-job-actions-persistence.md` | 156,159 |
| `phase-4.2-structured-resume-extraction-hardening.md` | 30 |
| `phase-6c-104-browser-connector-integration.md` | 19,60 |
| `rp-112-ai-edge-function-foundation.md` | 21 |

上述歷史文件不會進網站 output，不需要為 deployment 全部改寫。官方規則另核對了 [Supabase changelog](https://supabase.com/changelog)；沒有依公告推定本專案遠端設定已變更。

STOP.
