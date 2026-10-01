# JOBQUEST REAL104 FULL-PAGE CONTINUOUS BATCH — DESIGN CHANGE

**Type:** ARCHITECTURE DESIGN  
**Final status:** **APPROVE_REAL104_FULL_PAGE_CONTINUOUS_BATCH_TEST_DESIGN**  
**Production code changed:** **NO**

## 依據與目標契約

本設計以使用者回報的 REAL104 Batch App、F5、partial commit、sourceKey 去重、Matching／收藏／原始連結人工 **PASS** 為既有產品基線。本輪只定義下一階段的測試與實作契約；未再次執行真實 104 人工驗收。

候選流的順序是：**每次使用者主動擷取時，104 當前搜尋結果頁已正常載入的有效卡片之 DOM 順序；多次擷取按成功匯入的先後順序接在後面**。同一 sourceKey 只保留第一次進入候選流的資料。這能保證依序擷取 Page 1、Page 2、Page 3 時的順序；使用者若逆序擷取、104 在兩次擷取間重新排序，或職缺未載入 DOM，不能聲稱還原了未觀察到的全站順序。沒有固定每頁 17、18、20 筆的產品常數，也不自動翻頁或捲動。

## 目前 10 筆限制的實際位置

| 位置 | 現況 | 設計處理 |
| --- | --- | --- |
| `browser-extension/jobquest-104-connector/capture-jobs.js` | `MAX_JOBS = 10`，在 `.job-list-container` 的 DOM 迴圈收滿十筆即 `break`；此處最早遺失第 11 筆以後的有效卡片。 | 移除十筆截斷，走訪當前已載入的全部卡片；保留有效欄位判定、同頁首次 sourceKey 去重、DOM 順序、主動點擊才執行。 |
| `browser-extension/jobquest-104-connector/service-worker.js` | `MAX_JOBS = 10`，`isPayload` 拒絕大於十筆；只在 `chrome.storage.session` 保存最近一次 payload。 | 接受完整有效頁面 payload，維持來源 URL、欄位、sourceKey、去重與 30 分鐘檢查；保存失敗須明確回錯，不截斷後冒充成功。 |
| `src/integrations/job104/types.ts`、`schema.ts`、`connectorClient.ts` | `JOB104_MAX_JOBS = 10`，App parser 拒絕大於十筆，client 因而回 `malformed`。 | 以完整頁面 DTO 驗證取代十筆上限，保留整份 payload 驗證、TTL、同頁 sourceKey 唯一與來源 URL 驗證；任何資源失敗皆不得回傳部分成功。 |
| `src/services/real104BatchWorkingSet.ts` | Batch 上限是 **40**，與每次擷取十筆分開；滿額後其餘候選只計 `overflow` 並丟棄。 | 保持 current 最多 40，但把所有超額 unique 候選以原順序保存為 `pendingJobs`，並讓後續批次優先消耗。 |
| `src/pages/BoardPage.tsx`、`src/services/real104Session.ts` | 舊單頁 lane `setJobs(matched.slice(0, 10))`；舊 REAL snapshot 仍嚴格限制最多十筆。 | 舊 snapshot 格式與已保存卡片維持；完整頁面新 capture 不得送進舊 lane 再暗中切十筆，也不得把舊 session 的十筆上限一起放大。 |

`experiments/104-browser-connector/` 是歷史實驗，不是正式 Extension 修改點。`popup.js` 的計數文案、Extension README／manifest 描述及既有「oversized payload 應拒絕」測試，也須在後續實作時按新契約更新；固定 fixture 的十筆資料可保留作回歸樣本。

## Connector full-page capture

Connector 仍只在使用者按下擷取時，以 `activeTab`／`scripting` 讀取 **目前** 104 公開搜尋頁已載入的 DOM；不開新頁、不滾動、不呼叫 104 private API、不新增 cookie、history 或永久 104 權限。從 `.job-list-container` 依 DOM 順序讀取可形成合法 `104:{jobId}`、canonical URL、標題、公司、地點及薪資的卡片；無效卡片略過，同頁重複 sourceKey 留首次。結果為完整的有效候選陣列，筆數由頁面實況決定；零筆回明確 no-capture／錯誤，不聲稱成功。

Extension worker、App parser、Batch 必須對同一完整 DTO 達成一致驗證。若整頁 payload 無法通過傳輸或 `chrome.storage.session`／JobQuest `sessionStorage` 容量限制，**拒絕整次擷取或匯入，保留上一份已保存狀態**；不能靜默取前十、前四十或前任意數量。保留目前 latest-payload 的手動「擷取一頁 → 回 JobQuest 匯入 → 再擷取下一頁」流程。現有 worker 只留最新一份：若使用者在匯入前又擷取下一頁，前一份會被取代；本契約不得把這種操作宣稱為無損連續匯入。若產品要支援連續擷取多頁後才一次匯入，須在另一設計中加入 Extension capture queue 與持久化確認／ack，而非依賴目前 `GET_LATEST`。

## Batch 工作狀態與最小接口

以新版本 batch envelope（例如 `jobQuest.real104Batch.v2`）保存：`ownerUid`、原有 keyword／region／`searchFingerprint`、`batchNumber`、`phase`、`currentBatchJobs`（最多 40 個 canonical public Job）、`pendingJobs`（尚未進入 current 的 unique Job，依來源順序）、`seenSourceKeys`、`firstCapturedAt`、`presentedAt`。每個 pending Job 附所屬 capture 的 `sourceUrl`、`capturedAt` 與該 payload 的有效候選 ordinal，便於驗證與說明續接位置；**pending queue 的首項就是下一個 continuation cursor**，不另存一份可能與 queue 衝突的可變索引。若 queue 中有多個頁面的剩餘職缺，按佇列順序逐項消耗。

Batch 模組的外部接口維持「開始／繼續搜尋、加入 capture、提交目前批次、開始下一批、還原」這些操作概念；去重、佇列、切割、TTL 和原子保存封裝在 Batch 模組內，App 不自行切陣列或搬移 seen。Storage Adapter 只讀寫版本化的完整 envelope；Matcher Adapter 仍只接確認履歷與當前已提交的最多 40 個 Job。

狀態不變式：`current`、`pending`、`seen` 的 sourceKey 互不重疊；`current.length <= 40`；`pending` 按已成功匯入的 payload 與頁內 ordinal 排序；collecting 且 `current.length < 40` 時 pending 必為空（先消耗 pending 才能接新 capture）。pending 的 Job 仍是 **未呈現候選**，不得提前加入 seen、送 Matching、寫 snapshot 或顯示為 Board 卡片。Matching 分數與履歷仍不寫入 session envelope。

## 加入頁面、切批與下一批

1. 驗證完整 payload 的來源、30 分鐘新鮮度、搜尋 fingerprint 與每筆 canonical identity；依頁內順序 normalize。用 `104:{jobId}` 跳過 seen、current、pending 和本次 payload 先前已接受的 key。即使標題／公司改變，已接受的同 key 不覆寫。
2. 把其餘 unique Job 全部接到 pending 尾端，再由 pending 首端填入 current，最多填到 40。一次保存 **current + pending + seen + cursor metadata** 的完整 envelope；只有保存成功才回報新增與 overflow-pending 數。重複 capture 不增加 current 或 pending，也不延長 TTL。
3. current 達 40 時沿用現有時序：先持久保存 collecting 40（含 pending），再僅對 current 執行一次 Matching。成功後持久保存 presented，Board 一次顯示此批；Matching 或最後寫入失敗時保留可 F5 還原的 collecting 40、pending 和重試入口，不丟任何後續候選。
4. 1–39 筆的顯式 partial commit 照現有流程配對並呈現目前 current。之後若 pending 非空，下一批仍先消耗 pending；通常 partial commit 當下 pending 為空，因為 collecting 有空位時必已先排空 pending。
5. 新增「下一批」操作時，只有目前 presented 且狀態可保存才可執行：將剛呈現的 current keys 加入 seen、批號加一、清 current、**先由 pending 首端**填入最多 40，再原子保存。若填滿 40，按同一 Matching 規則提交；不足 40 才等待使用者在後續 104 頁手動擷取。新 capture 永遠接在現有 pending 之後。寫入失敗保留原 presented 與原 pending，不顯示虛假的下一批。UI 不會自動打開下一頁。

例：Page 1 有 18、Page 2 有 20、Page 3 有 20 筆互不重複的有效職缺。前兩頁後 current = 38；Page 3 匯入後 current = Page 1 的 18 + Page 2 的 20 + Page 3 前 2 = 40，pending = Page 3 後 18。Batch 1 成功呈現後，按「下一批」會先把 40 個 key 移到 seen，再由 **已保存的 Page 3 後 18** 建立 Batch 2 的 18/40；重新擷取 Page 3 不會讓前 2 或後 18 重複進來。Page 4 的有效候選接在這 18 筆之後。

對同一 fingerprint，104 頁碼只是 capture provenance，**不是**批次邊界；同頁可跨批，多頁可合成一批。sourceKey 是唯一身份；跨批 seen 過濾，加上 current／pending 過濾，保證當前 session 中每筆最多進入一個 batch。不同 keyword 或 region 的明確搜尋建立新 fingerprint，原子重置 current、pending、seen、批號、cursor 與 TTL anchor；相同 fingerprint 繼續，不因偏好還原、F5 或頁碼變動重置。

## F5、TTL、版本相容

F5 只在目前 Auth UID 就緒後還原 v2 完整 envelope。collecting 還原 current、pending、seen、批號、fingerprint、佇列首端位置及最早 `firstCapturedAt`，不觸發 Matching；presented 還原同一狀態，再以**目前已確認履歷**只重算 current Matching，完成前不顯示舊分數。30 分鐘 TTL 仍以最早 accepted capture 的 `firstCapturedAt` 計，後續頁、下一批、F5、重複 capture 和 partial／presented 切換均不延長。還原須驗證 UID、版本、fingerprint、所有 current／pending 的 canonical Job 與 capture 時間、鍵值互斥、phase／容量／cursor 一致性；corrupt、expired、owner-mismatch 或 storage read failure 不能回退顯示舊資料。寫入 failure 不能宣稱 queue 或頁面已匯入。

**舊 Batch v1：** `jobQuest.real104Batch.v1` 的有效、未過期、同 UID envelope 可在首次 v2 restore 時做一次保守遷移：沿用 current、seen、批號、phase、fingerprint、最早 capturedAt；新 pending 為空。先成功寫入並驗證 v2，才切換畫面權威並清理 v1；失敗時維持可還原的 v1 舊流程，不冒充已啟用完整頁面續接。v1 曾明確丟掉的 `overflow` **無法復原**，不可假造 cursor 或宣稱過去頁面完整；只有遷移之後的新 full-page capture 才提供無損 pending 保證。v2 key 一旦存在，即使損毀／過期／UID 不符也不得回退 v1。設定頁清除本次資料須涵蓋兩個 batch key，避免 v1 殘留復活。

**更舊的 REAL 單頁 session：** `jobQuest.real104Session.v1` 仍保留原最多十筆格式、原 F5 顯示及 30 分鐘規則，不能把 full-page payload 寫進此 key。沒有 batch key 時可照原路徑還原舊卡片；後續明確開始新批次並成功保存 v2 後，v2 優先。若仍在舊卡片畫面按新的 full-page 匯入，App 必須經核實的 keyword／region 切入 v2，或提示先開始新批次；不得經舊 `matched.slice(0, 10)` 路徑默默遺失第 11 筆之後的職缺。新 batch 建立失敗時保留舊卡片與 session。

## 模組影響與不變部分

需修改的模組：正式 Extension capture script／worker 及其說明、App 的 104 DTO schema／client 驗證、Batch Foundation 的 envelope 與分配轉換、sessionStorage Adapter 的新 key／migration、`useReal104Batch` 的還原／下一批動作、`BoardPage`／App 的進度與來源切換，以及相關測試。新 UI 只需顯示 current N/40、pending N、完整頁面匯入數與「下一批」動作；維持目前 Board 卡片佈局和手動擷取方式。

**完全不需改的模組：** `matchingService` 與計分／分級／排序公式、`real104BatchMatcher.ts` 委派邏輯、104 canonical Job ID／URL 與既有 normalize 規則、Resume／Auth、`job_preferences`、`user_job_actions`、`job_snapshot`、DB schema／RLS、收藏／紀錄的互動 snapshot 寫入規則、104 地區映射與搜尋 URL builder。普通 current/pending/seen 仍只在瀏覽器 session 中；僅使用者實際互動的 Job 走既有 snapshot。舊 REAL session parser 的十筆上限應獨立保留，不與新 full-page payload 上限共用同一常數。

## 下一階段 TEST DESIGN 必備案例

- Extension／DTO：不同頁面有效筆數、超過十筆完整接收、DOM 順序、無效卡片與同頁重複略過、空頁、來源 URL／欄位／TTL／傳輸或 storage failure；不得固定假設每頁 17／18／20。
- 分配：18+20+20 的 40/18 精確切割；頁面大於剩餘容量、甚至超過兩批容量時 pending 全保留；先 pending 後新頁；同批／跨批／pending 中重複 key 跳過，first-seen metadata 保留；Matching 只收 current 且每次成功提交一次。
- 失敗與還原：Matcher 失敗時 collecting 40 + pending 不變；寫入失敗不移動 cursor；F5 partial／presented／pending／seen／批號；最早 capturedAt TTL 不延長；UID 隔離、corrupt/version mismatch、keyword／region reset、同 fingerprint 續接及延遲回應防護。
- 相容：有效 Batch v1 collecting／presented 遷移且 pending 空、已丟失 overflow 不假裝恢復、v2 存在時不回退、legacy REAL 十筆 session 可還原、full-page 新 capture 不走舊 slice 路徑；Matching／收藏／原始連結／snapshot 回歸維持 PASS。

下一工作項僅為 **REAL104_FULL_PAGE_CONTINUOUS_BATCH_TEST_DESIGN**。本輪沒有 production 實作、沒有自動翻頁／捲動、沒有繞過 104 保護。STOP。
