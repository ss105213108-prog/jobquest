# JOBQUEST 104 REGION MAPPING EVIDENCE

調查日期：2026-09-29（Asia/Taipei）。範圍：公開 104 求職搜尋 UI 的外部證據與文件，無正式程式實作。

## 結果

- Known Taichung mapping reverified: **YES**，台中市 → `6001008000`；沒有 KNOWN_MAPPING_DRIFT。
- Verified regions: **20 / 22**。
- Unverified regions: **新竹縣、嘉義縣**（純縣範圍）。
- 全部地區 verified: **YES**。
- All mappings based on direct evidence: **YES**，限 PASS 項目；兩個 UNVERIFIED 未接受映射。
- Guessed mappings: **0**。
- Connector change required: **NO**。
- Normalization change required: **NO**。
- Database change required: **NO**。
- Recommended next action: **BLOCKED_REGION_MAPPING_EVIDENCE**。

## 方法與接受條件

每個 PASS 縣市均實際執行：公開地區選單 → 清除其他選取 → 勾選單一整市／整縣分類（城市子選項則展開父分類）→ 確定 → 核對搜尋欄地區標籤 → 搜尋 → 觀察 URL 的 area → 正規化為 area + keyword → 重開 → 核對同一地區標籤。

area 是當次官方選項與提交 URL 的直接觀察值，沒有數字序列、地理順序、相鄰編碼或歷史清單推算。台中市控制案例先於其他映射完成。查詢字固定「前端工程師」。

父核取方塊會連帶勾選下屬區域，表示整市／整縣範圍；提交前地區欄顯示父分類名稱，URL 使用單一父 area 值。新竹市、嘉義市使用獨立城市子選項。接受依據為選取標籤、實際 area、重開標籤三者一致；即時職缺數量或暫時通用的頁面標題不作映射證據。

未登入、未讀取 Cookie／帳號資料、未使用私有 API，沒有爬取／反機器人繞過。只操作正常公開搜尋與選單。偶發於頁面尚未完成互動載入時無法打開選單，均重新觀察後完成；失敗嘗試不算 PASS。

公開搜尋提交 URL 附加 `order=15&jobsource=joblist_search&page=1`。以下正規化 URL 移除非地區契約欄位，保留觀察所得 area 與固定 keyword，無私有／會話參數。

## Mapping table

| Region | 104 area code / behavior | Evidence status |
|---|---|---|
| 全部地區 | 省略 `area`；UI「地區」，無選取 | PASS |
| 台北市 | `6001001000` | PASS |
| 新北市 | `6001002000` | PASS |
| 桃園市 | `6001005000` | PASS |
| 台中市 | `6001008000` | PASS |
| 台南市 | `6001014000` | PASS |
| 高雄市 | `6001016000` | PASS |
| 基隆市 | `6001004000` | PASS |
| 新竹市 | `6001006001` | PASS |
| 嘉義市 | `6001013001` | PASS |
| 新竹縣 | 未取得純縣映射 | UNVERIFIED |
| 苗栗縣 | `6001007000` | PASS |
| 彰化縣 | `6001010000` | PASS |
| 南投縣 | `6001011000` | PASS |
| 雲林縣 | `6001012000` | PASS |
| 嘉義縣 | 未取得純縣映射 | UNVERIFIED |
| 屏東縣 | `6001018000` | PASS |
| 宜蘭縣 | `6001003000` | PASS |
| 花蓮縣 | `6001020000` | PASS |
| 台東縣 | `6001019000` | PASS |
| 澎湖縣 | `6001021000` | PASS |
| 金門縣 | `6001022000` | PASS |
| 連江縣 | `6001023000` | PASS |

## 台中市控制

當次公開選單選取「台中市」，搜尋後 area=`6001008000`；重開後搜尋欄仍是「台中市」，標題為「『前端工程師』台中市最新找工作職缺｜2026年9月－104人力銀行」，與 accepted mapping 一致。[104 台中控制 URL](https://www.104.com.tw/jobs/search/?area=6001008000&keyword=%E5%89%8D%E7%AB%AF%E5%B7%A5%E7%A8%8B%E5%B8%AB)

獨立 web 閱讀工具也讀到相同控制 URL 的台中市標題與地點，但標示 Crawled: 2 weeks ago。該快取僅是旁證；PASS 依據是當次瀏覽器 UI 選取與重開。

## 全部地區

- REGION_LABEL: 全部地區（JobQuest 名稱）。
- PUBLIC_104_AREA_CODE: 不適用，**省略 area**。
- ALL_REGION_SEARCH_BEHAVIOR: 清除全部後 0 個勾選，確定後地區欄顯示「地區」，搜尋 URL 不含 area。
- OBSERVED_SEARCH_URL（正規化後）: [104 不限制地區搜尋](https://www.104.com.tw/jobs/search/?keyword=%E5%89%8D%E7%AB%AF%E5%B7%A5%E7%A8%8B%E5%B8%AB)
- EVIDENCE_SOURCE: 當次公開地區選單清除全部 → 確定 → 搜尋。
- REOPEN_VERIFICATION: **PASS**；重開後「地區」，再打開選單確認 0 個勾選。
- 驗證時間: 2026-09-29 16:36:44 Asia/Taipei。

這是「不限制地區」，未證明與「僅限台灣全部縣市」同義；不得以台灣合計分類替換，也不得發明 ALL、0 或 *。

## 阻擋證據：純新竹縣／嘉義縣

公開階層列出「新竹縣市」、「嘉義縣市」，下層同時含城市及縣內鄉鎮市，未看到單獨「新竹縣」、「嘉義縣」父選項。

使用選單內的「搜尋地區類別關鍵字」：

- 搜尋「新竹縣」：顯示共 **14 筆**，為「新竹縣市」加 13 個縣內鄉鎮市，沒有純「新竹縣」。
- 搜尋「嘉義縣」：顯示共 **19 筆**，為「嘉義縣市」加 18 個縣內鄉鎮市，沒有純「嘉義縣」。

合併分類可見核取方塊值為 `6001006000`（新竹縣市）、`6001013000`（嘉義縣市）。這些是合併分類的直接 UI 觀察，**不是已驗證純縣映射**，不納入 PASS，未當成純縣 URL 提交／重開。

城市排除或串列所有鄉鎮的多區域 area 行為未驗證，且與單一靜態 areaCode 契約不同。選單顯示上限 /10，兩縣鄉鎮數各為 13、18。本項不把多區域方案當替代證據，也不默默改動需求。

因此純縣範圍缺口仍存在。這不是台中控制 drift，也不是登入或反機器人阻擋。

## 逐地區證據

### 台北市

- REGION_LABEL: 台北市
- PUBLIC_104_AREA_CODE: `6001001000`
- OBSERVED_SEARCH_URL（正規化後）: [104 台北市 搜尋](https://www.104.com.tw/jobs/search/?area=6001001000&keyword=%E5%89%8D%E7%AB%AF%E5%B7%A5%E7%A8%8B%E5%B8%AB)
- EVIDENCE_SOURCE: 當次公開 104 地區類別選單，清除其他選取後勾選「台北市」，確定並按搜尋。
- 提交前 UI 地區標籤: 台北市
- REOPEN_VERIFICATION: **PASS**；重開以上 URL 後地區按鈕標籤為「台北市」。
- 驗證時間: 2026-09-29 16:31:50 Asia/Taipei。

### 新北市

- REGION_LABEL: 新北市
- PUBLIC_104_AREA_CODE: `6001002000`
- OBSERVED_SEARCH_URL（正規化後）: [104 新北市 搜尋](https://www.104.com.tw/jobs/search/?area=6001002000&keyword=%E5%89%8D%E7%AB%AF%E5%B7%A5%E7%A8%8B%E5%B8%AB)
- EVIDENCE_SOURCE: 當次公開 104 地區類別選單，清除其他選取後勾選「新北市」，確定並按搜尋。
- 提交前 UI 地區標籤: 新北市
- REOPEN_VERIFICATION: **PASS**；重開以上 URL 後地區按鈕標籤為「新北市」。
- 驗證時間: 2026-09-29 16:32:04 Asia/Taipei。

### 桃園市

- REGION_LABEL: 桃園市
- PUBLIC_104_AREA_CODE: `6001005000`
- OBSERVED_SEARCH_URL（正規化後）: [104 桃園市 搜尋](https://www.104.com.tw/jobs/search/?area=6001005000&keyword=%E5%89%8D%E7%AB%AF%E5%B7%A5%E7%A8%8B%E5%B8%AB)
- EVIDENCE_SOURCE: 當次公開 104 地區類別選單，清除其他選取後勾選「桃園市」，確定並按搜尋。
- 提交前 UI 地區標籤: 桃園市
- REOPEN_VERIFICATION: **PASS**；重開以上 URL 後地區按鈕標籤為「桃園市」。
- 驗證時間: 2026-09-29 16:32:12 Asia/Taipei。

### 台中市

- REGION_LABEL: 台中市
- PUBLIC_104_AREA_CODE: `6001008000`
- OBSERVED_SEARCH_URL（正規化後）: [104 台中市 搜尋](https://www.104.com.tw/jobs/search/?area=6001008000&keyword=%E5%89%8D%E7%AB%AF%E5%B7%A5%E7%A8%8B%E5%B8%AB)
- EVIDENCE_SOURCE: 當次公開 104 地區類別選單，清除其他選取後勾選「台中市」，確定並按搜尋。
- 提交前 UI 地區標籤: 台中市
- REOPEN_VERIFICATION: **PASS**；重開以上 URL 後地區按鈕標籤為「台中市」。
- 驗證時間: 2026-09-29 16:30:00 Asia/Taipei。

### 台南市

- REGION_LABEL: 台南市
- PUBLIC_104_AREA_CODE: `6001014000`
- OBSERVED_SEARCH_URL（正規化後）: [104 台南市 搜尋](https://www.104.com.tw/jobs/search/?area=6001014000&keyword=%E5%89%8D%E7%AB%AF%E5%B7%A5%E7%A8%8B%E5%B8%AB)
- EVIDENCE_SOURCE: 當次公開 104 地區類別選單，清除其他選取後勾選「台南市」，確定並按搜尋。
- 提交前 UI 地區標籤: 台南市
- REOPEN_VERIFICATION: **PASS**；重開以上 URL 後地區按鈕標籤為「台南市」。
- 驗證時間: 2026-09-29 16:34:46 Asia/Taipei。

### 高雄市

- REGION_LABEL: 高雄市
- PUBLIC_104_AREA_CODE: `6001016000`
- OBSERVED_SEARCH_URL（正規化後）: [104 高雄市 搜尋](https://www.104.com.tw/jobs/search/?area=6001016000&keyword=%E5%89%8D%E7%AB%AF%E5%B7%A5%E7%A8%8B%E5%B8%AB)
- EVIDENCE_SOURCE: 當次公開 104 地區類別選單，清除其他選取後勾選「高雄市」，確定並按搜尋。
- 提交前 UI 地區標籤: 高雄市
- REOPEN_VERIFICATION: **PASS**；重開以上 URL 後地區按鈕標籤為「高雄市」。
- 驗證時間: 2026-09-29 16:34:53 Asia/Taipei。

### 基隆市

- REGION_LABEL: 基隆市
- PUBLIC_104_AREA_CODE: `6001004000`
- OBSERVED_SEARCH_URL（正規化後）: [104 基隆市 搜尋](https://www.104.com.tw/jobs/search/?area=6001004000&keyword=%E5%89%8D%E7%AB%AF%E5%B7%A5%E7%A8%8B%E5%B8%AB)
- EVIDENCE_SOURCE: 當次公開 104 地區類別選單，清除其他選取後勾選「基隆市」，確定並按搜尋。
- 提交前 UI 地區標籤: 基隆市
- REOPEN_VERIFICATION: **PASS**；重開以上 URL 後地區按鈕標籤為「基隆市」。
- 驗證時間: 2026-09-29 16:32:20 Asia/Taipei。

### 新竹市

- REGION_LABEL: 新竹市
- PUBLIC_104_AREA_CODE: `6001006001`
- OBSERVED_SEARCH_URL（正規化後）: [104 新竹市 搜尋](https://www.104.com.tw/jobs/search/?area=6001006001&keyword=%E5%89%8D%E7%AB%AF%E5%B7%A5%E7%A8%8B%E5%B8%AB)
- EVIDENCE_SOURCE: 當次公開 104 地區類別選單，清除其他選取後勾選「新竹市」，確定並按搜尋。
- 提交前 UI 地區標籤: 新竹市
- REOPEN_VERIFICATION: **PASS**；重開以上 URL 後地區按鈕標籤為「新竹市」。
- 驗證時間: 2026-09-29 16:33:04 Asia/Taipei。

### 嘉義市

- REGION_LABEL: 嘉義市
- PUBLIC_104_AREA_CODE: `6001013001`
- OBSERVED_SEARCH_URL（正規化後）: [104 嘉義市 搜尋](https://www.104.com.tw/jobs/search/?area=6001013001&keyword=%E5%89%8D%E7%AB%AF%E5%B7%A5%E7%A8%8B%E5%B8%AB)
- EVIDENCE_SOURCE: 當次公開 104 地區類別選單，清除其他選取後勾選「嘉義市」，確定並按搜尋。
- 提交前 UI 地區標籤: 嘉義市
- REOPEN_VERIFICATION: **PASS**；重開以上 URL 後地區按鈕標籤為「嘉義市」。
- 驗證時間: 2026-09-29 16:34:20 Asia/Taipei。

### 新竹縣

- REGION_LABEL: 新竹縣
- PUBLIC_104_AREA_CODE: **UNVERIFIED**。
- OBSERVED_SEARCH_URL: 未取得代表純「新竹縣」的 URL。
- EVIDENCE_SOURCE: 公開選單階層及內建地區關鍵字搜尋，詳見阻擋證據。
- REOPEN_VERIFICATION: **UNVERIFIED**；無對應純縣 URL 可重開，未強制 PASS。

### 苗栗縣

- REGION_LABEL: 苗栗縣
- PUBLIC_104_AREA_CODE: `6001007000`
- OBSERVED_SEARCH_URL（正規化後）: [104 苗栗縣 搜尋](https://www.104.com.tw/jobs/search/?area=6001007000&keyword=%E5%89%8D%E7%AB%AF%E5%B7%A5%E7%A8%8B%E5%B8%AB)
- EVIDENCE_SOURCE: 當次公開 104 地區類別選單，清除其他選取後勾選「苗栗縣」，確定並按搜尋。
- 提交前 UI 地區標籤: 苗栗縣
- REOPEN_VERIFICATION: **PASS**；重開以上 URL 後地區按鈕標籤為「苗栗縣」。
- 驗證時間: 2026-09-29 16:33:11 Asia/Taipei。

### 彰化縣

- REGION_LABEL: 彰化縣
- PUBLIC_104_AREA_CODE: `6001010000`
- OBSERVED_SEARCH_URL（正規化後）: [104 彰化縣 搜尋](https://www.104.com.tw/jobs/search/?area=6001010000&keyword=%E5%89%8D%E7%AB%AF%E5%B7%A5%E7%A8%8B%E5%B8%AB)
- EVIDENCE_SOURCE: 當次公開 104 地區類別選單，清除其他選取後勾選「彰化縣」，確定並按搜尋。
- 提交前 UI 地區標籤: 彰化縣
- REOPEN_VERIFICATION: **PASS**；重開以上 URL 後地區按鈕標籤為「彰化縣」。
- 驗證時間: 2026-09-29 16:33:26 Asia/Taipei。

### 南投縣

- REGION_LABEL: 南投縣
- PUBLIC_104_AREA_CODE: `6001011000`
- OBSERVED_SEARCH_URL（正規化後）: [104 南投縣 搜尋](https://www.104.com.tw/jobs/search/?area=6001011000&keyword=%E5%89%8D%E7%AB%AF%E5%B7%A5%E7%A8%8B%E5%B8%AB)
- EVIDENCE_SOURCE: 當次公開 104 地區類別選單，清除其他選取後勾選「南投縣」，確定並按搜尋。
- 提交前 UI 地區標籤: 南投縣
- REOPEN_VERIFICATION: **PASS**；重開以上 URL 後地區按鈕標籤為「南投縣」。
- 驗證時間: 2026-09-29 16:33:31 Asia/Taipei。

### 雲林縣

- REGION_LABEL: 雲林縣
- PUBLIC_104_AREA_CODE: `6001012000`
- OBSERVED_SEARCH_URL（正規化後）: [104 雲林縣 搜尋](https://www.104.com.tw/jobs/search/?area=6001012000&keyword=%E5%89%8D%E7%AB%AF%E5%B7%A5%E7%A8%8B%E5%B8%AB)
- EVIDENCE_SOURCE: 當次公開 104 地區類別選單，清除其他選取後勾選「雲林縣」，確定並按搜尋。
- 提交前 UI 地區標籤: 雲林縣
- REOPEN_VERIFICATION: **PASS**；重開以上 URL 後地區按鈕標籤為「雲林縣」。
- 驗證時間: 2026-09-29 16:33:38 Asia/Taipei。

### 嘉義縣

- REGION_LABEL: 嘉義縣
- PUBLIC_104_AREA_CODE: **UNVERIFIED**。
- OBSERVED_SEARCH_URL: 未取得代表純「嘉義縣」的 URL。
- EVIDENCE_SOURCE: 公開選單階層及內建地區關鍵字搜尋，詳見阻擋證據。
- REOPEN_VERIFICATION: **UNVERIFIED**；無對應純縣 URL 可重開，未強制 PASS。

### 屏東縣

- REGION_LABEL: 屏東縣
- PUBLIC_104_AREA_CODE: `6001018000`
- OBSERVED_SEARCH_URL（正規化後）: [104 屏東縣 搜尋](https://www.104.com.tw/jobs/search/?area=6001018000&keyword=%E5%89%8D%E7%AB%AF%E5%B7%A5%E7%A8%8B%E5%B8%AB)
- EVIDENCE_SOURCE: 當次公開 104 地區類別選單，清除其他選取後勾選「屏東縣」，確定並按搜尋。
- 提交前 UI 地區標籤: 屏東縣
- REOPEN_VERIFICATION: **PASS**；重開以上 URL 後地區按鈕標籤為「屏東縣」。
- 驗證時間: 2026-09-29 16:35:01 Asia/Taipei。

### 宜蘭縣

- REGION_LABEL: 宜蘭縣
- PUBLIC_104_AREA_CODE: `6001003000`
- OBSERVED_SEARCH_URL（正規化後）: [104 宜蘭縣 搜尋](https://www.104.com.tw/jobs/search/?area=6001003000&keyword=%E5%89%8D%E7%AB%AF%E5%B7%A5%E7%A8%8B%E5%B8%AB)
- EVIDENCE_SOURCE: 當次公開 104 地區類別選單，清除其他選取後勾選「宜蘭縣」，確定並按搜尋。
- 提交前 UI 地區標籤: 宜蘭縣
- REOPEN_VERIFICATION: **PASS**；重開以上 URL 後地區按鈕標籤為「宜蘭縣」。
- 驗證時間: 2026-09-29 16:32:36 Asia/Taipei。

### 花蓮縣

- REGION_LABEL: 花蓮縣
- PUBLIC_104_AREA_CODE: `6001020000`
- OBSERVED_SEARCH_URL（正規化後）: [104 花蓮縣 搜尋](https://www.104.com.tw/jobs/search/?area=6001020000&keyword=%E5%89%8D%E7%AB%AF%E5%B7%A5%E7%A8%8B%E5%B8%AB)
- EVIDENCE_SOURCE: 當次公開 104 地區類別選單，清除其他選取後勾選「花蓮縣」，確定並按搜尋。
- 提交前 UI 地區標籤: 花蓮縣
- REOPEN_VERIFICATION: **PASS**；重開以上 URL 後地區按鈕標籤為「花蓮縣」。
- 驗證時間: 2026-09-29 16:35:21 Asia/Taipei。

### 台東縣

- REGION_LABEL: 台東縣
- PUBLIC_104_AREA_CODE: `6001019000`
- OBSERVED_SEARCH_URL（正規化後）: [104 台東縣 搜尋](https://www.104.com.tw/jobs/search/?area=6001019000&keyword=%E5%89%8D%E7%AB%AF%E5%B7%A5%E7%A8%8B%E5%B8%AB)
- EVIDENCE_SOURCE: 當次公開 104 地區類別選單，清除其他選取後勾選「台東縣」，確定並按搜尋。
- 提交前 UI 地區標籤: 台東縣
- REOPEN_VERIFICATION: **PASS**；重開以上 URL 後地區按鈕標籤為「台東縣」。
- 驗證時間: 2026-09-29 16:35:16 Asia/Taipei。

### 澎湖縣

- REGION_LABEL: 澎湖縣
- PUBLIC_104_AREA_CODE: `6001021000`
- OBSERVED_SEARCH_URL（正規化後）: [104 澎湖縣 搜尋](https://www.104.com.tw/jobs/search/?area=6001021000&keyword=%E5%89%8D%E7%AB%AF%E5%B7%A5%E7%A8%8B%E5%B8%AB)
- EVIDENCE_SOURCE: 當次公開 104 地區類別選單，清除其他選取後勾選「澎湖縣」，確定並按搜尋。
- 提交前 UI 地區標籤: 澎湖縣
- REOPEN_VERIFICATION: **PASS**；重開以上 URL 後地區按鈕標籤為「澎湖縣」。
- 驗證時間: 2026-09-29 16:35:29 Asia/Taipei。

### 金門縣

- REGION_LABEL: 金門縣
- PUBLIC_104_AREA_CODE: `6001022000`
- OBSERVED_SEARCH_URL（正規化後）: [104 金門縣 搜尋](https://www.104.com.tw/jobs/search/?area=6001022000&keyword=%E5%89%8D%E7%AB%AF%E5%B7%A5%E7%A8%8B%E5%B8%AB)
- EVIDENCE_SOURCE: 當次公開 104 地區類別選單，清除其他選取後勾選「金門縣」，確定並按搜尋。
- 提交前 UI 地區標籤: 金門縣
- REOPEN_VERIFICATION: **PASS**；重開以上 URL 後地區按鈕標籤為「金門縣」。
- 驗證時間: 2026-09-29 16:36:01 Asia/Taipei。

### 連江縣

- REGION_LABEL: 連江縣
- PUBLIC_104_AREA_CODE: `6001023000`
- OBSERVED_SEARCH_URL（正規化後）: [104 連江縣 搜尋](https://www.104.com.tw/jobs/search/?area=6001023000&keyword=%E5%89%8D%E7%AB%AF%E5%B7%A5%E7%A8%8B%E5%B8%AB)
- EVIDENCE_SOURCE: 當次公開 104 地區類別選單，清除其他選取後勾選「連江縣」，確定並按搜尋。
- 提交前 UI 地區標籤: 連江縣
- REOPEN_VERIFICATION: **PASS**；重開以上 URL 後地區按鈕標籤為「連江縣」。
- 驗證時間: 2026-09-29 16:36:09 Asia/Taipei。

## Mapping contract 與停止界線

未達 22/22 門檻，完整靜態 mapping object **未核准、未撰寫為正式契約、未實作**。已驗證字串僅作證據紀錄，全部地區採省略 area 的觀察行為。不得將合併縣市改名成純縣以宣稱完整。

僅更新本文件。SearchPanel、locationMap、URL builder、preferences、Resume、Matching、Quest Board、persistence、Connector、payload、extraction、normalization、database 均未修改。未開始登入／註冊或 40-job incremental import。

正式程式保留比對：src、tests、browser-extension、supabase、scripts、experiments 共 254 個檔案的 SHA-256 與調查前基準完全一致；變更／遺失 0、新增 0。本次外部證據／文件工作未執行 build 或 unit tests，不把先前測試視為本次證據。

**STOP — BLOCKED_REGION_MAPPING_EVIDENCE。**

