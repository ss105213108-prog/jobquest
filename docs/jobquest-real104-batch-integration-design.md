# JOBQUEST REAL 104 BATCH — INTEGRATION DESIGN

狀態：**設計完成；尚未實作整合或進行瀏覽器驗收。** 本文件依序核對已驗證的 Foundation、現行程式接點、具體 Adapter、畫面狀態、失敗保護與可測契約。Foundation V2 的 40/40 測試、相關回歸 369/369、型別檢查和建置結果記於 [`jobquest-real104-batch-foundation-v2.md`](jobquest-real104-batch-foundation-v2.md)；全套僅留原有五項 PDF reconstruction 基線失敗。以下不將這些 Foundation 結果視為 App 整合或實際 104 多頁驗收。

## 現行接點與決策

| 現行接點 | 程式證據 | 整合決策 |
| --- | --- | --- |
| REAL 擷取 | `BoardPage.tsx` 的 `job104Connector.getLatest()` → `matchCaptured104Jobs()` → `setJobs(matched.slice(0, 10))` → `onRealImport` | 批次模式改由 Connector 的 ready payload 交 `batch.addCapture`；不得每擷取十筆就配對、覆蓋 Board 或寫舊單頁 session。既有 `connectorJobService` 留給舊路徑及回歸測試。 |
| Connector 檢查 | `connectorClient.ts` 用 `parse104Payload` 檢查完整 response；`schema.ts` 的 `get104PayloadState` 驗證 TTL、整份內容和重複 sourceKey | ready response 才准入；Foundation 的薄 admission edge 再用**同一組既有** `get104PayloadState`、`payloadMatches104Search`、`normalize104CapturedJob` 驗證與正規化。App 不自創解析規則，也不先配對。 |
| 搜尋 | `SearchPanel.tsx` 發出 keyword/location；`BoardPage.tsx` 的 `open104Search` 建 URL、呼叫 `onRealSearch` 清舊 session、開 104 分頁、保存偏好 | URL/地區驗證成功後，以 `REAL_104`、僅 `trim()` 的 keyword、canonical 地區呼叫 `startOrResumeSearch`；寫入成功後才清舊顯示並保存偏好。相同指紋保留批次。 |
| Matching | `matchingService.matchJobs(resume, jobs)` 輸入 `ResumeProfile | null` 和 `Job[]`，回傳已排序 `JobWithMatch[]`；`JobList`、`JobSummary` 使用該結果 | Adapter 直接委派現有 Matcher；Foundation 只傳當前批次 1–40 筆。 |
| 舊 REAL session | `real104Session.ts` key `jobQuest.real104Session.v1`、`version:1`，每份 snapshot 限 1–10 筆；`useReal104Session` 還原後重跑 Matching | 舊 schema 不擴成 40；新批次使用 Foundation 已定義的 `jobQuest.real104Batch.v1`。有效舊 session 設過渡 lane，詳下。 |
| Auth 與 owner | `AuthGateway` 在有效 Guest/Account 才掛載 App，UID 是 `auth.user.id`；same-UID 升級保留 product key，換 UID 會重新掛載。`authIntegrationStorage` 只清舊 REAL key | App 以當前 UID 呼叫批次接口；批次 restore 的 owner mismatch 不顯示、不合併。新 key 的隔離不得仰賴舊 Auth 清理。 |
| 已互動職缺 | `useJobActionResolution` 將目前 REAL matches 與缺少的 saved snapshots 依 `job.id` 合併；`jobActionPersistence` 只在使用者動作時寫 `user_job_actions`／`job_snapshot` | 以新批次**目前 presented** jobs 作 current 來源；歷史 seen 只作排除，不轉成卡片或 DB 寫入。收藏／紀錄頁仍可由既有 snapshot 補回已互動職缺。 |

## Adapter 與存放格式

**MATCHER ADAPTER:** 建議置於 `src/services/real104BatchAdapters.ts`（或同等狹窄 composition 檔），實作 `matchJobs: (resume: ResumeProfile, currentJobs: Job[]) => matchingService.matchJobs(resume, currentJobs)`。由整合 hook/App 在建立 Foundation instance 時注入；`getConfirmedResume` 取當下已確認的 `local.resume`，不可使用草稿。Matcher 原本會按分數排序；Foundation 的 `currentBatchJobs` 仍按擷取順序，Board 使用回傳 matches 顯示排序。`JobWithMatch` 的 `job`、`match.matchScore`、`match.matchLevel` 等欄位正好供 `JobList`/`JobSummary`；不改分數、等級、履歷解讀或排序。**MATCHING CORE CHANGE REQUIRED: NO。**

**STORAGE ADAPTER:** 同一 composition 層提供符合 `Real104BatchStoragePort` 的 `getItem`／`setItem`／`removeItem`，每次從 `window.sessionStorage` 取得同 tab 儲存體；不在 Foundation 內讀瀏覽器 global。不可把讀取失敗變成 `null`，否則下一次搜尋可能覆寫未知舊狀態；錯誤應由 Foundation 的 typed `STORAGE_READ_FAILED`／`STORAGE_WRITE_FAILED` 呈現。單次 `setItem` 寫完整 JSON envelope，不能拆成多 key 的半完成轉換。普通批次 jobs 不寫 localStorage 或 Supabase。

**STORAGE VERSIONING: B，獨立版本化 batch key。** 舊 key `jobQuest.real104Session.v1` 的 `mode`、最多十筆 snapshot 及其已驗收行為保持原格式；新 key `jobQuest.real104Batch.v1` 已由 Foundation 定義，內含版本、ownerUid、fingerprint、keyword/region、batchNumber、phase、current jobs、seen keys、firstCapturedAt、presentedAt。Foundation `restore(uid, now)` 是新 key 的唯一解讀者。有效新 key 優先於舊 REAL snapshot；**expired、corrupt、owner-mismatch 也優先顯示明確狀態，不可退回舊 snapshot 或 DEMO**。僅在新 key 完全不存在時，才進入舊 session 相容 lane。批次存放與舊 `mode` 選擇要在 App 明確協調：新批次開始後維持 `REAL_104` 模式；使用者明確切到 DEMO 時隱藏批次卡片但不改批次狀態，回 REAL 且未過期可繼續。後續整合測試必須涵蓋 F5 後的模式優先順序。

**LEGACY REAL SESSION STRATEGY: 保留有效舊 session 到原本的 30 分鐘期限，不自動升級。** 舊 snapshot 無 `ownerUid`、batchNumber、seen 歷史且上限十筆，不能無證據推斷為 batch #1。新 key 缺席時照原 `useReal104Session` 還原、顯示並重配對；舊 expired/corrupt 繼續顯示原重匯入訊息，不轉 DEMO。使用者明確開始新 REAL 搜尋時，成功建立新 batch 後切到新 lane，舊 snapshot 才從可見工作集退場；若建立新 batch 失敗，保留原有效舊卡片。新 key 一旦存在，即使壞掉也不能回顯舊卡片。整合時須避免 dormant 舊 hook 的非同步結果覆蓋 batch；可在成功切 lane 後清除舊 snapshot，但不能先清舊資料再嘗試寫入新 key。

**UID ISOLATION:** 僅在 Auth 已給出目前 `auth.user.id` 後 restore。UID A 的 envelope 在 UID B 下回 `owner-mismatch`、空 jobs；不得讀成 B 的 batch、遷移、合併或用 A 的結果顯示。B 明確搜尋時可由 Foundation 建立 B 的新 envelope。同 UID Guest→Account 升級仍是同一 UID，保留 batch；身份變更時 App remount 與 operation generation 必須捨棄舊 UID 的晚到 Connector/Matcher 結果。整合 hook 可訂閱現有 `auth.controller`，在**已確認**的登出／返回 Landing 時透過 Storage Port `removeItem` 清新 batch key；暫時 `restoring` 或 same-UID upgrade 不清，且不能依賴 App unmount cleanup（F5 也會 unmount）。跨帳號時即使清理通知未抵達，Foundation 的 UID 驗證仍須拒絕 A 的資料。現有設定頁「清除本次資料」也須顯式清新 batch key。這些可在整合層完成，無需修改 Auth core；需新增登出、B 登入及同 UID 升級整合測試，因現有 `authIntegrationStorage` 清理清單只含舊 key。

## App 與畫面狀態契約

**SEARCH START FLOW:** 使用者切到 REAL 模式只是選來源；不因偏好還原、輸入框打字或 104 頁碼改變而開新批次。明確按「前往 104 搜尋」或快速搜尋時，先驗證 canonical URL，再以已確認 UID、目前時間與搜尋意圖呼叫 `startOrResumeSearch`。相同 fingerprint 繼續 current/seen/batch number；不同指紋才重置。批次 envelope 是搜尋工作狀態的真相；`job_preferences` 只保存使用者最後明確提交的 keyword/location/sort/source。F5 若偏好保存失敗或偏好與有效批次不一致，Board 的**當前批次搜尋條件**取 batch envelope，偏好保存另顯示錯誤，不得由較晚到的偏好還原重置 batch。現行 `Real104BatchView` 只公開 fingerprint，故整合層可在 `status` 為 collecting/presented 時以嚴格檢查的 JSON 三元組解出 `REAL_104`、keyword、region 作唯讀畫面投影；不得另用偏好猜測或把解析結果回寫成新的 domain 狀態。既有 URL 開啟與偏好保存流程需在 batch 寫入成功後協調；不以偏好寫入失敗抹除有效 batch。

**CONNECTOR CAPTURE INTEGRATION POINT:** 在 `BoardPage.import104Jobs` 的 `getLatest()` response 後、現行 `matchCaptured104Jobs` 之前分流到 batch coordinator。`response.status === 'ready'` 且 `response.payload` 存在才呼叫 `batch.addCapture(response.payload, uid, now)`；Connector client 先完成整份 schema 檢查，Foundation 再沿用既有 TTL／搜尋 URL validator 與 normalizer，確保 late/stale 回應仍不進入批次。不能把 `matchCaptured104Jobs()` 的十筆配對結果送進 batch，因為它已經過早 Matching；也不能修改 extension、Connector payload 或 canonical `104:{jobId}`。舊 session 相容 lane 可維持原路徑直到使用者開始新 batch。

**COLLECTION UI:** 用 Board 既有 SearchPanel 與 ConnectorControls 附近的一小段 `role="status"` 顯示「第 1 批 · 已收集 10 / 40 筆」，逐次更新 20、30。`lastCapture` 顯示「本次新增 7 筆 · 略過 3 筆已看過職缺」；重複項為零新增時仍明示「本次沒有新增職缺」，不假稱已搜完。把 Connector 按鈕在批次 lane 的文案由「匯入並配對」改為「加入目前批次」；這是 App 文案與 props 整合，不改 Connector 協定。來源頁碼及單次最多十筆只是輸入機制，畫面不呈現四個最終結果集。

**QUEST BOARD DURING COLLECTION: B。** 收集 10/20/30 筆時 Board 顯示收集中狀態與進度，尚不顯示未提交卡片；下一批開始後亦不繼續顯示上一批卡片。這符合 Foundation 只保留當前批次完整 Job、舊批只留 seen IDs 的資料形狀，也避免 F5 前後出現不一致的舊結果。舊批已互動的卡片仍可依既有 saved/action snapshot 規則出現在收藏／紀錄頁。`JobSummary` 和 `JobList` 只消費 presented 的 current matches；不拿 collecting 內十筆做最終卡片。

**PARTIAL BATCH UX:** 收集中且 current 為 1–39 筆時顯示「使用目前 N 筆進行配對」。0 筆不顯示。點擊時以當下已確認履歷呼叫 `presentCurrentBatch(resume, uid, now)`；暫停重複點擊，成功寫入 presented 後以回傳 `matches` 一次顯示 N 張；失敗仍保留原 collected N，顯示可重試錯誤。沒有新職缺可擷取時也可用這個操作；不拿舊 seen jobs 填滿 40。

**FULL BATCH UX:** 第 40 筆合格 unique job 被 `addCapture` 接受後，Foundation 先保存 collecting 40，再用注入 Matcher 自動配對，成功保存 presented 後 Board 一次顯示最多 40 張。Matcher／履歷取得／最後寫入失敗時顯示「40 / 40，配對未完成」與重試入口；重試同一 current 40 的 `presentCurrentBatch`，不得再次匯入或宣稱已呈現。匹配結果不持久化；Foundation 存的是 canonical current Jobs。

**NEXT BATCH UX:** 僅在 presented 且目前卡片可見時顯示「下一批」。點擊呼叫 `startNextBatch(uid, now)`，寫入成功後清 Board 當前結果並顯示「第 2 批 · 0 / 40；請繼續在 104 正常瀏覽並使用 Connector 擷取」。失敗則維持已呈現的卡片及可重試控制。下一份 capture 的 prior sourceKeys 被 Foundation 計為 skipped；不自動翻頁、捲動、導航或抓取其他 104 資料。

**F5 RESTORE:** Auth 與已確認履歷就緒後，先讀新 key：collecting 27/40 還原 27 個 canonical Jobs、batch number、seen、fingerprint、最早 capturedAt，不觸發 Matcher；presented 40 還原 envelope，對**當前** 40 筆以目前已確認履歷重跑既有 Matching，完成前不顯示過時分數；前批 seen 不拿去 Matching。重新配對失敗仍保留 presented envelope 並顯示重試。任何 F5 均不得更新 firstCapturedAt；過期／損毀／owner mismatch 顯示重啟或重新擷取指示，不回退舊 snapshot、DEMO 或 stale cards。有效舊 key 且沒有新 key 時走既有 frozen restore。`useJobActionResolution` 將來需以「目前 presented canonical Jobs + matches」而非「最多十筆的舊 `Real104Snapshot`」取得 current IDs；未在本設計修改此 hook。

**非同步可見性:** 以 UID、fingerprint、批號、確認履歷參照、選定模式及單調 operation generation 守住 App callback；換搜尋、換使用者、換履歷、切 DEMO、卸載 Board 後，晚到的 Connector/Matcher 不得顯示舊卡或覆蓋新狀態。Foundation 已在 Matcher 後重新讀 storage 比對 raw envelope；App 還需檢查 UI generation。若操作已成功寫入但畫面切換，下一次 restore 應以持久 envelope 為準。

## 失敗、安全與職責

| 狀況 | 畫面與儲存契約 |
| --- | --- |
| Connector 缺少、no-capture、expired、malformed、整份 payload 含重複／壞 job、搜尋 URL 不符 | 不呼叫或由 Foundation 拒絕加入；保留先前有效 current、seen、Board。顯示需重新擷取或校正搜尋條件。 |
| 全部是 current/seen 重複 | accepted 0，進度和 TTL anchor 不變；顯示 skipped 數與可用的 partial commit。 |
| Matcher 失敗／沒有已確認履歷 | collecting N（含 40）維持可還原；不標成 presented，不增加 seen，提供原批次重試。F5 presented 重配對失敗亦不抹掉 envelope。 |
| Storage 讀取或寫入失敗 | 顯示明確錯誤；不把未知狀態當 missing，不讓失敗轉換看似成功。新批次不沿用舊 session「當次可用但未保存」的寬鬆語意，因跨批去重須以持久 envelope 為準。 |
| corrupt／expired 新 batch | 不展示其中工作或 fall back；提示明確重新開始 REAL 搜尋。既有已互動 snapshots 仍依原規則出現在收藏／紀錄。 |
| UID mismatch／登出 | 給當前 UID 空資料與重啟提示，不暴露前 UID 的 metadata、jobs 或分數；不遷移／合併。已確認登出時整合層清除新 key；暫時 Auth restoring 不清。 |
| fingerprint 不同 | 僅明確搜尋且新 envelope 寫入成功後重置 current/seen/batch number；失敗保留舊有效畫面。 |
| presented 後再次擷取／滿 40 後再擷取 | 不重複提交；提示先按「下一批」，或在 collecting 40 的 Matching 失敗狀態先重試配對。 |

**責任分配：** Connector 只做正常公開頁面擷取與 response schema；Normalization 只做 canonical Job；Batch Coordinator 擁有 fingerprint、current/seen、去重、TTL、轉換與 port 協調；Matcher Adapter 只橋接現有引擎；Storage Adapter 只橋接 sessionStorage；App／整合 hook 管理 Auth UID、來源模式、使用者事件、非同步可見性及可見狀態；Quest Board 只呈現 current presented matches 和收集提示；snapshot/action persistence 仍只為實際互動的職缺保存。這些模組共享 canonical Job identity，不共享私有計分／raw payload／DB 批次表。

**SNAPSHOT / ACTION IMPACT:** 行為契約不變：`user_job_actions`、互動職缺 `job_snapshot`、ghost-card 防護、saved restore、舊 NULL snapshot、同 sourceKey 重逢及原 `https://www.104.com.tw/job/{id}` 連結皆維持。Board 的動作必須傳 current presented Job；收藏／紀錄可用 current matched metadata 覆蓋同 key 的較舊 snapshot metadata，失去 session 時再從 snapshot 還原；只存真正操作的一筆，不將 1–40 全批寫 DB。

DATABASE CHANGE REQUIRED: **NO**。RLS CHANGE REQUIRED: **NO**。CONNECTOR CHANGE REQUIRED: **NO**。AUTH CHANGE REQUIRED: **NO**。Matching core change required: **NO**。

## 實作拆分與驗證契約

**IMPLEMENTATION SPLIT:**

1. `REAL104_BATCH_STORAGE_ADAPTER_IMPLEMENTATION`：只加入具體 sessionStorage adapter 與新/舊 key precedence、owner/read/write failure 的獨立驗證；不接 Board。
2. Matcher Adapter 與 presented F5 重新配對驗證；保留核心 Matching 原狀。
3. App/Board capture 與搜尋接線：先用同一批次控制 10→20→30，確認不再每十筆覆蓋；保留舊有效 session 過渡 lane。
4. 收集進度、partial/full 提交與錯誤重試的最小 UI；重新接 `JobList`/`JobSummary` 只顯示 presented current。
5. 下一批與收藏／紀錄 current+snapshot 投影，加入 UID/搜尋/履歷 generation 防護。
6. 全部自動回歸、真實同 tab F5/Connector 多頁流程準備完成後，交由使用者作瀏覽器手動驗收。每步保持可測、可回退，不能用 Foundation 測試代替整合測試。

**AUTOMATED INTEGRATION TEST CONTRACT:** 以真實 App seam 與 fake Connector transport/sessionStorage 跑：valid ready payload 才進 coordinator；10→20→30→40 且前面十筆不被覆蓋；40 時只對當前 40 呼叫現有 Matcher、Board 一次呈現同批；27 筆 partial commit；下一批把先前 IDs 移入 seen 並拒絕重複；F5 分別還原 27/40 presented/seen/批號/fingerprint 與搜尋條件；UID A→B 隔離、已確認登出清新 key、暫時 restoring 不清、同 UID 升級保留；30 分鐘最早 anchor 不滑動；變更 keyword 或地區重置，相同搜尋和換 104 頁不重置；malformed／重複 raw payload 不改 valid batch；Matcher、storage 失敗及 late callback 不假成功；existing saved/action、ghost-card、NULL snapshot、same-key rejoin、原 104 連結、Auth 回歸維持。新 key 優先於有效、expired、corrupt 的舊 key；僅無新 key 才走舊 session；DEMO/REAL 切換與偏好還原不得誤顯示另一來源。

**USER MANUAL BROWSER ACCEPTANCE PLAN（僅供未來使用者執行，Codex 不宣稱已完成）：** 在同一 tab 選 REAL、搜尋「前端工程師＋台中市」，正常使用 104 公開搜尋頁 Connector 擷取第一頁十筆；到另一正常結果頁再擷取，確認 20/40 且第一批十筆仍在 current；繼續至最多 40，確認 Board 一次顯示同一邏輯批次、Matching 生效；F5 後結果、批號與搜尋條件還原；按「下一批」確認 0/40 並在同一有效的 30 分鐘搜尋 session 內以正常擷取驗證舊 sourceKey 不再進入新批；另測 1–39 partial、改 keyword、改 region、已收藏/標記及原始 104 連結。使用者記錄每步 PASS/FAIL，最終產品驗收只能由使用者回報。

**CONTRACT CONTRADICTIONS: NONE。** 工作項描述「validated normalized capture → Batch」是責任順序；V2 的實際公開接口 `addCapture(input)` 接 Connector ready payload，並在模組薄 admission edge **重用既有 validator 與 normalizer** 後才交批次邏輯，無需更改 Foundation 或在 App 另造正規化。舊 v1 的 10 筆格式不能承載新批次，因此以獨立新 key 和顯式過渡 lane 保護已驗收舊行為。

**Recommended next work item: REAL104_BATCH_STORAGE_ADAPTER_IMPLEMENTATION。**

STOP.
