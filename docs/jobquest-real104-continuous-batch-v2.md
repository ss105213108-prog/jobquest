# JOBQUEST REAL104 CONTINUOUS BATCH V2

日期：2026-09-30。Type：IMPLEMENTATION。

Final status: **REAL104_CONTINUOUS_BATCH_V2 = PASS**

## 結果與契約

current batch 仍最多 40 個 UNIQUE canonical Job。每個完整且有效的 capture 按 payload 原始順序 normalize；sourceKey 已存在於 current、pending 或 seen 時略過，保留首次接受的資料。current 的剩餘容量填滿後，所有 overflow 保存至 pendingJobs，沒有固定頁面筆數或 pending 截斷。

例：Page 1 = 22、Page 2 = 20，產生 current 前 40＋pending 最後 2；pending 的 validOrdinal 為 Page 2 的 18、19（0-based）。Matching 只接 current 40，pending 不進 Matching 或 Board。

既有 domain `startNextBatch(uid, now)` 只允許 presented 狀態：將剛呈現的 current sourceKeys 追加至 seen，批號加一，從 pending 首端消耗最多 40。剩餘 pending 保持順序。若 current 不足 40，回傳 collecting 並等待下一頁匯入；若正好 40，先保存 collecting＋remaining pending，再使用既有 Matcher adapter 完成 Matching、保存 presented。沒有「下一批」按鈕或其他新 UI；此 API 可供之後單獨批准的 UI 工作使用。

既有 partial commit、current first-seen 順序、Matching 分數／排序、收藏與 snapshot 流程維持。presented current 與以前批次的 seen 分開保存；下一批 transition 才搬入 seen，符合原 Batch 契約。

## pending 與 v2 session

新 authority key：`jobQuest.real104Batch.v2`，envelope `version: 2`。保存原有 ownerUid、keyword、region、searchFingerprint、batchNumber、phase、currentBatchJobs、seenSourceKeys、firstCapturedAt、presentedAt，新增：

```ts
pendingJobs: Array<{
  job: Job
  sourceUrl: string
  capturedAt: string
  validOrdinal: number
}>
```

pending queue 的首項就是 continuation position，不另存一個可能與佇列衝突的 cursor。消耗時直接移除 queue 首端，下一次從新首項續接，不能重新讀取來源頁第一筆。

還原嚴格檢查 current／pending／seen sourceKeys 互斥且唯一、current ≤ 40、collecting 未滿時 pending 為空、pending canonical Job、sourceUrl 的公開搜尋來源與 keyword/region、capturedAt 與 Job collectedAt 一致，以及 ordinal 為非負 safe integer。view 以深複製回傳，呼叫者不能意外改動已保存 pending。

F5 可還原 collecting 或 presented 的 current、pending、seen、批號、fingerprint 與 TTL anchor。presented 的 Matching 仍由現有 hook 使用目前 Confirmed Resume 重算；未將分數或 Resume 保存進 session。

30 分鐘 TTL 仍以最早 accepted capturedAt 為準。後續 capture、切批、Matching、F5 不延長；較早的有效 capture 只能將 anchor 往前移。到期後不暴露 current／pending／seen。keyword 或 region 的新 fingerprint 重置全部工作狀態，same fingerprint 保留。

## 相容與失敗處理

- v2 key 不存在時，才讀 `jobQuest.real104Batch.v1`。有效、未到期、同 UID 的 v1 將既有 current／seen／phase／批號／anchor 原樣遷移到 v2，pending 為空；不能假造 v1 已丟失的 overflow。
- 遷移必須成功寫入 v2 才回報還原。quota/write failure 拋出原型別 `STORAGE_WRITE_FAILED`，v1 原始 bytes 保留，沒有假成功。
- v1 原始 bytes 保留為不啟用的相容備份；v2 存在時始終優先，包括 corrupt、expired、owner-mismatch，絕不回退 v1。
- 清除 batch storage 會先刪 v1，再刪 v2，避免清除 v2 後舊 v1 復活；不動 `jobQuest.real104Session.v1`。Adapter 只允許讀取這兩個 batch key、寫入 v2，其他 key 仍拒絕。
- 普通匯入先原子保存 current＋pending，再 Matching。Matching 失敗或 presented 寫入失敗保留 collecting 40＋pending，可 F5／partial commit retry。切批寫入失敗保留原 presented＋pending，不能回報已移動 cursor。
- next batch 由 pending 填滿 40 時，Matching 失敗會留下已成功保存的新 collecting 40、未消耗的 pending 與前批 seen；沒有丟失候選。

舊 REAL 單頁 session 保留原十筆格式與原還原規則。已有 legacy 卡片且尚未明確啟動 batch 時，新的整頁 payload 不可經舊 `slice(0, 10)` 路徑匯入。Board 對此顯示既有契約所要求的「請先開始新批次搜尋」提示，同時保留原卡片與 legacy storage bytes；明確搜尋後才走 v2。這是相容邊界保護，沒有將十筆限制放回 Connector 或新 Batch。

## 變更檔案

Production：

- `src/services/real104BatchWorkingSet.ts`：pending、切批、v2 schema、v1 遷移與 restore。
- `src/services/real104BatchSessionStorage.ts`：v2 寫入、v1 fallback 讀取、清除兩版本。
- `src/hooks/useReal104Batch.ts`：missing view 補上空 pending；沒有新增下一批 action/UI。
- `src/pages/BoardPage.tsx`：阻止整頁誤入 legacy 截斷路徑，保留原卡片。

Tests：

- `tests/real104ContinuousBatchV2.test.ts`：新增 15 個 persistence／failure／完整性案例。
- `tests/real104BatchSessionStorage.test.ts`：round-trip 版本改成 2，unsupported version fixture 改成 3；保留其他斷言。
- `tests/real104BatchAppIntegration.test.tsx`：舊「必須提供下一批按鈕」測試被本票明確「不加下一批 UI」取代。更新為 UI 不存在，再透過既有 domain API 切批、F5 還原，保留原 pending／seen/current 斷言，並新增批號及 pending drain 斷言。沒有 skip／刪除測試。

Connector capture script、background worker（包括前票暫時診斷）、App payload schema、Matcher adapter、Matching service、legacy REAL session 的本輪前後 SHA-256 均相同。未修改 DB/RLS/Auth/Resume，沒有自動翻頁或捲動。

## 驗證

實作前上述 Batch／Storage／App subset 為 62 PASS／22 EXPECTED RED。實作後這 22 個新契約缺口已清除，沒有額外 EXPECTED RED。

| 檢查 | 結果 |
| --- | --- |
| full-page continuous contract | 20/20 PASS |
| 新 v2 pending／restore tests | 15/15 PASS |
| 既有 Batch Foundation | 40/40 PASS |
| Storage Adapter | 10/10 PASS |
| Matcher Adapter | 7/7 PASS |
| App integration（無下一批 UI） | 14/14 PASS |
| full-page Connector contract | 14/14 PASS |
| 上述 focused run 合計 | 120/120 PASS |
| Connector／REAL／地區／Matching／Snapshot regression run | 355/355 PASS |
| App Typecheck | PASS |
| 新增／更新測試 Typecheck | PASS |
| Production build | PASS |
| Full suite | **2331 PASS / 5 FAIL** |
| 新 regression | **NONE** |
| 真實瀏覽器人工 V2 驗收 | **NOT VERIFIED**；本票為實作與自動驗證 |

build 僅有既有 bundle size advisory；沒有 TypeScript 或 build error。focused 與 regression runs 有部分相同 tests，不將兩者相加當成 unique test count。

Full suite 剩下的五個失敗與前輪 `jobquest-full-page-capture-full-suite.json` 的 test fullName 及完整 failureMessages 逐項相同：

1. RP-014 approved reconstruction behavior keeps two-column sections in their own reading-order regions
2. RP-014 approved reconstruction behavior does not interleave sidebar content with the main experience region
3. RP-014 approved reconstruction behavior separates same-Y text that belongs to different columns
4. RP-014 approved reconstruction behavior rejoins contiguous CJK heading fragments without inserting spaces
5. RP-014 public PDF parser reproduction does not merge same-Y anonymous PDF fragments from separate columns

full-suite evidence 保存於系統 TEMP：`jobquest-continuous-batch-v2-full.json`。未修改 PDF production 或 tests。

主要驗證命令：

```text
node node_modules/vitest/vitest.mjs run tests/real104ContinuousBatchV2.test.ts tests/real104ContinuousBatch.contract.test.ts tests/real104FullPageConnector.contract.test.ts tests/real104BatchAppIntegration.test.tsx tests/real104BatchDomain.contract.test.ts tests/real104BatchSession.contract.test.ts tests/real104BatchSeams.contract.test.ts tests/real104BatchSessionStorage.test.ts tests/real104BatchMatcherAdapter.test.ts --reporter=dot --silent
node node_modules/vitest/vitest.mjs run tests/job104Integration.test.ts tests/real104FullPageConnector.contract.test.ts tests/real104PayloadDiagnostics.test.ts tests/real104Session.test.ts tests/real104SessionRegression.test.tsx tests/real104MatchingFlow.test.tsx tests/taiwan104Regions.test.tsx tests/taiwan104Preferences.test.tsx tests/matchingEngine.test.ts tests/jobSnapshot.test.ts tests/jobSnapshotPersistence.test.ts --reporter=dot --silent
node node_modules/typescript/bin/tsc --noEmit -p tsconfig.app.json --pretty false
node node_modules/vite/bin/vite.js build
node node_modules/vitest/vitest.mjs run --reporter=json --outputFile=.tmp-continuous-v2-full.json --silent
```

STOP。下一批 UI、Connector capture／diagnostic 修復或進一步產品流程不在本票實作範圍。
