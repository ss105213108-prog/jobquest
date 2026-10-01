# Phase 4.2 — Structured Resume Extraction Hardening

驗收日期：2026-09-20

## PHASE 4.2 RESULT: PARTIAL

結構化解析器、Review UI、向下相容載入與所有指定自動化回歸已完成。本機瀏覽器另以既有匿名 PDF fixture 驗證，解析結果能顯示姓名、結構化學歷、工作經歷、專案名稱與技術、技能及職涯方向，Console 為 0 error / 0 warning；測試期間沒有按下「確認並儲存」，沒有雲端寫入。

狀態必須保持 `PARTIAL`：同一份私人 PDF 沒有加入 repository，也沒有被程式自動修改或保存。最終 A–F 驗收仍等待使用者在 Review UI 重新上傳該私人 PDF 並人工確認。Phase 6C 依指示保持 `PARTIAL`，本階段沒有恢復 104 E2E。

## 最終驗收摘要

1. **Name extraction strategy**：掃描履歷前 14 行與 Basic Info 區塊；接受獨立的中文 2–4 字姓名或保守的英文 Title Case 姓名，並排除職稱、Resume/CV/Portfolio、Email、Phone、Address、URL、GitHub、LinkedIn、Section heading 與技能名稱。第一行即使是 `Front End` 也不會直接當姓名；未找到時回報 `NAME_NOT_FOUND`，Review UI 顯示「履歷中未找到姓名，請補填。」且姓名空白時不能確認儲存。
2. **是否 hardcode 姓名**：NO。沒有加入私人姓名或單一姓名 special case；測試姓名皆為虛構資料。
3. **Education structured output**：`ResumeEducation { school, department, graduationStatus }`。只保存學校、科系、畢業狀態；日期不進入最終顯示。Section detector 支援同一行 transition，遇到自傳、關於我、About Me、Profile、工作經歷、專案、作品集或技能即停止 Education。
4. **WorkExperience data structure**：`workExperiences: WorkExperience[]`；每筆可包含 `company?`、`title`、`location?`、`startDate?`、`endDate?`、`durationText?`、`description?`。既有單一字串資料仍可向下相容載入，沒有 Supabase schema change。
5. **多工作解析結果**：PASS。匿名 fixture 的 3 筆工作完整輸出 3/3，保持履歷順序；沒有只取第一筆、最新一筆、最長一筆或符合職涯的一筆。Review UI 以一行一筆顯示全部解析結果。
6. **Project structure**：`ResumeProject { name, description?, skills: string[] }`；最多保留 5 個具完整證據的專案，每個可顯示項目都必須同時有非空 `name` 與至少一個 `skill`。
7. **Project name detection**：PASS。支援專案名稱、作品名稱、網站名稱與中英文標籤；`專案介紹`、`使用技術`、`Project`、`作品集` 不會被當成專案名。匿名 fixture 的 3 個專案均解析成功。
8. **Project skill extraction**：PASS。`使用技術`、`技術棧`、`Tech Stack`、`Technologies` 後的內容送入既有 Skill Dictionary / Alias Normalization；沒有重寫全域技能字典。
9. **真實 PDF 是否已自動修改**：NO，只等待人工重測。私人 PDF 未加入 repository、未保存、未轉成 fixture，也未硬編碼其中的姓名、公司、電話、Email 或地址。
10. **新增 Tests**：16/16 PASS。涵蓋指定 15 項條件，另增加 Basic Info 區塊姓名辨識；匿名多工作 fixture 包含 1 筆 Education、3 筆 Work Experience、3 個 Name + Tech Projects、Skills 與 About Me。
11. **Resume Regression**：9/9 PASS。
12. **Phase 4.1 Regression**：9/9 PASS。
13. **Matching Regression**：13/13 PASS；只將結構化內容轉成既有 matching evidence，沒有改 scoring weight 或 matching rule。
14. **Phase 6C Regression**：11/11 PASS；僅回歸測試，沒有啟動 104 E2E，Phase 6C 仍為 `PARTIAL`。
15. **TypeScript**：PASS；`tsc --noEmit -p tsconfig.app.json --pretty false`。
16. **Build**：PASS；Vite production build，396 modules transformed。既有 chunk-size warning 為非阻斷性。
17. **npm audit**：PASS；`found 0 vulnerabilities`。
18. **Console**：PASS；localhost Review UI 的 Browser Console 為 0 error / 0 warning；匿名 PDF 可完整進入 Review UI，沒有 unhandled error。
19. **Supabase Schema 修改**：NO。沒有列舉 Project，沒有執行 migration、Schema、RLS、Grant 或任何 Supabase 操作；結構化資料沿用既有 JSON 欄位。
20. **104 Connector 修改**：NO。沒有修改 Connector、104 擷取、Extension 或 E2E 流程。

## 等待私人 PDF 人工驗收

請使用原本同一份私人 PDF 重新解析，並人工確認：

- A. 姓名是否真的出現，且不是職稱或標題。
- B. 學歷是否只有學校、科系、畢業狀態。
- C. 履歷中的所有工作經歷是否全部顯示。
- D. 專案是否至少包含專案名稱與使用技術。
- E. Skills 是否正常。
- F. 候選職涯方向是否正常。

上述 A–F 未由使用者確認前，不宣告 `PHASE 4.2 COMPLETE`，不恢復 Phase 6C，也不開始 Phase 6D、1111、PNG OCR 或 Deployment。
