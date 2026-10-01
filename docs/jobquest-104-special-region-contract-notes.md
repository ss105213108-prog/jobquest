# JOBQUEST 104 SPECIAL REGION RESOLUTION

日期：2026-09-29（Asia/Taipei）。INVESTIGATION → PRODUCT CONTRACT DESIGN。僅證據與產品契約；無 production implementation。

## 結論

- 新竹縣市 verified: **YES**。
- 嘉義縣市 verified: **YES**。
- Pure 新竹縣 directly supported: **NO**（目前正常公開 UI 未取得直接、穩定、可重現的純縣搜尋證據）。
- Pure 嘉義縣 directly supported: **NO**（相同證據限定）。
- Guessed mappings: **0**。
- Recommended product labels: **新竹市、新竹縣市、嘉義市、嘉義縣市**；不提供純「新竹縣」「嘉義縣」選項。
- Complete Taiwan coverage achievable: **YES**，採來源實際支持的合併分類，連同前次其他已驗證區域。
- Recommended next action: **APPROVE_TAIWAN_REGION_SUPPORT_IMPLEMENTATION**。
- 本結論是下一個工作項目的建議，**不是本次開始實作的授權**。

## 直接公開證據：新竹縣市

- Exact public label: **新竹縣市**。
- UI 選取：清空其他地區後勾選官方父分類，確定前核取範圍含「新竹市」與新竹縣 13 個鄉鎮市；搜尋欄顯示「新竹縣市」。
- Resulting query behavior: 單一 `area=6001006000`；沒有手工鄉鎮組合。
- Resulting URL（原始公開提交）：https://www.104.com.tw/jobs/search/?jobsource=joblist_search&area=6001006000&page=1
- Stable resulting URL: [104 新竹縣市](https://www.104.com.tw/jobs/search/?area=6001006000)。
- Reopen verification: **PASS**；實際重開 stable URL，地區按鈕仍是「新竹縣市」。
- 完成重開時間：2026-09-29 16:47:25 Asia/Taipei。
- Both city and county jobs represented: **YES**。重開結果中同時看到「人力資源管理師／新竹市」與「產線作業員／新竹縣湖口鄉」。來源：[市職缺](https://www.104.com.tw/job/95apa)、[縣職缺](https://www.104.com.tw/job/8t0pr)。此處只記錄結果頁可見標題、位置與公開連結，未操作應徵。

選單父分類同時勾選新竹市、竹北市、湖口鄉、新豐鄉、新埔鎮、關西鎮、芎林鄉、寶山鄉、竹東鎮、五峰鄉、橫山鄉、尖石鄉、北埔鄉、峨眉鄉。這個範圍清楚包含城市及縣，不可標示為純縣。

## 直接公開證據：嘉義縣市

- Exact public label: **嘉義縣市**。
- UI 選取：清空其他地區後勾選官方父分類，核取範圍含「嘉義市」與嘉義縣 18 個鄉鎮市；搜尋欄顯示「嘉義縣市」。
- Resulting query behavior: 單一 `area=6001013000`；沒有手工鄉鎮組合。
- Resulting URL（原始公開提交）：https://www.104.com.tw/jobs/search/?area=6001013000&jobsource=joblist_search&page=1
- Stable resulting URL: [104 嘉義縣市](https://www.104.com.tw/jobs/search/?area=6001013000)。
- Reopen verification: **PASS**；實際重開 stable URL，地區按鈕仍是「嘉義縣市」。
- 完成重開時間：2026-09-29 16:47:55 Asia/Taipei。
- Both city and county jobs represented: **YES**。重開結果同時看到「診所櫃檯助理／嘉義市」與「產線技術員-嘉義／嘉義縣大林鎮」。來源：[市職缺](https://www.104.com.tw/job/9651k)、[縣職缺](https://www.104.com.tw/job/3h7d1)。

父分類勾選嘉義市、番路鄉、梅山鄉、竹崎鄉、阿里山鄉、中埔鄉、大埔鄉、水上鄉、鹿草鄉、太保市、朴子市、東石鄉、六腳鄉、新港鄉、民雄鄉、大林鎮、溪口鄉、義竹鄉、布袋鎮。清楚含城市及縣。

職缺是調查當時可見例證，會更新；分類契約依據為官方核取範圍、提交 URL、重開標籤，加上雙範圍可見結果，不依賴固定職缺數量。

## 純縣可能性檢查

當次公開階層未提供單獨「新竹縣」「嘉義縣」父選項；再以選單內建「搜尋地區類別關鍵字」核對：

| 查詢 | 當次 UI 結果 | 純縣選項 |
|---|---|---|
| 新竹縣 | 14 筆：「新竹縣市」及 13 個縣內鄉鎮市 | 未找到 |
| 嘉義縣 | 19 筆：「嘉義縣市」及 18 個縣內鄉鎮市 | 未找到 |

另外實際檢查「先勾選合併父分類，再排除城市」：
- 新竹縣市選取後：新竹市 checkbox **checked=true、disabled=true**。
- 嘉義縣市選取後：嘉義市 checkbox **checked=true、disabled=true**。
- 官方 UI 將下屬項目停用，無法以此路徑直接取消城市並由 UI 生成純縣搜尋。

未修改 DOM／disabled 狀態、未手動拼接13／18個鄉鎮、未推算父代碼，也未使用私有 API。可見 /10 選取上限僅是輔助觀察；不以該數字單獨證明技術上不可能。

因此 **OPTION A 未獲直接證據支持，採 OPTION B**。NO 的意思是「本次調查的正常公開 UI 沒有直接可重現的純縣支持證據」，不是宣稱所有 104 介面或未來版本永遠不存在其他方式。沒有可接受的純縣 URL，所以純縣 reopen 為 **NOT VERIFIED**，不可把合併搜尋當成純縣 PASS。

## 產品分類與搜尋契約

| Product label | Search mapping | Product promise |
|---|---|---|
| 新竹市 | `area=6001006001` | 僅城市；前次直接驗證 |
| 新竹縣市 | `area=6001006000` | 新竹市加縣內鄉鎮；當次驗證 |
| 新竹縣 | 不提供 | 未證實純縣精度 |
| 嘉義市 | `area=6001013001` | 僅城市；前次直接驗證 |
| 嘉義縣市 | `area=6001013000` | 嘉義市加縣內鄉鎮；當次驗證 |
| 嘉義縣 | 不提供 | 未證實純縣精度 |
| 全部地區 | 省略 `area` | 不限制地區；沿用前次證據，未另行重驗 |

城市子選項可以與合併分類共存：兩者範圍重疊，但標籤明確。建議保留已支持的城市精度，以合併分類取代原本無證據的純縣標籤。

完整覆蓋由 18 個其他整市／整縣來源分類，加 2 個合併分類形成；兩個合併各涵蓋城市與縣。另保留 2 個城市子選項，共 22 個來源搜尋選項加全部地區。這是實際來源分類的結果，**不是22個互斥行政縣市**。數量不作接受門檻。

前次20個地區與全部地區證據：[前次完整報告](./jobquest-104-region-mapping-evidence.md)。既有城市證據：[新竹市公開 URL](https://www.104.com.tw/jobs/search/?area=6001006001&keyword=%E5%89%8D%E7%AB%AF%E5%B7%A5%E7%A8%8B%E5%B8%AB)、[嘉義市公開 URL](https://www.104.com.tw/jobs/search/?area=6001013001&keyword=%E5%89%8D%E7%AB%AF%E5%B7%A5%E7%A8%8B%E5%B8%AB)。本次沿用已接受證據，未重新驗證其他地區或全部地區。

以下為**文件內的未實作契約**。areaCode 的 null 僅表示省略 area，不是送給104的代碼；有值時送原始字串，不縮寫／推算。排序僅為文件排列，不具有代碼推導含義。

```json
[
  {
    "label": "全部地區",
    "areaCode": null
  },
  {
    "label": "台北市",
    "areaCode": "6001001000"
  },
  {
    "label": "新北市",
    "areaCode": "6001002000"
  },
  {
    "label": "桃園市",
    "areaCode": "6001005000"
  },
  {
    "label": "台中市",
    "areaCode": "6001008000"
  },
  {
    "label": "台南市",
    "areaCode": "6001014000"
  },
  {
    "label": "高雄市",
    "areaCode": "6001016000"
  },
  {
    "label": "基隆市",
    "areaCode": "6001004000"
  },
  {
    "label": "新竹市",
    "areaCode": "6001006001"
  },
  {
    "label": "嘉義市",
    "areaCode": "6001013001"
  },
  {
    "label": "苗栗縣",
    "areaCode": "6001007000"
  },
  {
    "label": "彰化縣",
    "areaCode": "6001010000"
  },
  {
    "label": "南投縣",
    "areaCode": "6001011000"
  },
  {
    "label": "雲林縣",
    "areaCode": "6001012000"
  },
  {
    "label": "屏東縣",
    "areaCode": "6001018000"
  },
  {
    "label": "宜蘭縣",
    "areaCode": "6001003000"
  },
  {
    "label": "花蓮縣",
    "areaCode": "6001020000"
  },
  {
    "label": "台東縣",
    "areaCode": "6001019000"
  },
  {
    "label": "澎湖縣",
    "areaCode": "6001021000"
  },
  {
    "label": "金門縣",
    "areaCode": "6001022000"
  },
  {
    "label": "連江縣",
    "areaCode": "6001023000"
  },
  {
    "label": "新竹縣市",
    "areaCode": "6001006000"
  },
  {
    "label": "嘉義縣市",
    "areaCode": "6001013000"
  }
]
```

未把既有「新竹縣」「嘉義縣」偏好默默轉成合併分類；未來實作需對舊純縣名稱明確呈現範圍差異，而非暗示保留純縣精度。本次不修改或遷移偏好。

## 保留範圍與停止

只有本文件有本次調查／契約更新。SearchPanel、URL builder、Connector、normalization、preferences、database、Matching、Resume、Auth、40-job import 均未修改。未登入，無帳號／Cookie讀取、無反機器人繞過。

程式檔案 SHA-256 保留比對：src、tests、browser-extension、supabase、scripts、experiments 共254個檔案與本次調查前完全一致；變更／遺失0、新增0。沒有 production changes，因此未執行 build/unit tests；公開 UI 選取與重開是本次必要驗證。

**STOP。Recommended next action: APPROVE_TAIWAN_REGION_SUPPORT_IMPLEMENTATION。**

