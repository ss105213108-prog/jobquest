# Phase 4.1 — Real Resume Parser Hardening

驗收日期：2026-09-20

## PHASE 4.1 RESULT: PARTIAL

> 2026-09-20 Phase 4.2 更新：結構化姓名、學歷、完整工作陣列與專案名稱＋技術的 hardening 已完成，`NAME_NOT_DETECTED` 已由明確的 `NAME_NOT_FOUND` 流程取代；自動化回歸均通過。此階段仍等待同一份私人 PDF 的使用者人工驗收，因此本文件狀態維持 `PARTIAL`。

解析器修正、匿名化真實履歷形狀回歸測試、原 Phase 4/5/6C 回歸、TypeScript、Build、npm audit 與 Browser Console 皆已通過。

狀態保持 `PARTIAL`，原因是私人真實 PDF 沒有加入 repository，本次無法對「同一份私人 PDF」做最後人工重測。依使用者指示，等待使用者在 Review UI 確認新解析結果；不自行恢復 Phase 6C E2E。

## 驗收摘要

1. **Root Cause**：姓名觀則只看「2–4 個英文字」，沒有職稱負面詞；section aliases 缺少「自傳」、`About Me`、「專案介紹」；沒有 Experience section 時，任何日期範圍都會被 fallback 當成工作經驗；Projects 僅逐行截取，未組合功能/技術證據。
2. **Name Detection Fix**：新增明確職稱/履歷標題排除規則，並將英文姓名改為較保守的 title-case 候選；`Front End` 與 `Frontend Developer` 皆回傳 unresolved。Review UI 已有 `NAME_NOT_DETECTED` 警示，且姓名空白時無法確認儲存。
3. **Section Boundary Fix**：新增「自傳」、「關於我」、`About Me`、`Personal Profile`、「專案介紹」、「作品集」、`Project`、`Work History` 等 heading；Education 在新 heading 立即停止。
4. **Project Detection Fix**：「專案介紹」、「作品集」、「個人專案」、「團隊專案」與中英文變體均會進入 Projects；專案名會與後續「專案功能」/「技術棧」證據組合，不虛構資料。
5. **Project vs Experience Fix**：日期範圍不再單獨觸發 Work Experience fallback。候選內容必須有公司/職稱/任職/工作內容證據，且不得有專案/作品/網站/系統/Demo/GitHub/技術棧等強專案訊號。
6. **真實 PDF 重測結果**：匿名化真實履歷形狀 PASS：Name unresolved、Education 無自傳溢入、VTUBER 網站進 Projects 且不進 Experience、Skills 與 Career Directions 保持。既有非私人 PDF fixture 已在 Browser Review UI PASS。同一份私人 PDF 待使用者人工重測。
7. **新增 Tests**：9/9 PASS，覆蓋職稱不得當姓名、unresolved、Education boundaries、Projects routing、日期不等於工作經驗、專案技能與完整匿名化形狀。
8. **Resume Regression**：原有 9/9 PASS（PDF、多頁 PDF、DOCX、scanned PDF、validation、normalization、skills/aliases、sections）。
9. **Matching Regression**：13/13 PASS。
10. **Phase 6C Regression**：11/11 PASS；Phase 6C 仍為 `PARTIAL`，最後 E2E 依指示暫停。
11. **TypeScript**：PASS。
12. **Build**：PASS；395 modules transformed。只有既有非阻斷 bundle-size warning。
13. **npm audit**：PASS；0 vulnerabilities。
14. **Console**：PASS；本機 JobQuest 載入與 PDF Review UI 均為 0 error / 0 warning。
15. **是否保存原始履歷**：NO。解析仍全數在 browser-side，未修改隱私流程。
16. **是否將私人履歷加入 Git/repository**：NO。回歸 fixture 為移除姓名、Email、電話、地址後的匿名文字。
17. **Supabase Schema 是否修改**：NO。沒有執行 Project listing、migration、Schema、RLS 或任何 Supabase 操作。

## 待人工確認

使用原本 Desktop Edge E2E 的同一份私人 PDF 重新解析，只需確認：

- 姓名不再是 `Front End`；若無可靠姓名，應保持空白並要求手動填寫。
- Education 只含真實學歷，不含「自傳」/「關於我」。
- Work Experience 不含 `VTUBER 購物網站 2025/7~2026/7`。
- Projects 可看到 VTUBER 網站及其功能/技術證據。
- Skills 與 Career Directions 保持合理。

在這項人工確認前，不宣告 `PHASE 4.1 COMPLETE`，也不恢復 Phase 6C E2E。
