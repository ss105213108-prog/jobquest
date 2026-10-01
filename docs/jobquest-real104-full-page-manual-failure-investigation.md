# JOBQUEST REAL104 FULL-PAGE CAPTURE — MANUAL FAILURE INVESTIGATION

日期：2026-09-30。範圍：調查與文件；本輪未修改 production code、測試契約或使用者資料。

Final status: **BLOCKED_REAL104_FULL_PAGE_CAPTURE_INVESTIGATION**

## ERROR ORIGIN

已確認原始碼中的唯一錯誤文字來源：`browser-extension/jobquest-104-connector/service-worker.js`，`JOBQUEST_104_STORE_CAPTURE` handler 的 `!isPayload(message.payload)` 分支：

```js
sendResponse({ status: 'malformed', message: '擷取資料格式不正確。' })
```

`popup.js` 收到非 `ready` response 後，用 `response.message` 建立 Error，再將文字顯示到 status 與 error output。這不是 popup 自己的完整 payload validation 錯誤，也不是 App 的 payload parser 產生。

## 完整訊息鏈

1. popup 按鈕呼叫 `captureJobs()`，查詢目前 active tab 並確認是公開 104 搜尋頁。
2. popup **直接**呼叫 `chrome.scripting.executeScript({ target: { tabId }, files: ['capture-jobs.js'] })`；不是先透過 worker 要求 content script 擷取。
3. `capture-jobs.js` 的 IIFE 在頁面上同步讀取所有已存在的 `.job-list-container`，逐卡驗證、以 sourceKey 去重，回傳 payload。它不是等待 message 的常駐 content-script handler。
4. popup 取得 `results[0]?.result`，只先確認 `payload?.jobs?.length` 非空。
5. popup 發送 `{ type: 'JOBQUEST_104_STORE_CAPTURE', payload }` 給 background worker。
6. worker 確認 sender、驗證完整 payload。驗證失敗回傳上述 `malformed`；通過才保存 latest payload。
7. popup 依 response status 顯示結果。失敗路徑沒有把原始 capture payload 印出，只印 Error，因此目前 popup 的 error output 本身無法證明是哪個 job／欄位失敗。

## REAL RESPONSE SHAPE

**NOT VERIFIED。未取得使用者失敗操作的 executeScript result 或 worker 收到的 message.payload。**

| 欄位／觀察 | 現場證據狀態 |
| --- | --- |
| executeScript response type、results[0].result type | NOT VERIFIED |
| jobs 是否為 array | NOT VERIFIED |
| jobs count | NOT VERIFIED |
| version/source/capturedAt/sourceUrl 實值 | NOT VERIFIED |
| 各 job required fields 與型別 | NOT VERIFIED |
| undefined/null、malformed item、duplicate sourceKey | NOT VERIFIED |
| 實際載入 Extension 的檔案版本／路徑 | NOT VERIFIED |

使用者已回報 Extension 重新載入、搜尋頁正常且 popup 顯示指定文字。此回報支持錯誤發生，但不能取代 actual response shape。

現場讀取嘗試：browser inventory 只提供沒有 tabs 的 Codex in-app browser／MCP Apps，沒有可直接讀取的外部 Chrome tab。原生工具找到了 Microsoft Edge 的單一開啟視窗；嘗試讀取時工具回覆：`Computer Use has been stopped for this turn because it could not determine the current browser URL on Windows with enough confidence to enforce policy.` 本輪隨即停止所有原生瀏覽器操作，未重试或繞過限制。

## EXPECTED RESPONSE SHAPE

capture 原始碼的回傳 envelope：

```ts
{
  version: 1,
  source: '104',
  capturedAt: string, // 非空且 Date.parse 有限
  sourceUrl: string, // https://www.104.com.tw/jobs/search/…
  jobs: Array<{
    externalId: string,
    sourceKey: string,
    title: string,
    company: string,
    location: string,
    salaryText: string,
    canonicalUrl: string,
    experienceText?: string,
    snippetText?: string
  }>
}
```

worker 要求 jobs 為非空 array，每個 required field 都是非空字串。externalId 必須是小寫英數字；sourceKey 為 `104:${externalId}`；canonicalUrl 為 `https://www.104.com.tw/job/${externalId}`；sourceKey 不得重複。optional experienceText/snippetText 只接受 undefined 或 string，**不接受 null**。

worker response 正常為 `{ status: 'ready', … }`；此次錯誤分支為 `{ status: 'malformed', message: '擷取資料格式不正確。' }`。實際失敗 response 尚未從瀏覽器擷取。

## Automated fixture vs real boundary

`tests/real104FullPageConnector.contract.test.ts` 使用真實 capture/worker 原始碼，但透過 `new Function` 與 fake DOM 執行。fixture 沒有 experience/snippet 時，capture 物件仍包含 optional properties，其值是 undefined。

fixture worker harness 將此 JS 物件直接傳給 fake onMessage listener，sendResponse 也直接回傳給測試。它沒有經過真正的 `chrome.scripting.executeScript` result 傳遞或 `chrome.runtime.sendMessage` serialization。因此 automated PASS 證明 fixture 與直接函式契約，不能證明瀏覽器跨 context 的實際 shape 保持一致。本輪未重新執行 163 tests；163/163 為使用者與前輪已提供的 baseline。

## ROOT CAUSE

**NOT VERIFIED。已定位拒絕層為 worker isPayload；尚未定位失敗 predicate。**

候選原因依查證優先順序：

1. **跨 context 傳遞改變 optional 值。** capture 明確產生 `experienceText: … || undefined` 與可能 undefined 的 snippetText；worker 拒絕 null。若真正傳遞後出現 null，fixture 的直接物件呼叫會漏掉此問題。需分別觀察 capture result 與 worker message；本輪沒有瀏覽器傳遞實證，不能宣稱 undefined 已轉 null。
2. **真實卡片的 required field／identifier 形狀未被 fixture 覆蓋。** 需找出第一個不通過 isCanonicalJob 的 index、sourceKey、欄位型別，以及 envelope／去重 predicate。不能只從畫面有職缺推定 payload 合法。
3. **實際載入 Extension 與 workspace 版本不同。** 重新載入並不能證明載入資料夾；需比對 active Extension 的 capture/worker 實際來源與 workspace，確認沒有舊上限。
4. **executeScript/message contract 形狀不一致。** 需確認 `results[0].result` 與 worker 接收 envelope，而不是把 result wrapper、錯誤或非預期值當成 payload。

目前不可判定 content extraction／selector 是根因；可確定文字由 background validation 回傳，popup 僅轉述。也沒有證據支持恢復 10 筆上限。

## 10-JOB ASSUMPTION REMAINS

**NO — 就 workspace 的本次 popup → capture → worker → App payload validation 路徑。**

capture loop 無 MAX_JOBS／10 筆 break；worker 無最大 jobs.length 條件；App `src/integrations/job104/schema.ts` 無大於 10 拒絕條件。`src/integrations/job104/types.ts` 的 `JOB104_MAX_JOBS = 10` 仍供 legacy session snapshot 相容使用，並不參與本次 popup worker 的 validation。實際載入 Extension 版本仍 NOT VERIFIED。

## AFFECTED FILES

調查關聯檔案（不是本輪修改清單）：

- `browser-extension/jobquest-104-connector/popup.js`：executeScript、STORE_CAPTURE、錯誤轉述。
- `browser-extension/jobquest-104-connector/capture-jobs.js`：full-page card extraction、optional 欄位。
- `browser-extension/jobquest-104-connector/service-worker.js`：isPayload/isCanonicalJob、錯誤來源。
- `tests/real104FullPageConnector.contract.test.ts`：直接 JS 物件 fixture，沒有真實 Chrome context 傳遞。
- `src/integrations/job104/schema.ts`：下游同樣拒絕 optional null；不是此次 popup 錯誤來源。

本輪只新增本調查文件。

## MINIMAL FIX BOUNDARY

**尚不能批准具體 production fix。** 下一步只需從既有 Extension DevTools 取得失敗時的 executeScript result 和 worker 接收 payload，逐項套用現有 predicates，並確認載入來源。可使用暫時 debugger watch／console inspection，不需要修改 production 檔案。

所需最小現場證據：jobs array/count、envelope 值、第一個失敗 job 的 index/sourceKey、每個 required/optional 欄位的型別（特別區分 missing、undefined、null）、worker response，以及 Extension 載入路徑。不要提供帳號 token 或私人資料。

若證實是 optional serialization，修正邊界應落在 capture 輸出／跨 context message 契約，使缺少的 optional 值符合既有 string-or-absent 契約，並補真正序列化邊界的回歸證據；不可藉由弱化 worker/App validation 轉綠。若證據顯示其他 predicate 失敗，應依第一個失敗條件另定最小範圍。

Batch/pendingJobs、Matching、storage、DB/RLS/Auth/Resume 與 Quest Board 均不在本次調查或修正邊界。

## STOP

調查文件完成；現場 shape 與根因未確認，不能標示 READY_FOR_REAL104_FULL_PAGE_CAPTURE_FIX。依 diagnosing-bugs 技能的重現要求，本輪保留 blocked 狀態，等待可讀取的現場 trace；沒有 production 修正。
