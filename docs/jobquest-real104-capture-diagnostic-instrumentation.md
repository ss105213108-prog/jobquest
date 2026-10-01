# JOBQUEST REAL104 CAPTURE — DIAGNOSTIC INSTRUMENTATION

日期：2026-09-30

Final status: **READY_FOR_REAL_PAYLOAD_REPRODUCTION**

## 暫時診斷點

唯一 production 檔案變更：`browser-extension/jobquest-104-connector/service-worker.js`。在已確認 popup sender 的 `JOBQUEST_104_STORE_CAPTURE` 分支，既有 `isPayload` 前後新增兩筆 console log，前綴為 `[DEBUG-REAL104-PAYLOAD]`。

- `before`：message/payload 的實際 type、頂層 keys/欄位型別、jobsIsArray、jobsLength，以及每筆 job 的 index、record type、七個必要欄位與兩個 optional 欄位的 type。
- `after`：原本 `isPayload` 的最終 PASS/FAIL。FAIL 時附第一個失敗條件的 jobIndex（0-based；envelope 失敗為 null）、field、actual type/value summary、expected。
- null、undefined、array 與一般 object 分開顯示。字串只輸出長度與最多 80 字的 preview；物件只列最多 24 個 keys，array 只列長度。每筆 job 的常規診斷只輸出型別，不 dump 職缺內容或整包 payload。
- 失敗定位依現有驗證順序：envelope → canonical jobs → sourceKey uniqueness。若後方 job 格式錯誤且前方也有 duplicate，先記錄 canonical job 格式錯誤，符合原驗證順序。
- 正常 PASS 不重新檢查每個 job 的失敗原因。不增加 capture 次數，不改 latest-capture ownership，也不修改 storage 或 payload。

既有 `isPayload`／`isCanonicalJob` 規則完整保留；原本判斷結果只計算一次並保存到局部 boolean，用同一結果做診斷與原分支判斷。診斷獨立 try/catch；console 或摘要失敗不會改變回傳。來源不合法的 sender 仍在診斷前拒絕。

未修復 payload、未新增數量限制、未修改 extraction/popup/App/Batch/Matching/Auth/Resume/DB。

## 驗證

| 檢查 | 結果 |
| --- | --- |
| 新診斷 tests | 23/23 PASS |
| full-page Connector contract | 14/14 PASS |
| job104Integration | 10/10 PASS |
| 合計 | 47/47 PASS |
| App Typecheck | PASS |
| 新測試 Typecheck | PASS |
| `node --check` worker | PASS |
| Manifest JSON / MV3 / referenced entry files | PASS |
| Worker 在測試 Chrome harness 註冊與正常處理訊息 | PASS |
| 真實瀏覽器重新載入 Extension | NOT VERIFIED；待下列人工操作 |
| 真實 104 失敗 payload／根因 | NOT VERIFIED；本次提供診斷能力 |

測試證明：22 筆完整 payload 不變且保存相同物件；每個 required/optional null 都維持原 `malformed` 回傳；duplicate／malformed 不覆蓋上一份 valid capture；摘要截斷；console 拋錯仍維持 PASS/FAIL 結果；未授權 sender 不產生診斷。

執行：

```text
node --check browser-extension/jobquest-104-connector/service-worker.js
node node_modules/vitest/vitest.mjs run tests/real104PayloadDiagnostics.test.ts tests/real104FullPageConnector.contract.test.ts tests/job104Integration.test.ts --reporter=dot
node node_modules/typescript/bin/tsc --noEmit -p tsconfig.app.json --pretty false
node node_modules/typescript/bin/tsc --ignoreConfig --noEmit --target ES2022 --module ESNext --moduleResolution bundler --types vite/client --skipLibCheck tests/real104PayloadDiagnostics.test.ts --pretty false
```

## 重新載入與取得現場 log

1. 在安裝 Connector 的瀏覽器開啟 `chrome://extensions/`；Edge 使用 `edge://extensions/`。
2. 找到 **Job Quest 104 Connector**，確認它指向本 workspace 的 `browser-extension/jobquest-104-connector`，按「重新載入」。這次不用重新安裝或新增權限。
3. 在同一張 Extension 卡片點 **service worker** 的檢查連結，開啟 DevTools **Console**，確保 Info/log 層級可見。若看不到此連結，展開 Extension 詳細資訊；依既有開發者模式操作。
4. 保留 Console，切回正常載入職缺的 104 公開搜尋頁，開啟 Connector popup，按「擷取目前職缺」一次。
5. 回到 **background service worker Console**，搜尋 `[DEBUG-REAL104-PAYLOAD]`。log 不在 104 頁面 Console，也不是 popup Console。
6. 提供 `before` 的 message/payload shape、jobsIsArray/jobsLength，以及 `after` 的完整 firstFailure。若是 job 失敗，再展開 jobFieldTypes 中該 jobIndex 的型別；不需要整包 jobs dump。

例如（僅示意，**不是實際根因證據**）：

```text
[DEBUG-REAL104-PAYLOAD] after
{
  isPayload: 'FAIL',
  firstFailure: {
    jobIndex: 12,
    field: 'snippetText',
    actual: { type: 'null', value: null },
    expected: 'undefined or string'
  }
}
```

本次不嘗試修正。取得真實 log 後再完成根因調查。診斷為暫時功能；後續清理時移除 DEBUG 區段及兩個 log 呼叫，保留既有驗證與控制流程。
