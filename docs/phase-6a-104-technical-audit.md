# Job Quest Guild Phase 6A — 104 公開職缺技術稽核

- 觀察日期：2026-09-20（Asia/Taipei）
- 稽核範圍：一組關鍵字 `前端工程師`、一個地區 `台中市`、搜尋首頁與一筆公開職缺詳情
- 性質：唯讀技術稽核；不是 Phase 6B 實作
- 未執行：登入、CAPTCHA、反自動化繞過、Proxy、User-Agent 輪替、大量翻頁、排程、Crawler、Jobs Table、Gmail 整合、Supabase 修改、產品程式修改

## 1. 執行摘要

| 問題 | 判定 |
|---|---|
| 公開搜尋是否能匿名使用 | **可行，但只確認一般瀏覽器的低頻互動模式** |
| 公開詳情是否能匿名使用 | **可行，但只確認一般瀏覽器的低頻互動模式** |
| 是否找到公開、文件化、可供第三方正式串接的 JSON API | **NO** |
| 搜尋資料取得機制 | **A：server-rendered HTML + JSON-LD，另有 client hydration** |
| 詳情資料取得機制 | **A：server-rendered HTML + `JobPosting` JSON-LD，另有 client hydration** |
| Frontend 直接跨來源請求 104 | **不建議／不能視為可行** |
| Backend/server-side adapter | **技術上可設計，但目前不適合直接正式上線** |
| 最穩定的近期 Phase 6B | **使用者貼 JD；URL 僅做識別與 canonicalization，抓取需等官方許可或可用官方 API** |
| 是否可直接開始正式串接 | **NO** |

核心原因：搜尋頁與詳情頁在匿名一般瀏覽器中確實可見，initial HTML 與 JSON-LD 也提供足以 normalize 成 JobQuest Job 的資料；但是舊式／推測的 `/jobs/search/api/jobs` 路徑無法取得可靠 JSON，非瀏覽器 HEAD request 收到 Cloudflare `403` challenge，`robots.txt` 亦未能驗證，且目前沒有一般第三方可依賴的公開 API 契約、rate limit、SLA 或批量再利用授權。**公開可瀏覽不等於可穩定自動擷取或獲得再利用授權。**

因此 Phase 6A 的結論是：**資料格式驗證成功；正式即時自動串接尚未通過上線門檻。**

## 2. 稽核方法與安全邊界

本次只進行以下低頻驗證：

1. 一次公開搜尋：`keyword=前端工程師`、`area=6001008000`。
2. 只開啟一筆搜尋結果詳情：job ID `844qv`。
3. 觀察公開 HTML、DOM、`application/ld+json`、canonical link 與頁面載入模組。
4. 對搜尋頁、詳情頁各做一次非瀏覽器 HEAD request，以確認伺服器與保護層行為。
5. 對一個舊式／推測 JSON 路徑做一次直接驗證；失敗後即停止，沒有猜測更多 endpoint。
6. 查閱 104 官方 FAQ、會員／求職規約、隱私中心與官方企業 API 產品頁。

沒有讀取任何求職者履歷、姓名、Email、電話或會員資料；詳情頁出現的公司公開聯絡區塊不是本產品所需欄位，未納入 mapping。

## 3. 公開搜尋流程與資料取得機制

### 3.1 實際 query mapping

驗證 URL：

```text
https://www.104.com.tw/jobs/search/?area=6001008000&keyword=%E5%89%8D%E7%AB%AF%E5%B7%A5%E7%A8%8B%E5%B8%AB
```

| JobQuest 輸入 | 104 request parameter | 實際值 | 證據 |
|---|---|---|---|
| `keyword` | `keyword` | `前端工程師`（URL encoded） | 搜尋欄顯示「前端工程師」 |
| `location` | `area` | `6001008000` | 地區 UI 顯示「台中市」 |

本次沒有加入 `page`、`order`、`ro` 或其他歷史範例參數，也沒有翻頁。地區不能直接把顯示文字 `台中市` 當成 request 值；未來需維護受測試的 display-name → area-code mapping。

### 3.2 機制判定

判定為：**A. HTML server rendered，並帶有 JSON-LD；瀏覽器 JavaScript 再做 hydration／互動增強。**

證據：

- 搜尋頁的 initial response 可直接讀到結果卡內容，而不是只有空的 app shell。
- 頁面含 `application/ld+json`：`WebPage` → `ItemList`，前三筆包含 `position`、job `@id`、`name`、description snippet 與 canonical job URL。
- 頁面另載入 104 自有 ES module：`//cdn.104.com.tw/cindex/jobs/index/js/index.BFl8BHwa.js`，說明互動層仍有 client-side 程式，但初始職缺資料不必依賴一個已驗證的 JSON XHR 才能顯示。
- 搜尋頁不是 GraphQL；本次沒有觀察到可採信的 GraphQL request。

舊式／推測路徑：

```text
https://www.104.com.tw/jobs/search/api/jobs?ro=0&keyword=前端工程師&area=6001008000&page=1&mode=s&jobsource=2018indexpoc
```

直接導覽失敗，沒有取得可用 JSON。故不得把網路舊文章或過往範例中的 `/jobs/search/api/jobs` 當成現行正式 API。

### 3.3 搜尋首頁小樣本

觀察當下 UI 顯示約 262 筆；這只是 2026-09-20 的即時頁面快照，筆數會隨職缺更新而變化。首頁可見的 job ID 範例包括：

```text
844qv, 6yhy1, 8ladf, 8p8l8, 94sao, 73eyj, 8v7th, 8v5g8, 84ttm, 8rrwb
```

只有 `844qv` 被開啟做詳情驗證，其餘僅作為列表 URL／ID 格式證據，沒有逐筆抓取。

## 4. Job ID 與 URL normalization

### 4.1 穩定識別

搜尋卡連結：

```text
https://www.104.com.tw/job/844qv?jobsource=joblist_list
```

詳情頁 canonical、Open Graph URL 與 `mainEntityOfPage`：

```text
https://www.104.com.tw/job/844qv
```

詳情頁 JSON-LD 也提供：

```json
{
  "identifier": {
    "@type": "PropertyValue",
    "value": "844qv"
  }
}
```

因此可使用：

```text
source = "104"
externalId = "844qv"
uniqueKey = "104:844qv"
```

### 4.2 canonical 規則草案

1. 接受 `https://www.104.com.tw/job/{jobId}` 及其 query-string 版本。
2. 從 pathname 嚴格擷取 `/job/([A-Za-z0-9]+)`。
3. 將 ID 正規化為小寫。
4. 移除所有 query parameters，例如 `jobsource`、`from`、追蹤與廣告參數。
5. 輸出：`https://www.104.com.tw/job/{lowercaseJobId}`。
6. 不以完整 tracking URL 當 unique ID。

## 5. Search Result 欄位證據

| 欄位 | 可取得 | 來源 | 可靠度 | 備註 |
|---|---|---|---|---|
| job ID | YES | `/job/{id}` link；部分 JSON-LD `@id` | 高 | 應作為 `externalId` |
| title | YES | 搜尋卡 heading/link；JSON-LD name | 高 | |
| company | YES | 搜尋卡 company link | 高 | 搜尋 JSON-LD ItemList 未必包含公司 |
| location | YES | 搜尋卡 location link/text | 高 | 例如台中市西屯區 |
| salary text | YES | 搜尋卡 salary link/text | 高 | 保留「月薪…」「待遇面議」原文 |
| experience | YES | 搜尋卡 experience link/text | 高 | 例如 1年以上、經歷不拘 |
| education | YES | 搜尋卡 education link/text | 中高 | JobQuest 現有 Job type 沒有獨立欄位 |
| date | YES | 卡片顯示月／日 | 中 | 未帶年份；不可自行假造完整 timestamp |
| description | PARTIAL | 卡片 snippet；JSON-LD description snippet | 中 | 完整內容需詳情頁 |
| industry/category | YES | 搜尋卡產業 link/text | 中高 | 可暫作 category 候選，但不等同職務類別 |
| skills/tools | PARTIAL | snippet 中可能出現 | 低 | 不應只靠 snippet 建 requiredSkills |
| job URL | YES | 搜尋卡 job link | 高 | 必須 canonicalize |

Search HTML selector 不是正式 API contract，class／結構可能改版；搜尋頁 JSON-LD 只列出部分首頁項目，不能單獨視為完整結果集合。

## 6. Job Detail 欄位證據

驗證頁：[`https://www.104.com.tw/job/844qv`](https://www.104.com.tw/job/844qv)

匿名一般瀏覽器可讀完整頁面。initial HTML／DOM 有完整資訊，並含 Schema.org `JobPosting` JSON-LD；詳情頁另外載入 `//cdn.104.com.tw/cindex/job/js/index.CZ6m6Q9y.js` 做互動增強。

| 欄位 | 可取得 | 來源 | 樣本／說明 | 可靠度 |
|---|---|---|---|---|
| job ID | YES | JSON-LD `identifier.value`、URL | `844qv` | 高 |
| title | YES | DOM、JSON-LD `title` | 前端工程師 | 高 |
| company | YES | DOM、JSON-LD `hiringOrganization.name` | 樂澄娛樂有限公司 | 高 |
| full description | YES | DOM、JSON-LD `description` | 完整工作內容 | 高 |
| location | YES | DOM、JSON-LD `jobLocation.address` | 台中市西屯區；JSON-LD 可含地址 | 高 |
| salary text | YES | DOM、JSON-LD `baseSalary.value` | 月薪48,000元以上 | 高 |
| experience | YES | DOM、JSON-LD `experienceRequirements.monthsOfExperience` | DOM 1年以上；JSON-LD 12 months | 高 |
| education | YES | DOM；JSON-LD educationRequirements | DOM「專科以上」較可讀 | 中高 |
| employment type | YES | DOM、JSON-LD `employmentType` | 全職／FULL_TIME | 高 |
| industry | YES | DOM、JSON-LD `industry` | 網際網路相關業 | 高 |
| work hours | YES | DOM、JSON-LD `workHours` | 日班 | 高 |
| tools | YES | DOM「擅長工具」；JSON-LD description 內也列出 | Git、HTML、JavaScript、CSS、Node.js、VueJS、HTTP | 中高 |
| work skills | YES | DOM、JSON-LD `skills` | 系統維護操作等 | 高 |
| date posted/updated | YES | DOM 與 JSON-LD | DOM「08/07更新」；JSON-LD `datePosted=2026-08-07` | 高（樣本） |
| validThrough | YES | JSON-LD | 有值，但不可等同「仍在招募」的永久保證 | 中 |
| category | YES | DOM「職務類別」 | 前端工程師 | 高 |

### 6.1 Required Skills 策略

104 詳情頁有兩類來源：

- 結構化「擅長工具」與「工作技能」。
- description 內的自然語言技術要求，例如 NUXT、GitHub、Go API。

JSON-LD 的頂層 `skills` 在樣本中只收錄「工作技能」，不等於頁面所有技術工具；「擅長工具」被放在 JSON-LD description 文字中。因此 Phase 6B 應：

1. 優先收集「擅長工具」與 JSON-LD `skills`。
2. 再用既有 `skillDictionary`／canonical normalization 從 description 擷取技術詞。
3. 合併、canonicalize、去重。
4. 不使用 AI，不把福利／產業詞誤當技能。

### 6.2 日期策略

- detail 樣本可取得 ISO `datePosted`，優先採用。
- search card 只有 `月/日` 時，保留 raw date text，不應自行補年份。
- 頁面用語是「更新」，JSON-LD 欄位是 `datePosted`；不能在沒有額外證據時把兩者硬分成 publication date 與 update date。
- 現有 JobQuest Job 只有 `publishedAt`；若來源語意不確定，Phase 6B 應加 adapter metadata（例如 `sourceDateText`、`dateKind`），不要捏造精確時間。

## 7. CORS、Browser、Server viability

| 執行位置 | 結論 | 證據／風險 |
|---|---|---|
| 一般使用者瀏覽器直接導航 104 頁面 | 可行 | 匿名搜尋與一筆詳情成功顯示；不需登入 |
| JobQuest frontend `fetch(104 URL)` | 不建議，不能視為可行 | 沒有成功 200 response 的公開 CORS 證據；challenge response 無 `Access-Control-Allow-Origin`，並有 `Cross-Origin-Resource-Policy: same-origin` |
| Backend／server-side HTTP client | 技術風險高 | 對 search 與 detail 的非瀏覽器 HEAD request 都回 `403 Forbidden`、`Cf-Mitigated: challenge` |
| Headless browser／自動瀏覽器 | 不採用 | 會增加反自動化衝突、維護與合規風險；本次沒有嘗試規避 |
| 舊 undocumented JSON endpoint | 不採用 | 直接驗證失敗，沒有文件、版本或 SLA |
| HTML／JSON-LD parser | 僅可作受控 POC | 欄位足夠，但 selector/schema 漂移、Cloudflare、授權與維運風險尚未解決 |

非瀏覽器 HEAD 回應同時顯示 Cloudflare challenge。這不代表所有 backend request 永遠失敗，但足以否定「任意 server adapter 可穩定零成本直抓」的假設。Phase 6B 不得以偽造瀏覽器、旋轉 UA、Proxy、cookie farming 或 CAPTCHA service 修補此問題。

## 8. Login、CAPTCHA、Anti-Bot、免費性與政策

### 8.1 實測

- 查看公開 search：不需登入。
- 查看公開 detail：不需登入。
- 本次一般瀏覽器沒有出現可見 CAPTCHA。
- 非瀏覽器 request 收到 Cloudflare managed challenge。
- 沒有繞過任何 challenge。
- 瀏覽公開頁面沒有付費。

### 8.2 不能過度推論的地方

- 匿名可瀏覽不等於第三方取得批量擷取／重發／建庫權利。
- 沒有觀察到 rate-limit 數字、API SLA、版本契約或公開再利用授權。
- `robots.txt` 在本次檢查中被 client／Cloudflare 阻擋，**內容無法驗證**；不可將「未讀到」解釋成允許。
- 104 官方求職規約說明職缺內容由求才廠商提供並由 104 刊登，不能假設所有內容權利都可由第三方自由複製。
- 104 對企業登入／履歷資料有明確反自動化與個資限制；其文字範圍不能不當外推成「所有匿名公開頁都一律禁止」，但 JobQuest 仍應完全避開會員帳號、履歷與求職者個資。

### 8.3 官方 API

104 有面向企業 ATS 的「JOB／Resume API」產品，但官方頁要求洽詢／索取介紹，沒有找到可供一般第三方匿名使用的公開 job-search API、免費額度或公開價格。因此正確表述是：

> 未找到現行、文件化、供一般第三方免費匿名使用的 104 職缺搜尋 API；企業 API 是否適用與費用需向 104 洽詢。

不能直接宣稱企業 API 必定付費，也不能把它當作本專案已可使用的免費來源。

## 9. JobQuest Mapping Draft

依現有 `src/types/index.ts` 的 `Job`：

| 104 raw | JobQuest Job | 規則 |
|---|---|---|
| URL／JSON-LD `identifier.value` | `externalId` | lower-case job ID |
| 固定值 | `source` | `"104"` |
| `title` | `title` | trim，保留原文 |
| `hiringOrganization.name`／company link | `company` | 保留原文 |
| `jobLocation.address.addressLocality`／DOM | `location` | 建議顯示到市／區；不要混入完整門牌做篩選值 |
| `baseSalary.value`／DOM salary | `salary` | 原始文字優先；不強制轉數字 |
| DOM experience／`monthsOfExperience` | `experience` | 優先使用可讀原文；數值只作輔助 metadata |
| DOM 職務類別；產業只作 fallback | `category` | 不把 company industry 與 job category 混為一談 |
| JSON-LD／DOM full description | `description` | 清理 HTML，保留換行語意 |
| tools + work skills + rule-based description extraction | `requiredSkills` | 使用 Phase 5 canonical skill normalization；去重；不使用 AI |
| canonical job URL | `url` | `https://www.104.com.tw/job/{jobId}` |
| JSON-LD `datePosted` | `publishedAt` | 只有可信 ISO date 才轉；僅相對／月日文字時不可捏造 |
| adapter collection time | `collectedAt` | 由 JobQuest 產生 ISO timestamp |
| adapter availability state | `status` | 初次取得為 `active`；不可只靠 `validThrough` 永久判定 |
| derived | `id` | 建議 deterministic `104-{externalId}` 或內部 UUID；去重仍以 `(source, externalId)` |

建議未來 adapter raw model 額外保留：`sourceDateText`、`dateKind`、`rawTools`、`rawSkills`、`observedAt`、`schemaVersion`。不要為了符合現有 Job 型別而填入虛構值。

## 10. 方案比較

| 方案 | 使用門檻 | 即時性 | 穩定性 | 維護成本 | 零成本 | JobQuest 適配度 | 結論 |
|---|---|---:|---:|---:|---:|---:|---|
| A. 104 公開即時搜尋自動擷取 | 使用者低；系統高 | 高 | 低 | 高 | 公開頁免費，但正式成本／授權未知 | 中 | **目前不建議正式上線**；CORS、Cloudflare、無公開 API contract、政策／授權未清 |
| B. 104 官方通知 + Gmail | 使用者需 104 與 Email 設定；不應強迫一般使用者 | 日報／週報，非完全即時 | 高於 scraping | 中 | 104 配對信與 Gmail 基本使用可免費；整合成本仍存在 | 適合 Phase 8 市場雷達 | **不適合作為 Phase 6 即時搜尋主路線**；官方 FAQ 證實配對日報／週報 |
| C. 使用者貼 104 URL／JD | URL 自動抓取仍受限；貼 JD 最低風險 | 使用者當下 | 貼 JD 高；URL fetch 中低 | 低 | YES | 高 | **近期首選 fallback／可作 Phase 6B 第一小步**；保留 matching 核心價值 |
| D. 104 搜尋 deep link + 使用者手動挑選 | 低；使用者在 104 正常瀏覽 | 高 | 高 | 低 | YES | 中高 | **推薦與 C 組合**：JobQuest 產生官方搜尋 URL，使用者挑選後貼 URL/JD；不自動擷取整頁結果 |
| 官方 JOB／Resume API（未列為免費 D） | 需與 104 商務／技術洽詢 | 高 | 理論上最高 | 中 | UNKNOWN | 潛在最高 | **正式自動化首選調查方向**，但不能在費用、權限、用途未確認前施工 |

### Gmail 官方通知適用性

104 官方 FAQ 說明配對信需加入 My104、設定配對條件並使用 Email；可訂閱日報或週報。日報通常星期二至星期六寄送前一日新工作，週報寄送過去一週新工作。因此它更適合：

- Phase 8 定期市場雷達。
- 維護 `source + job_id` 基準資料，判斷新增／仍在招募／可能下架／重新上架。
- 由已主動選擇此功能的使用者串接，而不是所有 JobQuest 使用者的必備條件。

它不適合取代即時搜尋，且本 Phase 不建立 Gmail Integration。

## 11. Phase 6B 建議技術路線

### 11.1 建議順序

**第一階段（可立即規劃）：C + D，不自動抓 104。**

1. JobQuest 依 `keyword` 與 location mapping 產生 104 官方搜尋 deep link。
2. 使用者在 104 正常瀏覽並挑選職缺。
3. 使用者貼 canonicalizable 104 URL，並貼上 Job Description／必要欄位文字。
4. JobQuest 在本地／frontend 做 rule-based normalization、skill extraction 與 Phase 5 matching。
5. 不登入 104、不保存帳密、不繞 challenge、不建立 crawler。

**第二階段（需先取得新證據／權限）：官方 API 或經 104 書面許可的 server adapter。**

只有在確認官方 API 用途、費用、授權與技術文件，或取得 104 明確書面許可後，才做受限的一次性 server-side search/detail adapter。

### 11.2 十項明確回答

1. **資料來源**：近期用使用者貼上的 JD + 104 URL；未來優先官方 API／授權資料，不把 undocumented endpoint 當正式來源。
2. **Frontend 還是 Backend**：貼 JD 的解析與 matching 可在 frontend；任何 URL fetch／官方 API 必須經 backend adapter，不能由 frontend 直接跨來源請求。
3. **是否需要新的 Server Component**：**NO**。目前專案是 Vite React，不是 Next.js；不應硬加 Server Component。未來若獲授權，只需獨立 HTTP backend/serverless adapter。
4. **是否需要 Supabase Edge Function**：Phase 6B 第一階段 **NO**。若未來官方 API 需要保護 credential、做 rate limit，可把 Edge Function 當部署選項，但不是既定必要條件，也不可在 Phase 6A 建立。
5. **是否可以零成本**：C + D **YES**；公開頁自動擷取無法保證零維運成本；官方 API 成本 **UNKNOWN**。
6. **一次搜尋建議最多幾筆**：若將來取得授權，預設 **20 筆、最多 20 筆、不自動 pagination**；需使用者明確要求才取下一頁。
7. **如何避免重複**：unique key `(source, externalId)`，亦即 `104:{jobId}`；不要用 tracking URL。
8. **如何 canonicalize URL**：只保留 `https://www.104.com.tw/job/{lowercaseJobId}`，移除全部 query／fragment。
9. **如何轉成 Job Type**：依第 9 節 mapping；缺欄位保留 unknown／raw，不捏造；skills 走現有 dictionary normalization。
10. **如何接進 jobService**：Phase 6B 先新增可替換的 `JobProvider`／adapter seam，保留現有 `mockJobs` 作預設與 fallback；通過獨立 contract tests 後才由 feature flag 選 provider，不直接刪除或覆寫 mock flow。

### 11.3 正式自動搜尋的 go/no-go 門檻

以下全部完成前不得把 A 上線：

- 取得 104 書面許可或正式 API 合約／文件。
- 確認允許的欄位、保存期限、顯示／連結／attribution 規範。
- 確認 rate limit、錯誤碼、版本策略與下架處理。
- 驗證 production server 可在不繞 anti-bot 的情況取得資料。
- 驗證 CORS 或 backend-only boundary。
- 以少量固定 fixture 建 schema drift／parser contract tests。
- 設定每次最多 20 筆、零自動翻頁、指數退避與 challenge 即停。
- 保留 manual URL／JD fallback。

## 12. 驗收結論

| 驗收項目 | 結論 | 說明 |
|---|---|---|
| 104 Public Search | **部分可行** | 匿名一般瀏覽器可看；正式自動取得不建議 |
| 104 Detail | **部分可行** | 匿名一般瀏覽器與 JSON-LD 欄位完整；server automation 受 challenge 風險 |
| 是否需要 Login | **NO** | 公開 search/detail 不需要；官方配對信需要 My104 |
| 是否需要 CAPTCHA | **特定情況** | 一般瀏覽器本次沒有；非瀏覽器 request 出現 Cloudflare managed challenge |
| 是否需要付費 | **NO（本次公開頁稽核）／UNKNOWN（官方 API）** | 不需付費 API、Proxy、Browser、CAPTCHA 或 AI；官方企業 API 未公開價格 |
| 是否需要繞 Anti-Bot | **NO** | 且明確不採用任何繞過方案 |
| 是否找到穩定 Job ID | **YES** | URL path + JSON-LD identifier，例如 `844qv` |
| 是否能建立 Canonical URL | **YES** | `https://www.104.com.tw/job/{jobId}` |
| 是否能取得真實 Company | **YES** | search card、detail DOM、hiringOrganization |
| 是否能取得 Location | **YES** | search card 與 detail address |
| 是否能取得 Salary Text | **YES** | 原始薪資文字可保留 |
| 是否能取得 Description | **YES** | detail HTML／JSON-LD；search 只有 snippet |
| 是否能取得 Experience | **YES** | DOM text + monthsOfExperience |
| 是否能取得 Skills | **直接 + 規則解析** | 直接 tools/work skills，再從 description 用既有 dictionary 擷取 |
| 是否能取得 Date | **YES（detail）／PARTIAL（search）** | detail 有 datePosted；search 月日可能缺年份 |
| 是否可以轉成 JobQuest Job | **YES** | 格式足夠；正式自動資料取得仍需額外通過 go/no-go |
| Frontend 直接 fetch | **NO／不建議** | 無可依賴 CORS 證據，challenge response 限 same-origin |
| Backend adapter 立即上線 | **NO** | 403 challenge、無正式 API contract、robots／授權未確認 |
| AI API | **NO** | 不需要 |
| 付費 Proxy／Browser／CAPTCHA | **NO** | 不採用 |
| Phase 6B 是否已開始 | **NO** | 本文件只提出方案 |

## 13. 第一方來源

觀察日期皆為 2026-09-20；動態職缺內容之後可能變動。

1. [104 公開搜尋：前端工程師／台中市](https://www.104.com.tw/jobs/search/?area=6001008000&keyword=%E5%89%8D%E7%AB%AF%E5%B7%A5%E7%A8%8B%E5%B8%AB)
2. [104 公開職缺詳情：844qv](https://www.104.com.tw/job/844qv)
3. [104 配對工作 FAQ](https://www.104.com.tw/faq/match)
4. [104 配對信 FAQ](https://www.104.com.tw/faq/match-letter)
5. [104 搜尋工作 FAQ](https://www.104.com.tw/faq/search-job)
6. [104 求職會員規約](https://www.104.com.tw/info/terms)
7. [104 資訊科技集團會員規約](https://accounts.104.com.tw/terms)
8. [104 隱私中心](https://privacy.104.com.tw/)
9. [104 官方：HR 使用 AI 處理履歷的合規提醒](https://blog.104.com.tw/hr-ai-resume-screening-legal-risks/)
10. [104 官方 JOB／Resume API](https://ehr.104.com.tw/products/job-resume-api/)

## 14. 最終建議

**Phase 6B 建議先做 C + D：104 deep link + 使用者貼 URL/JD + 現有 rule-based matching。** 這條路線免費、不需登入或保存 104 帳密、不需繞任何保護，也能保留 Job Quest 的核心價值。

若產品目標必須是「JobQuest 內直接搜尋 20 筆真實 104 職缺」，下一步不是直接寫 scraper，而是先向 104 確認官方 API／書面許可、用途、費用與 rate limit。只有取得這些條件，才進入 server-side adapter 的 Phase 6B 實作。

Phase 6A 到此停止。
