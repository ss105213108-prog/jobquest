# JOBQUEST REAL 104 BATCH IMPORT — ARCHITECTURE DESIGN

設計日期：2026-09-30。範圍僅為產品契約與未來可執行的測試設計；**沒有實作或修改 production、測試、Connector、資料庫或 RLS**。依據：[能力調查](jobquest-real104-batch-capability-investigation.md)及目前的 `BoardPage`、`real104Session`、`build104SearchUrl`、Auth working-owner 原始碼。調查在正常公開 104 結果頁以既有擷取邏輯取得四次、各最多十筆、合計四十個不同 `sourceKey`；完整 Extension → JobQuest 四頁端到端操作尚未人工驗收。四十筆是**一個邏輯批次的上限**，不是單次擷取或保證一定可取得的筆數。

## 1. 搜尋契約與模組介面

**SEARCH FINGERPRINT:** `JSON.stringify(['REAL_104', keyword.trim(), selectedRegion])`。`keyword` 僅沿用搜尋頁現行 JavaScript `trim()`，不做大小寫折疊、Unicode 正規化、空白壓縮或同義詞合併。`selectedRegion` 必須是現行已驗證地區選單中的完整 canonical label（包括 `全部地區`、`新竹縣市`、`嘉義縣市`）；不推測縣市代碼，也不由擷取頁顯示文字反推選項。空關鍵字或不支援的地區不能建立批次。三元陣列序列化避免字串拼接碰撞。頁碼、URL 排序參數、擷取時間、結果、擷取順序、履歷、配對分數及 Quest Board 呈現方式均不參與 fingerprint。每份 payload 仍須先通過既有 `payloadMatches104Search`：keyword trim 後相等、area 對應現有 map；`全部地區` 必須省略 area。`source: '104'` 的 MOCK 結果不等於 `REAL_104` 搜尋。

提議新增**批次工作集模組**的單一介面：`startOrResumeSearch(intent, uid)`、`addCapture(validatedPayload, uid, now)`、`presentCurrentBatch(resume, uid, now)`、`startNextBatch(uid, now)`、`restore(uid, now)`；回傳不可變的工作集視圖、已新增／已略過／超額數與明確錯誤，不讓 UI 自行維護第二套 Set。Connector 只提供一次 1–10 筆合法公開擷取；既有 validator 檢查整份 payload，Normalizer 逐筆產生 canonical `Job`；批次模組負責 fingerprint、容量、跨次與跨批去重、狀態轉移。Matching 模組只消費當前已提交批次；restore 模組在同一批次介面後方序列化狀態；action/snapshot 路徑仍只處理實際互動的一筆。`BoardPage`／App 後續需要改接這個介面，取代目前每次匯入就替換最多十筆的 consumer；不修改 Connector、單筆正規化或 Matching 算式。

## 2. 工作集狀態與不變條件

**CURRENT BATCH STATE:** 一個 versioned REAL 專用 `sessionStorage` envelope，至少包含 `version`、`ownerUid`、`searchFingerprint`、原始 `keyword` 與 `selectedRegion`、`batchNumber`（從 1 開始）、`phase: collecting | presented`、`currentBatchJobs`（0–40 個按首次合格擷取順序排列的 canonical public `Job`）、每筆原始 `capturedAt` 或等價的 capture provenance、`seenSourceKeys`、`firstCapturedAt`、`presentedAt`（僅觀察用途，不延長效期）。可以另存 schema/狀態錯誤標記；不存原始 DOM、完整 Connector payload、認證資料、配對分數、舊批次完整 Job 或遠端資料。`capturedAt` 不得被較新擷取覆寫成全部 jobs 的共同時間。

`collecting` 的 current 是正在收集的候選；`presented` 的 current 是已提交、仍應在 Board 顯示的那一批。`presented` 時禁止再附加擷取；使用者必須明確按「下一批」才開始空的新 current。`batchNumber` 只在該操作成功時增加；空批次不能提交。所有狀態經嚴格驗證：owner、fingerprint、phase/count、canonical `104:{jobId}` 與原始連結、public Job 欄位、唯一性、時間與已顯示集合互斥。配對排序不改動 current 的擷取順序或身份。

**SEEN HISTORY STATE:** `seenSourceKeys` 精確表示**本次有效搜尋 session 裡，之前已完成且離開 Board 的批次**所展示的 canonical IDs；不以收藏、已查看、已投遞或資料庫 action 代替，也不儲存舊批次的 Job 卡。當前 `presented` 批次的 IDs 留在 `currentBatchJobs`，所以全部已展示的排除集合是 `seenSourceKeys ∪ currentBatchJobs.ids`。兩者分開使 F5 可以直接恢復目前已展示批次，不會因 seen 先增加而把卡片排除。`seenSourceKeys` 永不包含未提交的 collecting 候選；未展示的 41st 候選也不能加入。

**MAX BATCH SIZE:** `40` 個 unique `sourceKey`，上限而非目標保證。**CAPTURE SIZE:** 現有 Connector 每次 1–10 筆；零筆沒有新的 stored capture，意外超過十筆由既有 validator 整份拒絕。每次 `getLatest` 讀的是 Extension 的**最近一次**擷取，不會重新擷取、換頁或提供候選池。

**WITHIN-BATCH DEDUPE:** 先驗證完整 payload 與 search match，再按 payload 順序逐筆判定。`sourceKey` 已在 `currentBatchJobs.ids` 就略過；同一 payload 內重複 key 依現有 validator 屬 malformed，整份拒絕。只以 `104:{jobId}` 判定，不比較 title/company，也不重新編號。重讀相同 latest payload 為冪等操作。

**CROSS-BATCH DEDUPE:** key 在 `seenSourceKeys` 就略過；`collecting` 過程同時排除 current keys。跨批排除先於容量判定；可記錄本次略過數供 UI 顯示，但數字不是持久性身份。不同 fingerprint 有獨立的新歷史；這項保證只涵蓋同一個尚未過期的、同一 tab／同 UID 搜尋 session。

## 3. 收集、提交與下一批

首次有效擷取 10 筆 → `10/40`。第二次有 10 筆、其中 2 筆 current 重複 → 只附加 8 筆、`18/40`。每次合格擷取先算出新的完整 envelope，**一次 `sessionStorage.setItem` 成功後才更新 UI**；寫入失敗時維持舊狀態、提示儲存失敗並允許重試，不聲稱 F5 可恢復，也不做半批更新。若同時發生搜尋、匯入、配對或登出，以目前 fingerprint、UID、batch number 與操作 generation 比對回應；過時回應不得寫入或顯示。

**BATCH COMMIT RULE:** 40 筆收滿時自動進入提交；1–39 筆只有在使用者按「使用目前 N 筆進行配對」時進入。先以 current 1–40 筆執行既有 Matching；若 Matching 失敗，仍保留 `collecting` 原資料，顯示可重試錯誤，不新增 seen。Matching 成功後，以**同一個原子 sessionStorage 寫入**把 phase 改成 `presented`，保留 current 的完整 Job 與既有 seen；Board 只從這份已保存的 presented current 顯示配對結果。seen 此時仍只有*先前*批次，不提前把 current 移走。若呈現中斷或 F5，恢復同一 current 並重跑既有 Matching；不會跳到下一批。只有卡片已呈現且「下一批」操作可用時，使用者才能推進 seen。`presentedAt`／配對完成本身不延長 TTL。此順序使「標成已看過但無法恢復看到」不會成為持久狀態；無法對瀏覽器實際像素上屏作跨 storage/DOM 的原子保證，但在任何中斷點都能恢復同一 presented 批次，而不是把它跳過。

**PARTIAL BATCH RULE:** 允許手動提交 1–39 筆，例如 `27/40`；零筆不能提交。提交走完全相同的 Matching、保存、呈現流程。使用者在 104 找不到更多公開結果時，UI 可提示「可使用目前 N 筆」，但系統不能聲稱已遍歷或耗盡全部結果；全重複一次也不是搜尋耗盡的證據。

**NEXT-BATCH RULE:** 只對 `presented` 的 current 開放「下一批」。按下後，先把其全部 IDs 與 `seenSourceKeys` 聯集，將 current 置空、phase 改為 `collecting`、batchNumber +1，**一次寫入**後才清 Board 並顯示「下一批收集中：0 / 40」。若寫入失敗，仍保留舊 Board 和按鈕可重試；絕不能只清 UI。之後只接收使用者在相同搜尋其他正常公開 104 頁**主動**擷取、且通過原有 URL/TTL 檢查的 payload。例：舊批有 B、F，下一份 B/F/AA/AB → 只附加 AA、AB；第三批同時排除第一、二批。沒有新手動擷取時，「下一批」不會自動供應 40 筆。不得自動捲動、翻頁、讀取隱藏 API 或繞過網站限制。

當收集已達 40 筆，擷取按鈕不再附加；提示先查看本批／按下一批。若一次最多十筆合法擷取使剩餘容量由 2 被 5 個新 key 填滿，按原始順序只收前 2 個，後 3 個屬**未接收**，不寫入 current/seen，也不靜默替換已收職缺；顯示「本批已滿，另有 3 筆未收錄；開始下一批後可再次匯入這次擷取」。下一批可重新讀取仍有效的 latest payload；如果之後被 Extension 新擷取覆寫，先前未收錄候選可能無法再取得，UI 不承諾佇列或保證取回。此規則也適用於 41st 新 key。

**RESET RULE:** 只有通過驗證且**不同** fingerprint 的新搜尋意圖，才原子建立新的空歷史／batch 1；keyword 或地區改變、切換來源搜尋意圖即新歷史。對新搜尋先建立有效 URL 與新狀態，儲存成功再切換 Board 並開啟公開 104 頁；寫入失敗保留舊 working set。重送相同 fingerprint 應繼續既有有效批次，不清空 seen。104 翻頁、重複擷取、擷取順序、local Matching 重排、Board 本地呈現變更均不重設。切離 REAL 搜尋意圖時，不能讓舊 REAL 歷史混入 MOCK；日後返回是否為新 REAL 意圖由顯式搜尋操作決定。expired/corrupt session 需明示不能續用；即便條件相同，也只能由使用者明確開始**新的搜尋 session**，提示過去的跨批去重保證已結束，可能再次看到先前職缺。不能默默把過期歷史當空集合後啟用「下一批」。

## 4. 暫存、效期與所有權

**SESSION RESTORE:** 使用獨立的 versioned batch envelope，例如 `jobQuest.real104Batch.v1`，保留舊 `jobQuest.real104Session.v1` 的 1–10 筆格式及其現有驗證。批次模式一旦啟用，以新 envelope 作唯一 REAL Board 權威；讀到有效 batch envelope 即恢復 `collecting` 進度、`presented` current、seen、fingerprint、batch number 與時間證據。新 envelope 若標示 expired/corrupt，明示錯誤並停止續批，**不得回退顯示可能過時的舊 session 或 DEMO**。只有不存在批次 envelope 時才沿用舊 `real104Session.v1` 還原路徑；不自動從舊快照推斷完整 seen，因它曾覆寫舊批，無法證明較早展示的 IDs。從舊快照轉進新批次功能須明示開始新的 batch session，保證自該時刻起成立。F5 在有效期內恢復 current 和 seen；presented 的配對結果可由 current Job 與目前已確認履歷重算，不保存 score。若當前履歷更新，只對同一 presented current 重跑 Matching，身份與 seen 不變。`sessionStorage` 受同一 tab 的 page session 管理；關閉 tab 結束 transient history，不能聲稱跨 tab／裝置繼續排除。

**TTL:** 延續現有 **30 分鐘 capturedAt 絕對期限**，不採成功擷取的 sliding activity window。每份新 payload 先通過現有 `get104PayloadState`：`now - capturedAt > 30 min` 逾期，超過未來 5 分鐘為 malformed；剛好 30 分鐘仍有效。session 的 `firstCapturedAt` 取**所有已接受 current 候選的來源 capturedAt 中最早者**；之後批次結束時保留該錨點，後續若接受更早但仍有效的擷取則提前錨點。整個搜尋 history 的 deadline 為 `firstCapturedAt + 30 min`，不因後續擷取、進入下一批、F5、配對或 presentedAt 更新；`now > deadline` 立即停止 restore、匯入與「下一批」。沒有第一份已接受候選時沒有可恢復的 seen 或 TTL anchor；不將全重複／被拒絕的擷取當成活動續期。由於所有已展示 jobs 都在同一 anchor window 內，不能在較早 jobs 過期後繼續以新擷取延長它們的 working-session 語意。超過 30 分鐘後不提供同 session 的跨批不重複承諾；應提示重新搜尋可能重複，不改用 localStorage 或資料庫延長歷史。

Owner 隔離：新 envelope 自帶 `ownerUid`，只能在 Auth 已確認當前 UID 後讀／寫；每次操作及 F5 都須比對 UID，不一致時清除或封鎖新 envelope 並提示工作階段變更。同 UID 匿名→帳密升級維持同一 UID，可恢復；登出事件必須由新工作集 consumer 清除其 key，避免在同 UID 再登入前留下舊 working state。現有 `authWorkingOwner.v1` 僅清 `real104Session.v1`，**不會自動清新 key**；後續 wiring 須將登出／owner change 通知批次模組，不改 Auth foundation。`sessionStorage` 不可用、quota 滿或寫入失敗時，不能進入聲稱可 F5 還原／可安全下一批的 presented 狀態；保留畫面與錯誤，允許使用者修復後重試。驗證失敗的原始 envelope 不可部分採納，明示 corrupt，並只有顯式新搜尋可重建。

## 5. 失敗模型、產品回饋與資料路徑

**MATCHING INPUT:** 只把當前 `presented` 的 1–40 unique canonical Jobs 交給現有 Matching；前幾批只留 IDs 作排除，不能合併成 80/120 筆去重新算分。履歷缺失或 Matching 失敗時保留未丟失的 current，呈現明確錯誤／重試；不改公式、技能規則、等級或排序。現有 `BoardPage` 的 local `slice(0,10)` 與 `useReal104Session.acceptImport` replacement 是後續 consumer 改接點，不能繼續成為批次顯示來源。

**SNAPSHOT IMPACT:** 正常擷取、collecting、presented 與 seen 都只在 transient working session，不批量寫入 Supabase。實際收藏／已查看／已投遞／不適合操作才沿現有 `jobActionPersistence` 寫該 Job 的 `job_snapshot` 及 `user_job_actions`；保存後依相同 `sourceKey` 與 current batch rejoin。已收藏舊批即使其 Job 不在 current，也由既有 snapshot 恢復卡片；legacy NULL snapshot 仍依既有規則處理，不合成假卡片。互動狀態隔離、ghost-card 修復及既有 RLS 均不變。批次 seen 不可從 action rows 推定。

錯誤處置表：

| 事件 | 必須保持的行為 |
|---|---|
| 擷取為空／Extension 尚無新 payload | popup 若未儲存新結果，JobQuest 的 `getLatest` 仍可能讀到先前 payload；不能把它宣稱為新擷取。該 payload 若已接受即冪等略過；若尚未接受且仍有效，只能依其顯示的原 capturedAt／sourceUrl 當作舊擷取處理。若完全沒有 latest，current/seen 不變並提示重新擷取。 |
| 全部 sourceKeys 已在 seen/current | 新增 0、顯示略過數；不刷新 TTL，不宣稱搜尋耗盡。 |
| payload malformed、任何一筆缺 `sourceKey`、單份 >10、當份重複 ID | 延用 validator 整份拒絕；不採納有效子集合，不破壞已保存批次。 |
| URL keyword/area 與 fingerprint 不符 | 拒絕整份；保留現有批次，提示回到相同搜尋條件擷取。 |
| current 已滿或已 presented | 不附加；41st 不進 seen；提示本批已滿／請按下一批。 |
| storage corrupt、UID 不符、TTL 過期 | 停止續批，明示原因；不得靜默 fallback 到 DEMO、v1 或空歷史。 |
| Matching 或 storage 寫入失敗、競態中的舊回應 | 原已保存 current/seen 不變，可重試；不預先更新 seen 或清 Board。 |

最小 UI 只在既有 Connector／Board 區塊加狀態與按鈕，不重做整頁：`收集中：10 / 40`、`已略過 3 筆重複職缺`、`本批已滿：40 / 40`、`使用目前 27 筆進行配對`、`下一批`、`下一批收集中：0 / 40`。引導文案：`請在相同搜尋條件的 104 公開結果頁手動擷取，再回來匯入；每次最多 10 筆。` 對全重複：`這次沒有新增職缺；可查看其他公開結果頁後再次擷取。` 對過期：`本次 104 搜尋階段已過期。重新搜尋後，先前批次的去重紀錄不再適用。` 這些數字只代表實際已驗證且已接收的候選，不代表 104 還有多少可用職缺。

**CONNECTOR CHANGE REQUIRED:** **NO**，前提是每頁由使用者明確手動擷取，每次仍最多十筆；完整 Extension 多頁人工驗收仍待後續驗證。**DATABASE CHANGE REQUIRED:** **NO**。`resume_profiles`、`job_preferences`、`user_job_actions`、`job_snapshot` 原樣。**RLS CHANGE REQUIRED:** **NO**。

## 6. 未來可執行測試矩陣（generic fixtures）

**TESTABLE CONTRACT:** 在批次模組介面使用通用 `104:{jobId}` fixtures、注入時鐘與 mock sessionStorage，並以既有 Connector validator、Matcher、action 路徑的集成測試核對下列案件；不抓 live 104，不改 frozen 實作。每項都應斷言 state、顯示與失敗時持久值，而非只測 Set 函式。

| # | 情境與預期 |
|---:|---|
| 1 | 第一份合法十筆 → collecting `10/40`、seen 空。 |
| 2 | 四份互不重複十筆 → 40/40，成功提交後 presented 40。 |
| 3 | 第二份十筆有兩個 current overlap → 只加八筆，18/40。 |
| 4 | 擷取順序穩定：保留第一次合格出現順序；Matcher 排序不改原工作集。 |
| 5 | 剩兩個空位收到三個以上新 key → 只收前兩個、41st 不進 current/seen。 |
| 6 | 27 筆按部分提交 → presented 27，零筆提交被拒。 |
| 7 | presented current 仍可恢復；按下一批後該批 IDs 原子進 seen。 |
| 8 | 第二批候選混有第一批 IDs → 舊 key 略過，只收新 key。 |
| 9 | 第三批排除第一與第二批全部 keys。 |
| 10 | 全重複 capture 新增零筆、批號與 TTL anchor 不變。 |
| 11 | malformed capture 整份拒絕，先前有效 current/seen 不變。 |
| 12 | 改 keyword → 新 fingerprint、空 seen、batch 1。 |
| 13 | 改 region → 新 fingerprint、空 seen、batch 1。 |
| 14 | 重送相同 fingerprint → current、seen、batch number 原樣。 |
| 15 | F5 恢復 collecting 的部分批次與各 Job 原 capturedAt。 |
| 16 | F5 恢復 previous seen 與目前 presented 批次，再按下一批仍排除全部舊 key。 |
| 17 | anchor 剛好 30 分鐘可還原；超過一毫秒過期且不能按下一批。 |
| 18 | corrupt envelope 明示錯誤，不暗中使用 DEMO、舊 v1 或空 seen。 |
| 19 | Matcher 只收到當前 presented 1–40 Jobs，不收到 previous batches。 |
| 20 | 相同當前 Jobs／履歷的既有 Matching 分數、等級及排序不變。 |
| 21 | 對其中一筆互動才走現有 job_snapshot action 寫入。 |
| 22 | 舊批保存 action 依 `sourceKey` 恢復及 rejoin；legacy NULL 與 ghost-card 規則不變。 |
| 23 | 多次擷取、collecting、presented、下一批皆無 bulk DB persistence。 |
| 24 | 關閉 tab 後新 page session 無 working history；不冒稱跨 tab 持續。 |
| 25 | 每份 Connector payload 仍只允許 1–10；11 筆或當份重複整份拒絕。 |
| 26 | 寫入失敗或 Matching 失敗時 current/seen 保留；不發出未保存批次。 |
| 27 | 不同 UID／登出封鎖與清除新 key；same-UID upgrade 保留。 |
| 28 | 舊搜尋非同步擷取在 fingerprint／UID／batch number 改變後回來，不覆蓋新狀態。 |
| 29 | 後續有效 capture 不延長 firstCapturedAt deadline；較早有效候選只會提前 deadline。 |
| 30 | 相同 latest payload 重讀冪等；41st 未接收者在新批次且 payload 仍有效時可重試。 |

**RECOMMENDED NEXT WORK ITEM:** `REAL104_BATCH_TEST_DESIGN`。先把上述狀態轉移、存取失敗、owner/TTL 邊界轉成具體 fixtures 與可執行驗收條件，再另案實作。此設計沒有完成多頁 Extension 人工驗收，也沒有 production 功能可供目前使用者操作。

STOP：Architecture design only；不進入 implementation。
