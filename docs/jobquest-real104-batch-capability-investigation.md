# JOBQUEST REAL 104 BATCH IMPORT — CAPABILITY INVESTIGATION

調查日期：2026-09-29。範圍：Observe → Reproduce → Capability Boundary → Evidence → Recommendation。只調查與文件，未實作 batch、seenSourceKeys 或下一批 UI；未改 production、tests、JobQuest/Connector 儲存內容或資料庫。以下區分現行原始碼、既有自動化測試、合成 DOM 診斷與現場公開網站證據。

CURRENT REAL 104 FLOW:

1. `SearchPanel` 維護 keyword / location 草稿；提交時只 trim keyword（`src/components/search/SearchPanel.tsx:16–22`）。`BoardPage.open104Search` 建立 `{ source, keyword: keyword.trim(), location, sortBy: 'match-desc' }`，清除目前 REAL 工作清單，開啟公開 104 搜尋頁並保存偏好（`src/pages/BoardPage.tsx:86–101`）。
2. `build104SearchUrl` 使用已驗證 locationMap，加入 keyword 與該 region 的 area；全部地區不加入 area（`src/integrations/job104/build104SearchUrl.ts:6–16`）。沒有翻頁、排序或批次導航程式。
3. 使用者在 104 分頁明確按 Extension 的「擷取目前職缺」；`popup.captureJobs` 對 activeTab 注入 `capture-jobs.js`（`browser-extension/jobquest-104-connector/popup.js:15–27`）。Manifest 只有 activeTab / scripting / storage，沒有 104 永久 host permission（`manifest.json:6–10,18–27`）。
4. 注入程式讀取 `.job-list-container` DOM，從 job / company / area / salary 連結抽取公開欄位；只接受有效 job ID 與必要欄位，產生 `sourceKey = 104:{jobId}` 與 canonical 原始連結。當次去重後最多十筆（`capture-jobs.js:42–71,79–95`）。沒有讀取頁面 script state、較大 JSON payload、API 或 detail。
5. Service worker 驗證 payload，覆寫 Extension `chrome.storage.session['jobQuest104.latestPayload']`。只有最近一次，沒有歷史、cursor、page queue 或已看過集合（`service-worker.js:20–39,58–66`）。
6. 回到 JobQuest 按「匯入並配對」；`BoardPage.import104Jobs` → `job104Connector.getLatest` → same-origin app-bridge → service worker → 最近一次 payload（`BoardPage.tsx:103–126`；`src/integrations/job104/connectorClient.ts:28–64`；`app-bridge.js:9–20`）。這個指令只讀暫存，不會在 104 重擷取。
7. `matchCaptured104Jobs` 再驗證 payload / TTL / keyword / region，逐筆交給 `normalize104CapturedJob`，再呼叫既有 `matchingService.matchJobs`（`src/services/connectorJobService.ts:8–24`）。Normalizer 保留 `job.id = capture.sourceKey`、canonical URL、公開欄位與既有技能偵測，沒有陣列 cap（`src/integrations/job104/normalize104CapturedJob.ts:6–24`）。
8. `useReal104Session.acceptImport` 用本次 matches 建立並**替換**單一 working snapshot，寫入 browser sessionStorage；無累積、不保存過往已顯示 IDs（`src/hooks/useReal104Session.ts:33–39`）。恢復或履歷改變時重新匹配當前 snapshot（`:54–64`）。
9. App 的 REAL Board 透過 session.matches 顯示；`JobList` 逐筆 render `JobCard`（`src/App.tsx:29–44,102`；`BoardPage.tsx:132–148`；`src/components/jobs/JobList.tsx:14–19`）。Matching 排序為分數降冪、publishedAt 降冪、job.id 字典順序（`src/services/matchingService.ts:6–12`），並非原始 104 DOM 順序。

CURRENT CAPTURE LIMIT:

**最多 10 UNIQUE jobs / 一次 Connector 擷取。** 可少於十筆；若目前 DOM 沒有可辨識有效卡片，popup 不儲存新結果。不是「至少十筆」，也不是四十筆。

LIMIT CAUSED BY:

| 層 | 證據 | 效果 |
|---|---|---|
| DOM capture | `capture-jobs.js:2,81–86` | `MAX_JOBS = 10`；從 DOM 開始掃描，取得十筆有效且當次唯一職缺即 break。 |
| Extension validator | `service-worker.js:3,20–30` | payload 只接受 1–10 筆；超過十筆拒絕，不會儲存。 |
| App payload contract | `src/integrations/job104/types.ts:1–3`；`schema.ts:54–62` | `JOB104_MAX_JOBS = 10`；超過十筆或重複 sourceKey 整份拒絕。 |
| Current working-session contract | `src/services/real104Session.ts:48,55–60` | jobs 最多十筆，並重用 Connector validator；將四個合法十筆 payload 直接合成四十筆塞入現行 snapshot 仍不合法。 |
| Board local import state | `BoardPage.tsx:119` | 非 session 路徑的局部 state 明確 `matched.slice(0, 10)`；正常 App 用 session.matches，但上游 cap 仍生效。 |
| Normalization | `normalize104CapturedJob.ts:6–24`；`connectorJobService.ts:23–24` | 單筆轉換與 map，不另限制數量。 |
| Matching / list | `matchingService.ts:16–31`；`JobList.tsx:17–18` | 依傳入 Job 陣列匹配、排序與顯示，沒有十筆或四十筆限制。 |

來源先受**目前已存在且符合 selector 的 DOM**限制；未 render、無必要公開欄位、不同 DOM 結構的職缺不會取得。即使 DOM 有四十筆有效卡片，仍只取前十筆。因此不是僅由 104 每頁數量或 UI 顯示造成。Live 104 的 render/lazy-load/page 行為須另外觀察，不能從 cap 推定。

ONE NORMAL CAPTURE CAN REACH 40:

**NO**。現行擷取及上下游 validators 均明確 cap 十筆；不需猜測網站每頁數量即可排除 Question 4 的 A。

ADDITIONAL JOBS CAN BE OBTAINED THROUGH NORMAL USE:

**YES**。本次相同「前端工程師 + 台中市」公開搜尋，在第 1 頁、第 2 頁公開 URL 的新開頁，以及第 3、4 頁的一般分頁操作後，沿用既有 capture 邏輯的唯讀 DOM 診斷各取得十筆，共 **40 個不同 sourceKeys、跨四次零重複**。沒有自動捲動、API 抓取或身份登入。這證明正常公開頁面能提供更多符合現有擷取條件的候選；不等於一次 capture 或目前 JobQuest 已能顯示四十筆。

Question 4 支持 **B**：一次 capture 少於四十筆，但多次正常公開頁面的 capture 可以提供更多。A 被程式 cap 排除；本次已取得可重現的新候選，不採 C 作為唯一結論。實際 MV3 popup/bridge/import 的四十筆完整端到端操作 **NOT VERIFIED**，本次 live 證據是同一擷取邏輯的唯讀 DOM reproduction，另以現有 tests 驗證管線。

REPEATED CAPTURE BEHAVIOR:

- 重按 JobQuest「匯入並配對」只重讀同一 latest payload，不會向 104 取得新 jobs。
- 重按 Extension capture 是重新從 `.job-list-container` 的開頭掃描。`seen` 每次重新建立，只在當次去重；沒有跨 capture 去重、offset、cursor 或 seenSourceKeys 輸入。
- 第 1 頁立即重做唯讀 capture：10/10 IDs 與順序相同；capturedAt 重新產生不代表新 jobs。
- 原 tab 操作公開第 2 頁入口後，URL 已為 page=2，但當時 DOM 保留 40 個不同職缺，capture 仍從舊前綴取得 page 1 的十筆。**頁碼變更本身不保證下一次 capture 為新批。**
- 重新開啟上述 UI 自行產生的完整 page=2 URL：DOM 是該頁二十張卡片，capture 十筆與 page 1 overlap=0。這不是手造 URL、修改 selector 或讀取私人 API。該新頁再點公開第 3、4 頁 link，也各取得不同十筆。
- 因此正常換頁/重開能提供新的前綴；單純尾端追加則不會穿過既有十筆限制。不能把任意換頁、捲動或同頁 capture 承諾為新的十筆。未進行 scrolling/lazy-load reproduction，該行為 **NOT VERIFIED**。
- 104 的跨時間排名是否穩定：**NOT VERIFIED**。對固定 payload、相同履歷，既有測試證明 Matching 結果可重現；那不是公開網站排名穩定的證明。

NEXT-BATCH SOURCE:

**使用者在相同搜尋的其他公開結果頁，主動擷取與匯入的新 payload。** 本次已證明四個頁面的十筆擷取候選可以合計四十筆。現行 JobQuest 只保存 latest working set，未保存 candidate pool 或歷史，因此現在按「匯入並配對」仍只替換最多十筆，不能直接回傳下一批。

後续設計可以在 working-set/batch 層累積多份仍有效且 search intent 相同的合法十筆 payload，依 `104:{jobId}` 排除歷次已發出 batch 的 keys，再提供最多四十筆新 jobs。這是可行性建議，**沒有實作 Set、累積或按鈕**。使用者取得新頁面候選仍是明確手動操作；JobQuest 的 getLatest 不會替使用者導航或擷取。單次候選全重複只證明「此 capture 沒有新 jobs」，不證明整個 104 搜尋已耗盡。沒有足夠新候選時必須如實回報目前可提供數量／請求新的手動 capture，不能用舊 jobs 補滿四十，也不能假稱已檢查所有結果。

CONNECTOR_CHANGE_REQUIRED:

**NO — 以使用者明確進行多次一般擷取、JobQuest 累積合法十筆 payload 的路線為前提。** Live 候選已證明同一搜尋能經正常公開頁面提供四十個不同 keys，因此不必為「一個搜尋/一批最多四十筆」更改現行 Connector。需要改的是尚未存在的 JobQuest 批次工作層、consumer wiring 與還原契約。這個判定不代表只新增 Set 就已足夠，也不代表自動取得下一批。

若下一案改要求「一次 Extension capture 四十筆」，答案是 **YES**：capture / Extension validator / App payload cardinality 全都限制十筆。若要求沒有新手動 capture 就能自行取得更多 jobs，現行架構無該能力，本次也未驗證可接受的來源。這些是不同產品契約，不能把「一搜尋」偷換成「一擷取」，也不能暗中增加自動導航/抓取。

JOBQUEST-ONLY DEDUPE FEASIBLE:

**YES**，僅指取得合法候選之後的跨 batch sourceKey 篩選可放在 JobQuest working-set/batch 層，身份已有可靠依據。它不等於 JobQuest-only 就能供應四十筆或下一批。任何一批只能選擇真正未出現的 `104:{jobId}`；已收藏、已互動不是已顯示歷史的完整替代。不得用 title/company 去重。

SEARCH FINGERPRINT AVAILABLE:

**YES**。既有 `SearchPreference` 的 `source` / `keyword` / `location` 已存在（`src/types/index.ts:127–132`）；REAL 模式由 `REAL_104` + `source: '104'` 區分，避免 MOCK 104 混入。

- keyword 現行規則是 `.trim()`；沒有 lowercasing、Unicode normalization 或語意同義字合併。
- region 使用目前被驗證且選中的完整 label，以及既有 locationMap 映射；不能重新猜測 mapping。
- `payloadMatches104Search` 要求 source URL 的 keyword trim 值與 area 精確相符；全部地區須**省略** area（`build104SearchUrl.ts:19–28`）。
- 上述欄位足以區別「前端工程師 + 台中市」、「後端工程師 + 台中市」、「前端工程師 + 台北市」。`sortBy: 'match-desc'` 是 JobQuest Matching 顯示順序，非目前 104 搜尋 intent 的額外 filter；頁碼/capture 時間不應使同一 search history 被重設。如何在重送相同條件、切換 DEMO/REAL 或過期後處理歷史，需下一個設計工作項明確定義。

SESSION STORAGE EXTENSION FEASIBLE:

**YES，限後續 versioned working-session 設計；現行格式不可直接承載四十筆或跨 batch history。**

- Browser working key：`sessionStorage['jobQuest.real104Session.v1']`（`real104Session.ts:6,26–27,65–95`）。snapshot 白名單只有 normalized public jobs、keyword、location、capturedAt、importedAt；mode/status 在外層。沒有 fingerprint、seen、batch number 或 owner 欄位，沒有 raw DOM/payload/credentials/Matching scores。
- User ownership：Auth integration 的 `sessionStorage['jobQuest.authWorkingOwner.v1']` sidecar，`prepareOwner(uid)` 在 UID 不同時清掉既有 REAL cache，same UID 保留；登出以 null owner 清掉（`authIntegrationStorage.ts:3,6,11–18`；`authIntegration.ts:48–67`）。未標記的 legacy cache 也會在 owner 不同時清掉。這是外層 ownership guard；不是 REAL envelope 自己帶 UID。
- Extension capture key：`chrome.storage.session['jobQuest104.latestPayload']`，不是 JobQuest tab 的 sessionStorage，也沒有 owner UID；只分享到固定 `http://localhost:5173` origin 的 bridge（`service-worker.js:1,5,33–39,42–48`）。不可將兩層儲存稱為同一份 owner-bound history。
- TTL：`JOB104_PAYLOAD_TTL_MS = 30 * 60 * 1000`，以 **capturedAt** 計算；剛好三十分鐘有效，超過一毫秒過期。importedAt 不延長 TTL。App 允許未來時鐘容忍五分鐘，超過則 malformed（`types.ts:2`；`schema.ts:73–80`）。Session restore 重用同一判定，過期/corrupt 以 snapshot null 寫回；hook timer/focus 也清掉已過期 snapshot（`real104Session.ts:53–60,77–90`；`useReal104Session.ts:41–52`）。
- 未來多 capture 的 capturedAt 不同；不能把早期 jobs 改用最新 timestamp 來延長有效期。須保留每次 capture 的 freshness 證據，並決定 candidate pool/current batch/seen IDs 各自的 expiration/reset。**如果 seen IDs 跟工作清單一起因 TTL 被清掉，無法保證「同一搜尋歷史下一批永不重複」。**這是下一案必須決定的產品生命週期，現行 contract 沒有答案。
- 後續 history extension 必須受同一 owner/keyword/region 邊界管理，same-UID upgrade 保留、不同 UID/登出隔離；不修改 Auth 行為。可採工作層獨立 versioned envelope，不應暗中塞入 frozen v1。儲存失敗時不能聲稱 F5 後仍有去重保證。

平台生命週期也不同：JobQuest 的 browser sessionStorage 按 origin + top-level tab 隔離，F5/還原仍保留，關閉 tab/window 結束 page session；有 opener 的新頁可能先複製一份，但之後不共同更新。見 [MDN sessionStorage](https://developer.mozilla.org/en-US/docs/Web/API/Window/sessionStorage)。Extension storage.session 是 extension 的記憶體儲存，disable/reload/update/browser restart 時清除，並非每個 JobQuest tab 各有一份；見 [Chrome Storage Session](https://developer.chrome.com/docs/extensions/reference/api/storage#session)。三十分鐘 TTL 是 JobQuest 自己的驗證規則，不是平台預設。

本次可行性不代表關閉 tab、換瀏覽器或換裝置後仍可恢復 seen history。「稍後下一批」的產品保證範圍需要在設計案明訂；不能默默把內容 TTL 過期當成新搜尋或把 history 消失當成所有 jobs 都是新 jobs。Extension payloadResponse 只檢查 age > TTL；App get104PayloadState 另有五分鐘未來時鐘限制，後續多 capture 仍須沿用完整 App 判定。

現行 Auth sidecar 只清除 v1 key，**不會自動保護新 key**；若下一案新增 companion envelope，工作層必須自行核對既有 Auth context 的 UID，並隔離/失效自己的 envelope，不能假設新 history 已被既有 guard 清掉。這不需要修改 Auth。

MATCHING CHANGE REQUIRED:

**NO**。批次層提供合法 Job 陣列即可沿用 `matchingService.matchJobs`，現行 engine 不限制 job count；不得更動 scoring、grade、skill/evidence 或 ranking formula。

DATABASE CHANGE REQUIRED:

**NO**。一般 REAL 匯入只進 transient working session；user action 才攜帶對應 Job 的既有 snapshot。批次候選/seen IDs 不需要讓所有 jobs 永久進資料庫。

RLS CHANGE REQUIRED:

**NO**。沒有需要新增 remote persistence 的資料；existing owner-scoped `user_job_actions` / `job_snapshot` 可繼續使用。未存取或修改 Supabase。

FROZEN MODULES THAT WOULD NEED CHANGES:

- 推薦路線下 **不需改 REAL Connector / payload validator**：每份手動 capture 仍是合法的最多十筆；分別驗證、normalize 後才由 JobQuest 工作層累積。若另要求單次四十筆取得，須另案明確解凍 Extension `capture-jobs.js` / `service-worker.js`、App `types.ts` / `schema.ts` 的 cardinality；本案沒有這項修改。
- REAL working session restore：若承載四十筆與歷史，須另設 versioned contract 與 lifecycle；現行 `real104Session.ts` 的十筆驗證不能原樣接收四十筆，`useReal104Session.acceptImport` 目前只替換一批。若用 companion batch envelope，可保留 frozen v1，但不能宣稱既有 session 已能還原四十筆。
- Board/current working-set integration：現行 import replacement / local slice / search reset 需在後續 batch 案調整，不能只加 Set 或下一批按鈕。
- **不需改** Matching formula、normalize104CapturedJob 的單筆契約、canonical sourceKey、canonical source links、verified region mappings、DB schema/RLS、job_snapshot serialization/rules、Auth 或 Resume。正常已互動資料繼續按既有 action 路徑保存。

EVIDENCE:

**Current source inspection**：以上每項列出現行檔案、函式與行號。這些是本次讀取之 production source，而非 memory 或未實作方案。

**Existing focused tests**：2026-09-29，使用 bundled Node 執行現行 Vitest；12 files / **369 PASS / 0 FAIL**。未新增、修改或 skip 測試。JSON evidence：`C:\Users\user\AppData\Local\Temp\jobquest-real104-batch-focused-tests.json`。

| Test file | PASS |
|---|---:|
| job104Integration.test.ts | 11 |
| real104MatchingFlow.test.tsx | 69 |
| real104Session.test.ts | 48 |
| real104SessionRegression.test.tsx | 20 |
| taiwan104Regions.test.tsx | 92 |
| taiwan104Preferences.test.tsx | 23 |
| jobSnapshot.test.ts | 26 |
| jobSnapshotPersistence.test.ts | 17 |
| jobActionPersistence.test.ts | 24 |
| jobActionRepository.test.ts | 18 |
| jobActionApp.test.tsx | 8 |
| matchingEngine.test.ts | 13 |

重點證據：payload rejects 11 jobs / duplicate IDs（`tests/job104Integration.test.ts:59–68`）；search mismatch（`:92–95`）；相同 payload stable matching（`tests/real104MatchingFlow.test.tsx:121–124`）；exact TTL / duplicate & oversized cache（`tests/real104Session.test.ts:47–59,72–79`）；interacted-only snapshots、untouched jobs 沒有批次落庫（`tests/jobSnapshotPersistence.test.ts:43–80`）；snapshot 是歷史 evidence、不套 working TTL（`tests/jobSnapshot.test.ts:24–31`）。此 focused run 不重開 PDF，也不冒稱 full-suite/browser acceptance。

**Safe diagnostic reproduction — 合成 DOM，非 live 104**：以 Node VM 執行原封不動的 `capture-jobs.js`，提供符合目前 selectors 的 generic 卡片 fixture；未修改 production source。51 DOM cards / 50 unique fixture IDs → capture 10 / unique 10 / duplicates 0。相同 DOM 重跑 sourceKeys 完全相同；尾端多追加一筆仍不改前十筆；另一組模擬替換頁的 DOM 取得不同十筆、overlap 0。證明程式的 cap、當次去重、從頭掃描與前綴限制，**不證明公開 104 有該替換頁或四十筆可取得**。診斷在 `%TEMP%\jobquest-real104-capture-diagnostic.cjs`，沒有加入專案或測試套件。

**Live public 104 evidence — 2026-09-29，UTC 15:10–15:14（台灣 23:10–23:14）**：只讀公開搜尋與已 render 的 DOM；沒有執行 MV3 popup、沒有寫入 Connector/sessionStorage、沒有使用 hidden page state 或 API，也沒有登入、應徵或收藏。以 `capture-jobs.js` 相同 selectors、必要欄位、identity、當次 dedupe 與 cap 邏輯進行唯讀 reproduction。只檢查上限與採样來源，不是 JobQuest browser acceptance。

公開搜尋：[前端工程師 + 台中市](https://www.104.com.tw/jobs/search/?area=6001008000&keyword=%E5%89%8D%E7%AB%AF%E5%B7%A5%E7%A8%8B%E5%B8%AB)。頁面顯示共 262 筆、14 頁；這是当時 UI 顯示值，不當成已完整可擷取的數量。原始 IAB 小視窗呈現 mobile/responsive 結構，`.job-list-container` 與指定 job-link selector 均為零。為檢查既有 desktop Connector，暫時使用 1440×900 viewport：20 cards / 20 matching job links。這證明 cap 仍受 viewport/DOM 結構影響，不修改 selector 或宣稱 mobile 支援。

| 觀察 | capture size | unique sourceKeys | capture duplicates | 與之前有效採樣重複 | DOM / order |
|---|---:|---:|---:|---:|---|
| Page 1，15:10:32.037Z | 10 | 10 | 0 | — | 20 張 desktop 卡片 |
| Page 1，立即重做 | 10 | 10 | 0 | 10 | 相同 keys、相同順序 |
| 原 tab 公開 page 2 操作後，15:12:02.139Z | 10 | 10 | 0 | 10 | DOM 40 個不同 ID；仍回舊 page 1 前綴 |
| [Page 2 URL 新開頁](https://www.104.com.tw/jobs/search/?area=6001008000&keyword=%E5%89%8D%E7%AB%AF%E5%B7%A5%E7%A8%8B%E5%B8%AB&order=15&page=2)，15:12:51.505Z | 10 | 10 | 0 | 0 | 20 張卡片；該頁新前綴 |
| [Page 3 一般分頁](https://www.104.com.tw/jobs/search/?area=6001008000&keyword=%E5%89%8D%E7%AB%AF%E5%B7%A5%E7%A8%8B%E5%B8%AB&order=15&page=3)，15:14:07.521Z | 10 | 10 | 0 | 0 | 20 張卡片 |
| [Page 4 一般分頁](https://www.104.com.tw/jobs/search/?area=6001008000&keyword=%E5%89%8D%E7%AB%AF%E5%B7%A5%E7%A8%8B%E5%B8%AB&order=15&page=4)，15:14:23.262Z | 10 | 10 | 0 | 0 | 20 張卡片 |

Page 2/3/4 完整 URL 由網站的公開 pagination 操作產生，保留原 keyword/area 並加入 `order=15&page=N`。沒有猜測頁碼 URL。Page 1 + fresh page 2 + page 3 + page 4 合計 **40 captured / 40 unique / 0 duplicate**；重做與原 tab page 2 的舊結果不計入有效累積採樣。

可核對的 canonical sourceKeys（直接由公開 job URL 中的原始 job ID 得到，非 title/company 推測）：

```text
page 1: 104:88cx9 104:8v7th 104:844qv 104:8rrwb 104:6yhy1
        104:967h0 104:8ladf 104:73eyj 104:8m3m2 104:8p8l8
page 2: 104:8yaty 104:8v5g8 104:82uex 104:90ez5 104:8xeub
        104:8muxz 104:8d49g 104:6niw4 104:8m8t5 104:66wah
page 3: 104:7rfu6 104:8snc6 104:2q696 104:7kncz 104:6vvwl
        104:8uair 104:6jkvm 104:7zvvq 104:856pe 104:8h5ql
page 4: 104:8vbil 104:72ehu 104:95kbn 104:7hjkc 104:950fb
        104:8zgc4 104:85op5 104:94v08 104:8fg6h 104:9631y
```

當時 page 2 的 DOM 提供四十個公開 canonical IDs，但現行 capture 只回十筆；没有試圖讀取更大的未 render/隱藏 payload。觀察沒有全域 order-stability 證明、全搜尋耗盡證明、mobile capture 支援證明或更晚批次四十筆保證。網站內容與排序會變化；seen keys 必須排除重複，不能靠 page number/order 當去重身份。

**Data persistence boundary**：`src/App.tsx:44–50` 只在 action 時將對应 current/saved Job 傳給 action controller；`src/services/jobActionPersistence.ts:90–102` 的 change 序列化該筆 snapshot，persist（`:40–55`）才發 write；`src/repositories/jobActionRepository.ts:31–45` 的 upsert 沿用同一 `user_id,job_key` row。`import104Jobs` / `acceptImport` 沒有 bulk DB insert。repository 的 `importMany` 雖存在，但 `rg` 證實 src 沒有呼叫點，不能把它誤認為一般 REAL import 路徑。沒有理由為四十筆批次保存全部匯入 jobs；完整 shown history 必須來自 transient batch history，不可改用 interacted-only DB rows。

**Preservation evidence**：331 個本次開始前的 source/tests/browser-extension/Supabase/scripts/experiments/docs/root 檔案 SHA-256 比對，變更/移除 **0**；僅新增本報告。診斷程式及測試 JSON 在 TEMP，沒有加入產品或套件。調查用分頁已關閉，臨時 viewport override 已 reset。沒有 source implementation、DB/Auth/row mutation 或最終產品驗收。

RECOMMENDED NEXT WORK ITEM:

**REAL104_BATCH_DESIGN**。已證明 B：一般公開結果頁可供應四十個不同候選，但現行 App 只替換十筆，沒有 batch/history。下一案先設計「使用者多次一般擷取 → 合法小 payload → JobQuest 工作層累積 → 每批最多四十筆從未發出過的 keys」契約，保留 Connector 十筆限制與 frozen identity/normalization/Matching/DB/Auth/Resume。

設計案必須明確決定：一次搜尋如何 gather 多 capture、遇到舊 DOM 前綴/全重複/不足四十筆時的 honest UX、同條件重送與 keyword/region 改變的 reset、current batch 發出/seen commit、per-capture TTL、history 在內容過期後如何保留不重複保證、F5 与 owner 隔離及 storage failure，以及 companion/versioned batch session 如何替代現行單 snapshot consumer。不得直接進 implementation，也不承諾純「下一批」按鈕可以在沒有新候選來源時自動取得四十筆。

STOP：Evidence + capability recommendation only。
