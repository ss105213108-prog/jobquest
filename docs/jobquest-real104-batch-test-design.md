# JOBQUEST REAL 104 BATCH IMPORT — TEST DESIGN

日期：2026-09-30。此案只新增**測試設計、測試專用 helper、可執行的預期 RED 測試**。未實作 batch manager、UI、Connector、Normalizer、Matching、Auth、Resume、資料庫、RLS 或 sessionStorage production 邏輯。契約來源是 [能力調查](jobquest-real104-batch-capability-investigation.md) 與**已核准**的 [架構設計](jobquest-real104-batch-design.md)。本文件不重新設計其功能。

## 測試接縫與檔案

| 接縫 | 新檔案 | 驗證內容 |
|---|---|---|
| 純批次邏輯 | `tests/real104BatchDomain.contract.test.ts` | fingerprint、收集、容量、canonical identity、提交、跨批去重、重複擷取。 |
| session 序列化／還原 | `tests/real104BatchSession.contract.test.ts` | malformed 防護、F5、UID、最早 capturedAt TTL、corrupt、storage failure、tab 隔離。 |
| 整合接縫 | `tests/real104BatchSeams.contract.test.ts` | Matching 只接當前已提交批次；既有 action/snapshot 按互動寫入。 |
| 測試專用 helper | `tests/helpers/real104BatchContract.ts` | 匿名合法 payload、memoryStorage、注入時鐘／matcher，以及擬定的批次公開介面。 |

**擬定的可測介面**：未來 `src/services/real104BatchWorkingSet.ts` 匯出 `createReal104BatchWorkingSet({storage, matchJobs, getConfirmedResume})`，提供 `startOrResumeSearch(intent, uid, now)`、`addCapture(payload, uid, now)`、`presentCurrentBatch(resume, uid, now)`、`startNextBatch(uid, now)`、`restore(uid, now)`。`getConfirmedResume` 只為滿 40 筆後自動提交時取得目前已確認履歷；無履歷時須保留 collecting 並呈現 Matching 錯誤，不能偷偷提交。回傳至少包含 `status`、fingerprint、batch number、當前 normalized Jobs、previous seen IDs、firstCapturedAt；擷取結果另有 accepted/skipped/overflow。這是**測試所需的最小公開行為介面**，不是 production 實作。測試只從該介面觀察狀態，並透過注入 matcher、storage 驗證依賴；可在 foundation 工作項中讓介面型別與實際 module 一同落地，不得為求綠燈改掉已核准行為斷言。

所有 fixture 為匿名 `104:j0`、`104:ja` 等合成 ID；保留現行 validator 要求的 `/^[a-z0-9]+$/`，canonical URL 為 `https://www.104.com.tw/job/{id}`。題目中的 `104:job-a` 僅是概念示意，含 `-` 的 job ID **不符合現行 104 payload schema**，因此不作合法測試 fixture。沒有私人履歷、真人、特定學校、真實公司特例或 production job ID。每份合法擷取仍為 1–10 筆；`sourceUrl` 由現行 `build104SearchUrl` 生成，頁碼只作正常公開結果頁的意圖測試，不影響 fingerprint。

## 63 項需求對照與判準

下表中的案例編號對應本案題目。共 **39 個新 Vitest test instances**，若單一情境同時驗證相鄰要求，保留明確斷言；既有已通過的 REAL 104 測試保護 frozen 接縫。新測試目前會在載入尚不存在的批次模組時停止，因此下述行為斷言須待 foundation 實作後逐一轉綠；不能把目前的 RED 當作每項行為已被實際執行。

| 題目編號 | 新測試或既有回歸 | 判準 |
|---|---|---|
| A 1–2 | Domain `A1–A2` | 同條件、關鍵字前後空白得到同一三元 fingerprint；只 `trim()`。 |
| A 3–4；H 35–36 | Domain 兩個 `it.each` instances | keyword／region 改變重設 current、seen、批號 1。 |
| A 5–6；H 37 | Domain `A5–A6, H37` | 頁碼、擷取順序不變更 fingerprint，仍累積到 current。 |
| B 7–8 | Domain `B7–B8` | 10→20，仍 collecting；沒有提早跑 Matcher。 |
| B 9–10 | Domain `B9–B10` 與 `B10 no confirmed resume` | 四份各十筆得到 40 unique、自動提交／presented，Matcher 收到恰 40；沒有已確認履歷時保留可還原的 collecting 40，不暗中提交。 |
| B 11 | Domain 兩項 `B11` | full 後第 41 筆不進入也不逐出舊 Job；溢位只取餘額且不標 seen。 |
| C 12、14；L 62 | Domain `C12, C14, L62` | 跨次 current overlap 略過；同 title/company 不同 key 可並存且依首次擷取順序排列。 |
| C 13 | Domain `C13 contract resolution`、既有 `job104Integration` | **整份重複 payload 拒絕**，不是「收一筆」，詳見衝突說明。 |
| C 15 | Domain `C15` | 同 key 即使 title/company 改變仍略過，保留首次已接受 Job。 |
| D 16–18；J 53–54 | Domain `D16–D19`、`D16 zero-job`；Seams `J51–J54` | 1–39 可顯式提交、0 不可；提交前 Matcher 未呼叫、seen 未增加；提交後 current 可顯示／可匹配。 |
| D 19 | Domain `D19` | 未提交 partial 改搜尋後不得進入 seen。 |
| E 20–23 | Domain `E20–E23` | 「下一批」把前一個 presented 的 IDs 原子轉 seen，清空 current，舊候選被拒、新候選可收。 |
| E 24–26 | Domain `E24–E26` | 第三批排除前兩批 IDs，不以舊 Jobs 補滿。 |
| F 27–29；L 63 | Domain `F27–F29`、`F28–F29` | current-only／seen-only／重讀 latest payload 均不改 count、phase、fingerprint、seen；無 Demo fallback。 |
| G 30 | Session `G30` | **一筆 malformed 時整份 capture 拒絕**，先前合法 current 保留；詳見衝突說明。 |
| G 31–32 | Session `G31–G32` | 缺 canonical key 的後續 capture 不能毀損之前合法 state。 |
| G 33 | Session `G33` | `null`／無新 capture 不變更 current、seen 或 TTL anchor；Extension 仍可能留有舊 latest，不能將其宣稱為新擷取。 |
| G 34；L 60–61 | Session `G34, L60–L61`、既有 `job104Integration` | 11 筆整份拒絕；batch 不會放寬 Connector DTO 或 40 上限。 |
| H 38–39 | Domain `H38–H39` 加未來 UI integration | 同 intent 重送不重設 current／seen。**真正的** local rerank／Board presentation 操作需在 UI wiring 可用後加觀察測試；目前沒有可操作的 batch UI，不能假稱已覆蓋 UI 行為。 |
| I 40、43–44 | Session `I40, I43–I44` | 同 storage 新 instance（模擬 F5）恢復 partial、各 Job capturedAt、batch 1、fingerprint。 |
| I 41–42 | Session `I41–I42` | F5 恢復 presented current 與以前 seen；再按 next，當前 IDs 才加入 seen。 |
| I 45–46 | Session `I45–I46` | 不同 UID 無法取用 current／seen；同 UID upgrade／登出清理的 App wiring 將於 foundation/integration 測試補強。 |
| I 47–48 | Session `I47–I48` | anchor 恰好 30 分鐘有效，超過 1ms expired。 |
| I 49 | Session 兩項 `I49` | 後續新擷取不延長 deadline；較早、仍有效的來源只會讓 anchor 提前。 |
| I 50 | Session `I50` | corrupt batch state 不回退舊 REAL session 或 Demo。 |
| J 51–54 | Seams `J51–J54` | collecting 不呼叫 Matcher；第 1、2 批各只配當前已提交 Job。 |
| J 55 | Seams `J55`、既有 `matchingEngine`／`real104MatchingFlow` | 呼叫既有 Matcher，確認 canonical Job 可進入；公式、分級、排序靠 frozen regression，未修改其 implementation。 |
| K 56–57 | Seams `K56–K57`、既有 `jobSnapshotPersistence` | batch import／present 不呼叫既有 action upsert；互動一筆才寫一筆 snapshot。額外直接 Supabase 寫入仍需 implementation code review 排除。 |
| K 58 | Seams `K58`、既有 `jobActionApp` | snapshot 只能由同一 sourceKey 恢復／rejoin。 |
| K 59 | Seams `K59`、既有 `jobSnapshotPersistence` | legacy NULL snapshot 保留 action flags，不製造舊卡。 |

未來補充的 failure-gate 測試：Matching 失敗時 partial 保持 collecting、storage 寫入失敗時原 current 可 F5 還原、不同 tab 不共用 history；上述三者已有新測試。實際 Auth 登出事件、使用者可見 Board 操作、stale async 回應與完整 Extension 多頁操作須在相應 consumer 存在後作 integration／人工驗收；本案不能用假的 UI 流程冒充已完成。

## 契約衝突：依已核准架構處理

1. 題目 **C13** 要求「單份 capture 內重複 sourceKey → 收一筆」，但架構設計及現有 `parse104Payload` 明定：單份重複 IDs 是 malformed，**整份拒絕**。跨多份合法 capture 的重複才略過。因此測試鎖定整份拒絕；未改 Connector validator。
2. 題目 **G30** 要求「一筆 malformed job 夾在有效 jobs 中 → 有效 jobs 仍可用」，但架構設計明定整份 validator 先於 batch，malformed payload **不可採納有效子集合**。測試鎖定整份拒絕、已保存的**先前** current 仍可用。這既保留故障安全，也不偷偷改為部分接受。

上述是測試清單與已核准架構的**兩項已定位衝突**，不是 production 被測出的 regression；本案以使用者指明的「approved architecture is source of truth」裁決，沒有重設計。若產品真要在*同一份 malformed payload* 部分採納，必須另案修改已凍結 Connector schema，不能靠 batch 測試暗改。

## 執行與 RED／GREEN 證據

- 新測試：`vitest run tests/real104BatchDomain.contract.test.ts tests/real104BatchSession.contract.test.ts tests/real104BatchSeams.contract.test.ts --reporter=dot`。**39 EXPECTED RED / 0 unexpected failure**。所有 RED 的共同失敗點是 `Cannot find module '../../src/services/real104BatchWorkingSet'`；production 批次模組尚未實作，因此各 case 的行為斷言目前**未跑到**。不能說 39 個行為已驗證。
- 既有 REAL 104／session／Matching／snapshot／action：12 files，**369 PASS / 0 FAIL**。與先前能力調查相同的 focused set；沒有重新開啟 PDF baseline 或進行瀏覽器人工驗收。
- `npm run typecheck`：**PASS**（production `tsconfig.app.json`）；新四個測試／helper 另以 TypeScript `--ignoreConfig --types vite/client` 檢查 **PASS**。沒有修改 TS project 設定。

**TEST CONTRACT CREATED:** YES。**Test groups:** A–L，按純批次邏輯、session／restore、整合接縫分檔。**Executable test count:** 39 個新 Vitest instances。**Expected RED tests:** 39，全部因 production 批次 module 缺席而 fail；行為斷言尚未抵達。**Existing regressions:** PASS，12 files／369 tests。**Production code changed:** NO。**Connector changed:** NO。**Matching changed:** NO。**Database changed:** NO。**RLS changed:** NO。**Contract contradictions discovered:** 題目 C13 與 G30 共兩項；均按已核准架構裁決為整份 malformed payload 拒絕，詳見上節。

**Recommended next work item:** `REAL104_BATCH_FOUNDATION_IMPLEMENTATION`。foundation 只能在上述契約與 frozen 邊界內逐步使 RED 轉綠，並補上當時才可能執行的 UI／Auth lifecycle integration 驗證。

STOP：Test design only；不開始 production batch implementation。
