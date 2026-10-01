# JOBQUEST REAL104 BATCH APP INTEGRATION

**Final status: READY_FOR_REAL104_BATCH_MANUAL_ACCEPTANCE**

## 已接入的流程

- REAL 104 Board 的 Connector `ready` payload 經既有搜尋條件與 payload 驗證後，交由 Batch Coordinator 累積。新批次使用獨立的 `jobQuest.real104Batch.v1` sessionStorage key；目前 Auth UID 是 restore 與每次轉換的 owner，Matching 只取目前已確認的 `local.resume`。
- 相同 keyword／region fingerprint 的多次手動擷取保留先前 Job，10 → 20 → 30 → 40；相同 sourceKey 不增加計數。收集中顯示「已收集 N / 40」與本次新增／略過數，不顯示未提交卡片。1–39 筆可按「使用目前 N 筆進行配對」；滿 40 筆由 Foundation 自動提交，成功後 Quest Board 一次顯示該批 Matching 結果。40 筆 Matching 失敗時保留 collecting 40 與重試入口。
- F5 從新 key 還原 partial／presented。presented 只保存 canonical Jobs，重新載入後以目前已確認履歷重跑 Matching，完成前不顯示舊分數。換 keyword／region 的明確搜尋才依既有 fingerprint contract reset；單純切換來源或偏好還原不建立新批次。
- 有效新 key 優先於 legacy REAL session；新 key 過期、損毀、UID 不符時顯示不可還原狀態，不展示舊 snapshot 或其他 UID 的 Job。沒有新 key 且有有效舊 REAL session 時，維持原單次匯入流程，直到使用者明確開始新批次搜尋。設定頁「清除本次資料」同步清除新 batch key。
- Connector 按鈕在 batch 流程改為「加入目前批次」。沒有「下一批」、自動翻頁、自動捲動或自動抓取 104 的入口。

## 變更範圍

| 檔案 | 變更 |
| --- | --- |
| `src/hooks/useReal104Batch.ts` | 組合已驗證的 Foundation、Storage Adapter、Matcher Adapter；管理 UID／履歷、還原、失效與畫面狀態。 |
| `src/App.tsx` | 接入目前 Auth UID、確認履歷、batch/legacy 優先順序與 Board/收藏紀錄資料投影。 |
| `src/pages/BoardPage.tsx` | 將驗證後 Connector capture 導向 batch、顯示累積進度及 partial commit；保留有效 legacy lane。 |
| `src/components/search/Real104BatchProgress.tsx` | 簡單進度與 partial／滿 40 失敗重試控制。 |
| `src/components/search/Job104ConnectorControls.tsx` | 加入可選按鈕文案，預設文案維持原樣。 |
| `src/hooks/useJobActionResolution.ts` | 由 App 傳入目前 presented canonical Jobs，供既有收藏／紀錄與 snapshot resolution 使用。 |
| `tests/real104BatchAppIntegration.test.tsx` | 11 個 App、Board、真實 Foundation/Adapters 接線測試。 |
| `tests/jobActionApp.test.tsx`、`tests/jobPreferenceApp.test.tsx` | 舊 App 測試補齊 browser `sessionStorage` 模擬；原斷言保留。 |

未修改 Connector、Matching 核心、Batch Foundation／Adapters 契約、Auth、Resume、DB、RLS、舊 REAL session 格式或 PDF reconstruction。

## 驗證

| 檢查 | 結果 |
| --- | --- |
| 新 App 整合測試 | **11/11 PASS**：10→40、sourceKey 去重、無效 payload、F5 20/40、F5 presented partial/full、keyword/region reset、UID 隔離、Matching/storage failure、legacy REAL 相容。 |
| Batch Foundation | **40/40 PASS**。 |
| Storage Adapter | **10/10 PASS**。 |
| Matcher Adapter | **7/7 PASS**。 |
| REAL104／Matching／Snapshot／職缺操作回歸 | **385/385 PASS**（13 個指定測試檔）。 |
| Typecheck | **PASS**；新整合測試另以 TypeScript 檢查通過。 |
| Production build | **PASS**。 |
| Full suite | **2257 PASS / 5 FAIL**。5 個失敗的名稱及完整 failure message 均與先前保存的 PDF reconstruction baseline 相同；**新增 regression：0**。 |

這是自動化整合驗證；尚未宣稱實際 104 多次擷取、瀏覽器 F5、登入切換或視覺流程的使用者人工驗收。下一步為 REAL104 batch manual acceptance。STOP。
