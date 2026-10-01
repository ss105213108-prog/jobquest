# Phase 6C — 104 Browser Connector 正式整合驗收

驗收日期：2026-09-20

## PHASE 6C RESULT: PARTIAL

> 2026-09-20：依使用者指示暫停最後 E2E。真實 PDF 暴露的 Resume Parser 分類問題改由 Phase 4.1 處理；在使用者完成新解析結果的人工確認前，本階段保持 `PARTIAL`，不自動恢復 Extension E2E。

> 2026-09-20 Phase 4.2 更新：Structured Resume Extraction hardening 與指定回歸已通過，但同一份私人 PDF 的 A–F 人工驗收尚未完成。本階段仍維持 `PARTIAL`；沒有恢復 104 Extension E2E，也沒有修改 Connector。

正式整合、自動化測試、真實 104 Search Result DOM 抽查、安全掃描、Production Build 與本機 JobQuest Browser Console 皆已通過。

尚差最後一項 Desktop Chromium 人工 E2E：在可安裝 unpacked Extension 的 Chrome/Chromium 實際執行「Connector 擷取 → 回 JobQuest 匯入並配對 → F5 後重新匯入」。當前驗收環境只提供不支援安裝 unpacked Extension 的 Codex In-app Browser，因此不能在本次對話中誠實宣告 COMPLETE。這不是 Bridge 安全性阻塞，也沒有因此放寬任何權限。

## 驗收摘要

1. **正式 Extension 路徑**：`browser-extension/jobquest-104-connector/`
2. **Manifest permissions**：`activeTab`、`scripting`、`storage`
3. **JobQuest Origin permission**：僅 `http://localhost:5173/*`
4. **104 permissions**：無永久 host permission；使用者點擊時才透過 `activeTab` 讀取當前 104 Search Result DOM
5. **Extension → App 通訊架構**：App `window.postMessage` ↔ origin-limited content script ↔ service worker ↔ `chrome.storage.session`；驗證 `event.source`、origin、channel、fixed command 與 request ID
6. **Temporary storage**：`chrome.storage.session`；不使用 `storage.local`，不儲存 raw DOM
7. **TTL**：30 分鐘
8. **Search URL Builder**：PASS；`https://www.104.com.tw/jobs/search/?area=6001008000&keyword=...`
9. **Location Mapping**：僅已驗證 `台中市 → 6001008000`；其他地區顯示「此地區尚未完成 104 Connector 驗證。」
10. **Capture Schema**：Payload v1 與 DTO schema validation PASS；1–10 筆、唯一 `sourceKey`、固定 source URL/Job ID/canonical URL
11. **snippetText 是否成功**：PASS；真實頁面 `.info-description` 可讀，且仍保持 optional，不額外 fetch Detail
12. **Normalizer**：PASS；`Job104Capture → Job`，description 來自 snippet，url 重建為 canonical URL
13. **requiredSkills extraction**：PASS；只呼叫既有 dictionary/alias rule，輸入為 title + snippet
14. **Real Job 數量**：真實 104 頁面當前有 20 張 card；同等擷取邏輯成功取前 10 筆。正式 Extension popup E2E 待人工安裝後確認
15. **Top N**：實作上限 10，依既有 matching stable sort 後 `slice(0, 10)`；正式佈告欄實際顯示待 E2E
16. **Matching 結果**：固定真實 fixture 經 P5 engine 通過；正式 Extension 即時 payload 的 UI 結果待 E2E
17. **人工 104 資料驗收**：PASS；當前頁面抽查 `844qv`、`6yhy1`、`8ladf`，Title / Company / Location / Salary / Experience / Canonical URL 均與可見 DOM 一致
18. **Matching Evidence 驗收**：PASS（evidence 層）；`844qv` 的 `Git` 來自 snippet 且履歷有 Git；`8ladf` 的 `Vue` 來自 snippet 且履歷無 Vue；`8p8l8` 的 HTML/CSS/JavaScript 來自 snippet 且履歷均有對應技能。實際佈告欄 score/order 待 E2E
19. **F5**：ResumeProfile 與 `前端工程師 + 台中市` 偏好已實測恢復；TTL 內 Extension payload 重新匯入與排序一致待 Desktop Chromium E2E
20. **Missing Extension State**：PASS；顯示「尚未偵測到 Job Quest 104 Connector。」，無 crash，Console 無 error
21. **No Capture State**：自動化測試 PASS；實際 Extension UI 待 E2E
22. **Expired State**：自動化測試 PASS；訊息為「104 職缺資料已過期，請重新擷取。」
23. **Mock Fallback 是否停用**：YES；source=104 不呼叫 Mock search，Unavailable/No Capture/Expired/Malformed 都不顯示 fake 104 jobs
24. **Privacy Review**：PASS；Extension 不讀 Resume、Gmail、Cookies、History、104 帳號、其他網站；僅讀取使用者主動操作的當前公開 Search Result DOM
25. **Extension Security Review**：PASS；無 `<all_urls>`、cookies、history、webRequest、remote executable code、`eval`、`new Function`、fetch/XHR；store message 只接受自身 popup
26. **Matching Tests**：13/13 PASS
27. **Resume Tests**：9/9 PASS
28. **新增 Tests**：11/11 PASS；URL、location、schema、version、ID/canonical URL、TTL、missing/no capture/malformed、normalizer/skills、real fixture matching、deterministic tie-break
29. **TypeScript**：PASS；`tsc --noEmit -p tsconfig.app.json`
30. **Build**：PASS；Vite production build（395 modules）。現有 bundle size warning 為非阻斷性，此階段未改寫 bundle 架構
31. **npm audit**：PASS；`found 0 vulnerabilities`
32. **Browser Console**：PASS；Desktop 與 390×844 reload 後 0 error / 0 warning
33. **Secret Scan**：PASS；僅掃描目前 JobQuest repository 內 source/config/docs/tests/extension，0 筆高權限 credential 型態命中；未掃描父資料夾或其他 repository
34. **Supabase 是否修改**：NO；無 list projects、migration、schema、jobs table、RLS 或任何其他 Project 操作
35. **Gmail 是否使用**：NO
36. **AI 是否使用**：NO
37. **付費服務**：NO
38. **Anti-Bot bypass**：NO

## 最後 Desktop Chromium 人工 E2E

1. 在 Chrome/Chromium 開啟 `chrome://extensions`。
2. 開啟 Developer Mode，Load unpacked，選擇 `browser-extension/jobquest-104-connector/`。
3. 以 `npm run dev` 開啟 `http://localhost:5173`。
4. 使用「前端工程師 + 台中市」前往 104。
5. 點 Connector 的「擷取目前職缺」，確認 10 筆。
6. 回 JobQuest 點「匯入並配對」，確認 Top 5–10 與 canonical URL。
7. F5 後重新匯入，確認 score/order 一致。

在上述實際 Extension E2E 確認前，狀態保持 `PARTIAL`，不宣告 `PHASE 6C COMPLETE`。
