# Job Quest Guild Phase 6B — 104 Browser Connector Feasibility Audit

> **文件狀態：FINAL — PHASE 6B RESULT: PASS。**  
> 頁面 DOM 低頻 live verification 成功取得 10 筆；Manifest V3 Prototype 已建立且通過靜態檢查。使用者已於 Desktop Chromium 完成 5 筆人工抽查，並確認原安全與隱私驗收條件全部維持。

## 執行摘要

Phase 6B 只驗證一件事：使用者在自己的 Desktop Chromium 正常開啟 104 公開搜尋頁後，能否主動按下 Manifest V3 Extension，從**當前已呈現的 Search Result DOM**低頻讀取前 5～10 筆基本職缺。

建議 Prototype 採 `activeTab` + `scripting`。Chrome 官方文件說明，`activeTab` 只在使用者主動操作 Extension 時暫時授予目前分頁存取權，離開該頁或關閉分頁後即失效，可取代許多 `<all_urls>` 使用情境；`chrome.scripting.executeScript()` 則可在同一使用者動作下把擷取函式注入當前分頁。[Chrome：activeTab](https://developer.chrome.com/docs/extensions/develop/concepts/activeTab)；[Chrome：Scripting API](https://developer.chrome.com/docs/extensions/reference/api/scripting)

此路線不需要自動請求 104、不讀 Cookie、不讀 History、不進入 Job Detail，也不需要任何 Supabase、Proxy、Crawler 或 Anti-Bot 技術。這是技術驗證，不代表 104 的 DOM 是穩定 API 契約，也不構成內容再利用或正式上線授權判斷。

目前結論：**PASS**。2026-09-20 在正常、未登入的 Chromium 公開搜尋頁，以 card-scoped DOM 邏輯成功讀取 10 筆；重新整理一次後，同一組 10 個 Job ID 保持一致。使用者其後在 Desktop Chromium 比對 104 Search Result 與 Detail Page，完成 5 筆人工抽查並回報通過。

## 測試邊界

- 唯一測試搜尋：`keyword=前端工程師`、`area=6001008000`（台中市）。
- 唯一頁面：搜尋結果第一頁。
- 上限：前 5～10 筆，不翻頁、不自動捲動、不逐筆打開 Detail。
- 只讀取目前頁面已存在的 DOM／公開 embedded data；不呼叫 undocumented API。
- 不登入；不讀取 104 帳號、Cookie、Token、履歷或個人頁。
- 不操作 Supabase，不建立 jobs table，不修改 JobQuest 正式 `src/` 或資料流程。
- 不做 CAPTCHA／Cloudflare／Anti-Bot bypass；遇 challenge 立即停止並記錄。

## 1. 測試日期

- 文件與設計稽核日期：**2026-09-20（Asia/Taipei）**。
- DOM 現場驗證日期：**2026-09-20**。
- Desktop Chromium 人工驗收：**已完成（使用者回報）**。

## 2. Browser / Version

- 目標瀏覽器：**Desktop Chromium / Google Chrome，Manifest V3**。
- DOM live test：**Codex In-app Chromium**；頁面載入的 UA Client Hints 回報 **Google Chrome / Chromium 153.0.8010.48，Windows**。
- Desktop Chromium 人工驗收：**已完成**；使用者未提供額外完整版本字串。
- 不在本階段測試 Firefox、Safari 或 Mobile。

## 3. 是否需要登入

- 設計與 Phase 6A 公開搜尋觀察：**LOGIN_REQUIRED = NO**。
- DOM live test：**LOGIN_REQUIRED = NO**；頁面顯示「登入/註冊」，代表測試處於未登入公開狀態。
- 若頁面或功能要求登入，測試立即停止；不取得帳號、密碼、Cookie 或 Session Token。

## 4. 是否遇到 CAPTCHA

- Phase 6A 一般瀏覽器觀察：**NO**。
- Phase 6B DOM live test：**NO**。
- 若出現 CAPTCHA，只記錄並停止，不解題、不重試轟炸。

## 5. 是否遇到 Cloudflare Challenge

- Phase 6A 一般瀏覽器觀察：**NO**。
- Phase 6A 非瀏覽器 request 曾出現 challenge；Phase 6B 不重試該路線。
- Phase 6B 正常 Chromium DOM live test：**NO**。
- 若人工瀏覽遇 challenge，只記錄並停止，不切 IP、不用 Proxy、不規避。

## 6. 使用的方法：DOM / embedded data / other

優先方法：**DOM**。

1. 使用者自行開啟：

   ```text
   https://www.104.com.tw/jobs/search/?area=6001008000&keyword=%E5%89%8D%E7%AB%AF%E5%B7%A5%E7%A8%8B%E5%B8%AB
   ```

2. 使用者點擊 Extension popup 的「讀取目前職缺」。
3. Popup 以 `chrome.scripting.executeScript()` 在 active tab 執行純 DOM 擷取函式。
4. 擷取函式只查看當前 document 中的搜尋卡與 `/job/{jobId}` link，最多回傳 10 筆。
5. Popup 以文字方式顯示 JSON；不儲存、不上傳、不送往 JobQuest。

Content script 預設執行於 isolated world；Chrome 官方文件說明該環境與頁面及其他 extensions 的 JavaScript 變數互相隔離，但仍可使用標準 DOM API 讀取頁面內容。[Chrome：Content scripts 與 isolated world](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts)

不採用：

- Background/server fetch。
- `fetch()`、XHR 或 undocumented 104 API。
- JSON-LD 作唯一資料來源（Phase 6A 顯示搜尋頁 JSON-LD 可能只含部分項目）。
- `webRequest`、network interception、DOM 修改或頁面自動操作。

## 7. Extension Permission

建議最小 Manifest V3 權限：

```json
{
  "manifest_version": 3,
  "permissions": ["activeTab", "scripting"],
  "action": {
    "default_popup": "popup.html"
  }
}
```

| Permission | 是否需要 | 原因 |
|---|---:|---|
| `activeTab` | YES | 使用者按 Extension 後，暫時允許存取當前分頁 |
| `scripting` | YES | 以 `executeScript()` 執行 DOM 擷取函式 |
| `host_permissions` | NO | Prototype 不持久存取任何網站，不做 cross-origin fetch |
| `<all_urls>` | NO | 明確禁止；權限過大 |
| `tabs` | NO | `activeTab` 已覆蓋此次使用者手勢下所需的當前 tab access |
| `storage` | NO | JSON 只顯示於 popup／console，不持久保存 |
| `webRequest` / `declarativeNetRequest` | NO | 不觀察、不攔截、不改寫 network traffic |
| `downloads` | NO | 不下載檔案 |
| `identity` | NO | 不登入、不做 OAuth |

Chrome 建議 extension 只要求核心功能必要權限，並指出 `activeTab` 可作為 `<all_urls>` 的較低權限替代；host permissions 會給予持續與 host 互動、跨來源請求或程式注入的能力，因此此 Prototype 不應申請。[Chrome：保護使用者隱私](https://developer.chrome.com/docs/extensions/develop/security-privacy/user-privacy)；[Chrome：宣告權限](https://developer.chrome.com/docs/extensions/develop/concepts/declare-permissions)

## 8. 是否需要 cookies 權限

**NO。**

- Manifest 不宣告 `cookies`。
- 程式不呼叫 `chrome.cookies`，也不讀 `document.cookie`。
- 不存取 104 authentication/session data。

## 9. 是否需要 history 權限

**NO。**

- Manifest 不宣告 `history`。
- 程式不呼叫 `chrome.history`。
- 不列舉其他分頁或過往瀏覽紀錄。

## 10. 可取得欄位

目標 schema：

| 欄位 | 來源 | 必要 | 現場結果 |
|---|---|---:|---|
| `source` | 固定值 `104` | YES | 10/10 |
| `externalId` / `jobId` | `/job/{jobId}` pathname | YES | 10/10 |
| `title` | 搜尋卡職缺連結／heading | YES | 10/10 |
| `company` | 同一搜尋卡公司文字／link | YES | 10/10 |
| `location` | 同一搜尋卡地區文字 | YES | 10/10 |
| `salaryText` | 同一搜尋卡薪資文字 | YES | 10/10 |
| `canonicalUrl` | 由 `jobId` 產生 | YES | 10/10 |
| `experienceText` | 同一搜尋卡經歷文字 | NO | 10/10 |

資料擷取必須以每張 result card 為範圍查找，不可用整頁索引將不同職缺的 title/company/location/salary 彼此錯配。缺少必要欄位的卡片應被略過或標記錯誤，不可填入猜測值。

## 11. Job ID 穩定性

正規化規則沿用 Phase 6A：

```text
externalId = lower-case 104 job id
sourceKey  = 104:{externalId}
```

Phase 6A 已觀察 `/job/844qv` 等 URL 形式；Phase 6B 必須以低頻手動重新整理／重新執行 Extension（最多數次）確認同一可見職缺的 `externalId` 不變。

- 設計判定：**可建立穩定 ID**。
- 現場重複測試：**YES（一次低頻重新整理）**。重新整理前後前 10 筆 ID 均為：`844qv, 6yhy1, 8ladf, 8p8l8, 94sao, 73eyj, 8v7th, 8v5g8, 84ttm, 8rrwb`。

## 12. Canonical URL

固定輸出：

```text
https://www.104.com.tw/job/{lowercaseJobId}
```

擷取只接受 104 job link pathname 中嚴格的 `/job/([A-Za-z0-9]+)`；輸出時移除 `jobsource`、`from`、其他 query parameters 及 fragment。不以完整 tracking URL 當 unique key。

## 13. 成功取得 Job 數

- 驗收目標：**5～10 筆**。
- DOM live test 實際成功數：**10**。
- 人工抽查數：**5**。
- 只取搜尋第一頁 document order 的前 10 筆有效卡片；不翻頁、不無限捲動。

## 14. Sample JSON

完整 10 筆實際 DOM live-test 輸出保存在 [`experiments/104-browser-connector/sample-output.json`](../experiments/104-browser-connector/sample-output.json)。前 5 筆如下：

```json
[
  {
    "source": "104",
    "externalId": "844qv",
    "sourceKey": "104:844qv",
    "title": "前端工程師",
    "company": "樂澄娛樂有限公司",
    "location": "台中市西屯區",
    "salaryText": "月薪48,000元以上",
    "experienceText": "1年以上",
    "canonicalUrl": "https://www.104.com.tw/job/844qv"
  },
  {
    "source": "104",
    "externalId": "6yhy1",
    "sourceKey": "104:6yhy1",
    "title": "Web 前端工程師",
    "company": "磐弈有限公司",
    "location": "台中市西屯區",
    "salaryText": "月薪40,000~60,000元",
    "experienceText": "1年以上",
    "canonicalUrl": "https://www.104.com.tw/job/6yhy1"
  },
  {
    "source": "104",
    "externalId": "8ladf",
    "sourceKey": "104:8ladf",
    "title": "遊戲前端工程師",
    "company": "捷特威科技股份有限公司",
    "location": "台中市南屯區",
    "salaryText": "月薪45,000元以上",
    "experienceText": "經歷不拘",
    "canonicalUrl": "https://www.104.com.tw/job/8ladf"
  },
  {
    "source": "104",
    "externalId": "8p8l8",
    "sourceKey": "104:8p8l8",
    "title": "前端開發工程師",
    "company": "拓雲資科股份有限公司",
    "location": "台中市西屯區",
    "salaryText": "待遇面議",
    "experienceText": "3年以上",
    "canonicalUrl": "https://www.104.com.tw/job/8p8l8"
  },
  {
    "source": "104",
    "externalId": "94sao",
    "sourceKey": "104:94sao",
    "title": "資深前端工程師",
    "company": "星堡有限公司",
    "location": "台中市西屯區",
    "salaryText": "月薪60,000元以上",
    "experienceText": "5年以上",
    "canonicalUrl": "https://www.104.com.tw/job/94sao"
  }
]
```

上述瀏覽器 DOM 執行結果已由使用者在 Desktop Chromium 以 5 筆樣本完成人工抽查。

## 15. 人工抽查項目

Prototype 成功輸出後，請由人工從輸出中抽查 **3～5 筆**，逐筆比較搜尋頁面上：

- Job ID。
- Title。
- Company。
- Location。
- Salary。
- Canonical URL（點開後應對應同一公開職缺；本階段不自動開啟）。

記錄格式：

| Job ID | 使用者明確回報 PASS 的欄位 | 人工結果 |
|---|---|---|
| `844qv` | Title、Company、Location、Salary、Experience、Job ID、Canonical URL | PASS |
| `6yhy1` | Title、Company、Location、Salary、Experience、Job ID、Canonical URL | PASS |
| `8ladf` | Title、Location、Salary、Experience | PASS |
| `8p8l8` | Title、Location、Salary、Experience | PASS |
| `94sao` | Title、Location、Salary、Experience | PASS |

使用者並整體確認 Phase 6B 人工驗收完成。上表只記錄使用者逐項列出的欄位，不替未逐項列出的欄位捏造額外結果。

## 16. 技術限制

1. 104 搜尋 DOM 與 CSS class 不是公開版本化 API，任何改版都可能使 selector 失效。
2. 搜尋卡可能有置頂／推薦／廣告或不同版型；parser 必須以 `/job/{id}` 為錨點並限制在同一卡片內。
3. 部分欄位可能因職缺內容、版型或 viewport 而缺漏；Desktop Chromium 以外未驗證。
4. 搜尋頁懶載入或 hydration 時序可能造成使用者按下按鈕太早；Prototype 應清楚顯示「未找到」而非自動捲動或輪詢轟炸。
5. `activeTab` 權限會在使用者離開目前頁面或關閉分頁後失效，這是預期的隱私邊界。[Chrome：activeTab](https://developer.chrome.com/docs/extensions/develop/concepts/activeTab)
6. Content script 的 cross-origin request 仍受 same-origin policy；本方案完全不以 network fetch 作為 fallback。[Chrome：Cross-origin network requests](https://developer.chrome.com/docs/extensions/develop/concepts/network-requests)
7. 第一頁小樣本不能證明所有搜尋、所有地區、所有卡片版型皆適用。

## 17. 風險

| 風險 | 影響 | 緩解方式 |
|---|---|---|
| DOM selector drift | 擷取 0 筆或欄位錯配 | 使用語意／URL 錨點、fixture tests、錯誤即停止，不靜默猜值 |
| 欄位錯配 | 錯誤 matching | card-scoped 查詢、人工抽查 3～5 筆、必要欄位 validation |
| 104 頁面版型／A-B test | 部分使用者結果不同 | 結論最多可為 PARTIAL，保留手動 URL/JD fallback |
| Challenge／CAPTCHA | 無法讀取當前結果 | 不重試、不 bypass，立即記錄 FAIL／PARTIAL 條件 |
| 權限膨脹 | 侵犯隱私／降低信任 | 固定 `activeTab` + `scripting`，禁止 cookies/history/all_urls |
| 誤把公開頁當授權 API | 正式產品合規與維運風險 | 本階段只做 local prototype；正式使用另需產品、法務與來源授權評估 |
| Dynamic content timing | 使用者看到結果但擷取過早 | 由使用者在頁面完成呈現後主動按鈕；提供可理解錯誤，不自動高頻重試 |

## 18. 是否依賴 private undocumented API

**NO。**

- Prototype 只讀取使用者目前可見搜尋頁的 DOM。
- 不主動呼叫 104 internal endpoints。
- 不攔截頁面 network response。
- 若未來只有 undocumented/private API 才能取得資料，本路線應回報 **PARTIAL / NOT RECOMMENDED**，不得改用該 API 來製造 PASS。

## 19. 是否有 Anti-Bot bypass

**NO。**

沒有且不得加入：Proxy、UA rotation、stealth browser、CAPTCHA solver、Cloudflare bypass、Cookie farming、Token extraction、高頻重試或其他規避技術。

## 20. 是否付費

**NO。**

本 Prototype 只使用使用者本機 Desktop Chromium、unpacked Manifest V3 Extension 與公開搜尋頁；不使用付費 API、付費 Proxy、遠端 Browser、CAPTCHA service 或 AI API。

## Prototype 驗收步驟

1. 在 Desktop Chromium 以未登入狀態開啟唯一指定的 104 搜尋 URL。
2. 確認頁面正常顯示，記錄是否出現 CAPTCHA／Cloudflare challenge。
3. 從 `chrome://extensions` 以 Developer mode 載入隔離的 unpacked prototype。
4. 確認 manifest 只有 `activeTab`、`scripting`，沒有 host permissions 與其他敏感權限。
5. 在搜尋頁點 Extension →「讀取目前職缺」。
6. 保存 popup／Extension Console 顯示的 5～10 筆 JSON 作稽核證據。
7. 人工抽查 3～5 筆；不得用 extension 自動開 detail。
8. 最多低頻重新整理與重跑數次，確認同一職缺 Job ID 穩定。
9. 記錄 Browser/version、實際筆數、欄位完整度與 console errors。
10. 執行 JobQuest TypeScript、Matching 13/13、Resume Parser 9/9；確認正式 `src/` 未因本實驗修改。

## 最終判定規則

### PASS

只能在以下條件全部滿足後使用：

- 一般人工 Desktop Chromium、公開未登入搜尋。
- 無 CAPTCHA／Cloudflare challenge；沒有任何 bypass。
- 使用者主動點 Extension，可穩定從現有 DOM 取得前 5～10 筆。
- 必要六項資料（Job ID、Title、Company、Location、Salary、Canonical URL）完整且人工抽查 3～5 筆一致。
- Job ID／canonical URL 經低頻重跑保持穩定。
- 只使用 `activeTab`、`scripting`；不讀 Cookie、History、個資，不用 private API。

### PARTIAL

適用例：只能取得部分欄位、少於 5 筆、selector 明顯依賴脆弱結構、不同重跑結果不一致、需人工先完成特定呈現步驟才能讀取。`PARTIAL` 不能包裝成正式可用。

### FAIL

若必須繞 Cloudflare／CAPTCHA、使用 Proxy、大量 request、private API、authentication token、私人 Cookie 或個資才能完成，直接判定 `FAIL`。

## 定稿回報欄位

```text
PHASE 6B RESULT: PASS

- 取得 Job 數量: 10；人工抽查 5 筆 PASS
- 可取得欄位: source, externalId, sourceKey, title, company, location, salaryText, experienceText, canonicalUrl
- Extension permissions: activeTab, scripting（manifest 實檔已確認）
- Login required: NO
- CAPTCHA encountered: NO
- Cloudflare challenge encountered: NO（正常 Chromium 公開頁）
- Private API used: NO
- Anti-Bot bypass: NO
- Cookies accessed: NO
- 個資 accessed: NO
- 是否修改正式專案: NO；只新增 experiments/104-browser-connector 與本報告
- 下一階段是否推薦 Phase 6C: 技術門檻已具備，但本輪依停止條件不開始 Phase 6C
```

## Phase 6C 建議門檻

- `PASS`：可以考慮 Phase 6C，但仍只代表本機 browser-connector 技術可行；正式產品整合、來源授權、發布方式與資料保存需另行審查。
- `PARTIAL`：不建議直接進入正式整合；先決定是否接受 DOM 維護成本，並保留 104 deep link + 使用者貼 URL/JD 的 fallback。
- `FAIL`：不推薦 Phase 6C browser connector；回到 Phase 6A 建議的官方 API／書面許可或手動 URL/JD 路線。

## 第一方來源

1. [104 公開搜尋：前端工程師／台中市](https://www.104.com.tw/jobs/search/?area=6001008000&keyword=%E5%89%8D%E7%AB%AF%E5%B7%A5%E7%A8%8B%E5%B8%AB)
2. [Chrome Extensions：activeTab permission](https://developer.chrome.com/docs/extensions/develop/concepts/activeTab)
3. [Chrome Extensions：Scripting API](https://developer.chrome.com/docs/extensions/reference/api/scripting)
4. [Chrome Extensions：Content scripts](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts)
5. [Chrome Extensions：Declare permissions](https://developer.chrome.com/docs/extensions/develop/concepts/declare-permissions)
6. [Chrome Extensions：Protect user privacy](https://developer.chrome.com/docs/extensions/develop/security-privacy/user-privacy)
7. [Chrome Extensions：Cross-origin network requests](https://developer.chrome.com/docs/extensions/develop/concepts/network-requests)
8. [Phase 6A 稽核報告](./phase-6a-104-technical-audit.md)

## 停止點

Phase 6B 以 **PASS** 停止。本輪不開始正式 JobQuest integration、Phase 6C、Supabase Jobs、Matching Integration、1111、OCR、Cron 或 Deployment。
