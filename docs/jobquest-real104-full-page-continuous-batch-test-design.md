# JOBQUEST REAL104 FULL-PAGE CONTINUOUS BATCH — TEST DESIGN

**Type:** TEST DESIGN / CONTRACT UPDATE  
**Final status:** **READY_FOR_REAL104_FULL_PAGE_IMPLEMENTATION**  
**Production code changed:** **NO**

本文件把已核准的[整頁連續批次設計](jobquest-real104-full-page-continuous-batch-design.md)轉成可執行契約，並依使用者授權完成舊斷言遷移。新測試在現行十筆 Connector／丟棄 overflow 的 production 上應為 **RED**；READY 表示測試契約可交給 implementation，**不是**新功能已實作或真實 104 人工驗收完成。

## 測試檔與觀察界面

| 檔案 | 契約 |
| --- | --- |
| `tests/real104FullPageConnector.contract.test.ts` | 用 test-only DOM fake 執行正式 `capture-jobs.js`，驗證 17／19／22 筆完整頁面、DOM 順序、無效／重複卡略過；執行正式 worker script，驗證完整 payload 可透過現有 latest-capture channel 保存、取得，並確認第二次擷取仍覆蓋未匯入的第一次；檢查 App DTO parser 可接受完整頁面。 |
| `tests/real104ContinuousBatch.contract.test.ts` | 透過既有 Batch 對外操作與 memory Storage／Matcher Port 驗證跨頁 40 切割、pending 順序、下一批先消耗 pending、跨批去重、F5／TTL／UID、失敗原子性與版本相容。test-only `pendingJobs` 觀察形狀為 `{ job, sourceUrl, capturedAt, validOrdinal }[]`；隊首即續接位置。 |
| `tests/real104BatchAppIntegration.test.tsx` | **保留原 11 個斷言**，另加獨立 `REAL 104 full-page continuous App contract` 三例：整頁匯入後一次顯示 40 並保留 18 pending、呈現後的「下一批」續接、legacy REAL 卡片不得將新整頁 capture 暗中切十筆。 |

測試沿用 `tests/helpers/real104BatchContract.ts` 的匿名 canonical Job、sourceKey、假履歷、memory Storage 和 spy Matcher。Extension test 讀取並執行正式套件腳本，未複製擷取迴圈作假實作。頁面筆數為**測試樣例**，規則依輸入長度而定，沒有將 20 當成每頁常數。每次跨頁操作明確採「capture → import → 下一頁 capture → import」；不測、不宣稱 Extension 會保留多份未匯入 payload，也不要求自動翻頁或捲動。

## 具體案例與成功條件

| 領域 | 可執行斷言 |
| --- | --- |
| Connector 完整頁 | 17、19、22 張有效卡全進 payload，`104:{jobId}` 依 DOM 次序；第十張後的有效卡仍保留；無效卡和同頁重複 key 略過。worker 對 19 筆回 `ready` 並以現有 `GET_LATEST` 取回全部；App parser 不將 17／19／22 誤判 malformed。只有最新一次未匯入擷取由 worker 持有。 |
| 40／pending 切割 | 18+20+20 → current 為前 40，pending 為 Page 3 後 18；Matcher 僅一次收到 ordered current 40。17+19+22 得到同樣 40／18；單次 91 筆時依序成 40／40／11，沒有資料因容量而丟棄。 |
| 續接與去重 | 已滿批次按「下一批」時先把 presented 40 加 seen，再以 pending 隊首建立新 current；新頁只接在 pending 之後。重擷取舊頁時，seen、current、pending 的同 key 都跳過，不以後來標題覆寫首次 Job；合法三筆 capture 在 38/40 時也必留一筆 pending，避免所有失敗只停在十筆 payload parser。 |
| Matching／儲存失敗 | 滿 40 後 Matching 失敗仍為 collecting 40，pending 與 seen 不丟；pending 寫入失敗保留上一完整 envelope，不能回報匯入成功；下一批 transition 寫入失敗維持原 presented 40 與 pending。 |
| F5／TTL／UID | F5 還原 presented 或失敗後 collecting 的 current、pending、fingerprint、批號與 `firstCapturedAt`；Batch 2 F5 還原先消耗 pending 後加入的新頁 Job 及前批 seen。相同 fingerprint 不改狀態；換 keyword／region 清 current、pending、seen、批號、續接位置及 TTL anchor。最早 capture 在 30 分鐘邊界仍可用，+1 ms 全部過期；後續頁不延長。不同 UID 看不到 current、pending、seen 或 fingerprint。 |
| 版本相容 | 有效 Batch v1 collecting／presented 可保守轉到 v2，保留已知 current／seen／批號而 pending 空；不得虛構 v1 已丟的 overflow。若 v2 損毀，不能退回有效 v1。更舊 `jobQuest.real104Session.v1` 的十筆上限與既有卡片還原保持；legacy 卡片狀態下的新完整頁匯入須提示先明確開始新批次，不能暗中取前十。 |

## 原 TEST DESIGN 執行紀錄

執行：

```powershell
./node_modules/.bin/vitest.cmd run tests/real104FullPageConnector.contract.test.ts tests/real104ContinuousBatch.contract.test.ts tests/real104BatchAppIntegration.test.tsx --reporter=json
```

結果 **14 PASS / 29 EXPECTED RED**（43 tests）：原 App 整合 **11/11 PASS**；新 Connector **1 PASS / 8 RED**，新 Continuous Batch **2 PASS / 18 RED**，新 App **0 PASS / 3 RED**。29 個失敗均落在已知未實作行為：十筆截斷、worker／parser 拒絕整頁、缺少 pending／v2 migration／下一批 UI、或 legacy 整頁提示；沒有 test harness crash 或新增 production regression。3 個新綠燈確認 latest-capture ownership、pending 寫入失敗時舊 current 不被覆蓋、legacy REAL 十筆 session 仍可讀。

RED 是下一張 implementation ticket 的驗收目標，不可把它們標成目前產品 PASS，也不可為使測試變綠而 `skip`、`todo`、放寬 sourceKey、改 Matching 公式或把普通 capture 寫入 Supabase。新 App 測試與原 11 例使用不同 `describe`，可個別重跑原人工 PASS 接線契約。

## LEGACY TEST CONTRACT MIGRATION

使用者已核准替代兩項舊契約：overflow 必須保存於 pending；合法完整頁面 payload 不受十筆上限限制。查核發現這兩項契約實際出現在 **三個測試位置**，其中 Connector parser 是 G34 十筆限制的重複斷言。此次只更新這些被 supersede 的行為，未修改 production。

| 舊契約位置 | Superseded 期望與保留的保護 |
| --- | --- |
| `tests/real104BatchDomain.contract.test.ts` B11 overflow | 舊「不 queue」已 superseded。38 筆加三筆時 current 仍只收前二且總數 40，第三筆不可進 current／seen，必須依來源順序留在 `pendingJobs`；原 current 順序、seen 排除與 overflow 計數斷言保留。 |
| `tests/real104BatchSession.contract.test.ts` G34／L60–L61 | 舊「合法 11 筆必拒絕」已 superseded。相同合法 payload 須為 ready，所有 sourceKey 依來源順序進 collecting、seen 仍空。11 是超過舊限制的反例，不是新每頁上限。 |
| `tests/job104Integration.test.ts` parser size assertion | 同一十筆契約的重複斷言同步 superseded，改為完整接受合法候選並保留順序。原 combined test 的 malformed、重複 sourceKey、空 payload、canonical tracking URL 和 invalid source URL 斷言原樣保留在獨立綠燈測試；只有 size rejection 移到新增的契約測試。 |

三個遷移測試的名稱／註解明確標記 `superseded`，沒有刪除、skip、todo 或 expected-failure 標記。其餘既有已 PASS 行為不變；更舊 REAL session 的最多十筆格式仍由原 session 回歸及新相容測試保護。

## 遷移後驗證與失敗分類

執行下列 12 個測試檔（包含新契約與舊回歸）：

```powershell
./node_modules/.bin/vitest.cmd run tests/real104FullPageConnector.contract.test.ts tests/real104ContinuousBatch.contract.test.ts tests/real104BatchAppIntegration.test.tsx tests/real104BatchDomain.contract.test.ts tests/real104BatchSession.contract.test.ts tests/real104BatchSeams.contract.test.ts tests/real104BatchSessionStorage.test.ts tests/real104BatchMatcherAdapter.test.ts tests/job104Integration.test.ts tests/real104Session.test.ts tests/real104SessionRegression.test.tsx tests/real104MatchingFlow.test.tsx --reporter=json
```

**217 PASS / 32 EXPECTED RED / 0 UNEXPECTED REGRESSION**（249 tests）。逐項與前次測試結果比對，32 個 RED 是原有 29 個 full-page 新功能契約，加上本次三個 migrated assertion；沒有其他原應 PASS 的 case 失敗。

| 驗證 | 結果 |
| --- | --- |
| Batch Foundation（含遷移後 B11、G34） | **38 PASS / 2 EXPECTED RED**；失敗為 pending 未實作及十筆 parser 尚未解除。 |
| Batch Storage／Matcher Adapters | **17/17 PASS**。 |
| 原 Batch App Integration | **11/11 PASS**（3 個新增 App 契約另外維持 RED）。 |
| Connector regression | **11 PASS / 1 EXPECTED RED**；唯一 RED 是合法超過十筆的 parser 契約。原無效欄位／重複 key／URL 檢查 PASS。 |
| REAL session／REAL Matching 回歸 | **137/137 PASS**。 |
| 新 full-page／continuous／App 契約 | **3 PASS / 29 EXPECTED RED**，與遷移前相同。 |
| Production Typecheck | **PASS**。 |
| 新增／編輯測試的 TypeScript 檢查 | **PASS**。 |

EXPECTED RED 表示核准的新契約尚未由 production 實作，不能視為 runtime 新功能 PASS。UNEXPECTED REGRESSION 表示任何未被 supersede、原本應 PASS 的 case 失敗；本次為 **0**。本輪未要求或執行 production build／full suite，也未進行真實 104 人工驗收。

**下一工作項：REAL104_FULL_PAGE_CONTINUOUS_BATCH_IMPLEMENTATION**。舊斷言遷移已完成，可按此契約實作 Connector／DTO、pending／v2 session／App UI；之後再要求相關測試全綠、正式建置及真實 104 人工驗收。本輪 STOP。
