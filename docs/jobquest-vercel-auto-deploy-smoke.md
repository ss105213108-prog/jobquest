# JOBQUEST VERCEL AUTO-DEPLOY SMOKE

日期：2026-10-01

## Scope and trigger

本工作項目以 docs-only `main` push 驗證 GitHub → Vercel Production 自動部署，不手動執行 Vercel deploy、不修改產品或部署設定。

- Repository：[ss105213108-prog/jobquest](https://github.com/ss105213108-prog/jobquest)
- Existing project：`lin-09f1/jobquest`（`prj_3VxK6qMI9P7lzirscGzRkZSBIVxz`）
- Production Branch：`main`；Git integration 的 `createDeployments = enabled`
- Production URL：[https://jobquest-snowy.vercel.app](https://jobquest-snowy.vercel.app)
- Push 前 baseline commit：`82d9685111be2004fb32bbdf0977255267d09d3c`
- Push 前 deployment：`dpl_5gnvzArnszu89m5ia7zos1tB6Cmq`，`READY`／`production`／`source = cli`
- 294 個非 docs／README 的 tracked files 已建立 SHA-256 baseline，包含 src、tests、extension、Supabase、config 與 scripts。
- 既有兩個 Production env：`VITE_SUPABASE_URL`、`VITE_SUPABASE_PUBLISHABLE_KEY`；不讀出或提交實際金鑰。

## Verification status

**Final：VERCEL_GITHUB_AUTO_DEPLOY = PASS**

| Check | Actual evidence |
| --- | --- |
| GitHub main commit | [1aa9bf2ba71a37d3a52273146f70ca46221f3258](https://github.com/ss105213108-prog/jobquest/commit/1aa9bf2ba71a37d3a52273146f70ca46221f3258)，`docs: trigger Vercel auto-deploy smoke verification` |
| Docs-only change | GitHub commits API 的 files 只有 `docs/jobquest-vercel-auto-deploy-smoke.md` |
| Auto-triggered deployment | `dpl_59peW8tiAHWzW3WwER6TFzGCejys`；`source = git`、`target = production`、`githubCommitRef = main`、`githubCommitSha` 與 smoke commit 相同 |
| Deployment status | `state / readyState / status = READY`；沒有 errorCode／errorMessage |
| Deployment inspection | [Vercel deployment](https://vercel.com/lin-09f1/jobquest/59peW8tiAHWzW3WwER6TFzGCejys) |
| Immutable deployment URL | [jobquest-l8q309gw7-lin-09f1.vercel.app](https://jobquest-l8q309gw7-lin-09f1.vercel.app) |
| Production domain | `jobquest-snowy.vercel.app` 保留；新 deployment 的 alias 包含此網域，`aliasAssigned = true`、`aliasError = null` |
| Domain ownership | Vercel domains API 回讀 project ID 仍為 `prj_3VxK6qMI9P7lzirscGzRkZSBIVxz`，`verified = true` |
| Public homepage | HTTP 200；瀏覽器實際顯示「歡迎來到求職公會」、登入／註冊／訪客入口，無白屏 |
| Frontend assets | `/assets/index-C0uNNJTy.js` 與 `/assets/index-T5LqOfg0.css` 均 HTTP 200，Content-Type 正確 |
| Browser runtime smoke | 首頁載入觀測中捕捉到的 console error／warn 為 0；本次未重新登入或操作 Auth／DB |
| Product preservation | 294 個非 docs／README 的 tracked files 逐一 SHA-256 比對，changed count = 0 |
| Git state after smoke push | `main...origin/main`，working tree CLEAN |
| Release guard | 377 個 release candidates／36 個 local links；findings = 0 |

Smoke push 已完成上述實際驗證。本結果以獨立的 docs-only follow-up commit 保存，不 amend、不 force push；follow-up 的 SHA 由 [main history](https://github.com/ss105213108-prog/jobquest/commits/main/) 記錄。該文件更新 push 後，再於 CLI 核對 GitHub SHA、Vercel 自動 deployment、正式網域與 clean status。

只有此 deployment 驗證文件被修改；沒有改 src、tests、extension、Supabase 或 config，沒有手動 deploy、建立第二個 Vercel project 或更換 production URL。文件變更不需重跑未變動產品的測試；本次驗證證據為 GitHub／Vercel API、HTTP、瀏覽器與檔案 hash。

Production manual acceptance 已由使用者完成並回報 PASS；本次另外驗證自動部署鏈路。AI／PDF production runtime 仍為 Pending，1111 仍為 Roadmap。
