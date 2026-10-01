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

**目前狀態：PENDING_AUTO_DEPLOY_VERIFICATION**。這份文件的首次 commit／push 是驗證觸發點，並非部署成功聲明。

推送後核對 GitHub main SHA、Vercel deployment 的 Git commit／source／target／status、正式網域歸屬、首頁與靜態資產載入、294 個 protected files 的 SHA-256，以及 clean Git status。實際結果完成後以 docs-only follow-up 記錄；不 amend、不 force push。

Production manual acceptance 已由使用者完成並回報 PASS；本次另外驗證自動部署鏈路。AI／PDF production runtime 仍為 Pending，1111 仍為 Roadmap。
