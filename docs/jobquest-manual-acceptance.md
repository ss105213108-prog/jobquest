# JOBQUEST MANUAL ACCEPTANCE FLOW

Work Item 1. No new RP number.
Current manual core flow status: MANUAL PASS / FROZEN.
Acceptance source: USER_MANUAL_BROWSER_TEST. Acceptance performed by Codex: NO.
Work Item 1 was reported Manual PASS by the user; Work Item 2 cases A/B/C/D were
subsequently reported PASS. The authoritative downstream freeze boundary and
case evidence are in [the review freeze record](jobquest-resume-review-hardening.md#manual-acceptance-and-freeze).
Project status: ACTIVE_WITH_AI_RUNTIME_PENDING. Real PDF AI extraction remains
BLOCKED / NOT YET VERIFIED; this manual PASS covers the Mock mainline only.

## Implementation Boundary

The initial screen selects a PDF, then calls mockResumeExtraction(file) only after
the user presses the mock extraction button. Selection validation uses name/type/
size metadata only; the adapter never reads bytes, text, streams or PDF structure.
The same synthetic anonymous profile is returned regardless of document content.
This is not AI extraction or PDF admission/validity verification.

The adapter returns the existing ResumeProfile. A backwards-compatible optional
certifications string array was added because the existing domain had no such
field. No parallel profile type, AI wire-schema change or parser change was made.
Future callAiResumeExtraction(file) must return that same UI-domain profile; only
the adapter boundary changes, not the review/confirmation/matching UI contract.

The existing review UI edits skills, education, work experience, projects,
certifications and career directions. Structured direct inputs preserve dates,
descriptions and arbitrary custom skills without reparsing human-editable lines.
Confirming copies the edited profile into independent application state; pending
extraction/draft data never unlocks the Quest Board. Existing matchingService is
unchanged and receives only that confirmed snapshot and existing mockJobs fixtures.

The manual mainline defaults to the existing source-labelled 104 demo fixtures.
Board/collection localDemo mode explicitly bypasses connector paths; the formal
jobService still rejects production 104 mock fallback. No connector or 1111 code
was modified. Demo mode is visible on upload, review and result screens.

All accepted profile, preferences and job actions stay in application memory.
Refresh closes the session and returns to upload. No localStorage persistence,
auth, cloud writes, Edge Function request, OpenRouter call or real resume use.
The old cloud/parser source files and runtime freeze evidence are preserved but
not used by this mainline. Existing medieval RPG components/styles are reused.

## Files Changed

- src/App.tsx
- src/types/index.ts
- src/styles.css
- src/components/onboarding/ResumeStep.tsx
- src/components/onboarding/ResumeReview.tsx
- src/components/layout/GuildHeader.tsx
- src/components/layout/GuildSidebar.tsx
- src/components/search/SearchPanel.tsx
- src/pages/ProfilePage.tsx
- src/pages/BoardPage.tsx
- src/pages/CollectionPage.tsx
- src/services/mockResumeExtraction.ts (new)
- src/services/localJobService.ts (new)
- src/hooks/useLocalAcceptance.ts (new)
- tests/manualAcceptanceFlow.test.tsx (new)
- CONTEXT.md
- docs/jobquest-final-runtime-freeze.md (historical boundary note only)
- docs/jobquest-manual-acceptance.md (new)

## Programmatic Checks

Focused tests: 266/266 PASS across manualAcceptanceFlow, matchingEngine,
job104Integration, aiResumeExtractionContract and parseResumeAiEdgeFunction.
New local flow tests: 17/17 PASS, including metadata-only selection/no network,
independent synthetic objects, explicit confirmation gate/snapshot, edited inputs
to the unchanged matcher, local fixtures, static component markup and local actions.
Component checks use server-side static markup, not browser interaction.

App TypeScript: PASS (npm run typecheck).
Production build: PASS (npm run build).
Browser live acceptance by Codex: NO.
OpenRouter / Edge Function / PDF extraction smoke: NO.
These are historical automated checks, not substitutes for user acceptance.
The subsequent user-reported browser acceptance is the product evidence.

## MANUAL TEST INSTRUCTIONS

1. 在專案資料夾開啟終端機，執行 `npm run dev -- --host localhost --port 5173`。
   Codex 已啟動此 preview；若終端機說 port 已被使用，先使用已啟動的 preview，
   不必再啟動第二份。若之後 5173 被其他程式占用，可改用 `--port 5174`。
2. 打開 http://localhost:5173/。若剛改用 5174，打開 http://localhost:5174/。
   預期先看到「登錄你的履歷」，不需要登入或 Supabase 設定。
3. 點「選擇履歷 PDF」，自行選擇一份非私人測試 PDF（非空白、10 MB 以下）。
   Codex 不提供或讀取私人履歷。此版本僅選擇檔案、不讀內容、不上傳。
4. 確認畫面顯示 `MOCK / DEMO MODE`，以及「並非 PDF 分析結果」的提醒。
   這不是實際 AI 分析；不同 PDF 也會得到相同示範資料。
5. 點「產生 Mock Extraction」。未選擇檔案時這個按鈕應為停用。
6. 預期進入「確認冒險者資料」：技能、學校/科系/畢業狀態、工作經歷、
   專案與技術、證照、求職方向均有匿名 Demo 資料。尚未確認時不應有 matching 結果。
7. 在「新增技能」輸入 Python，點該列「新增」；再修改「科系」或工作內容。
   也可移除技能/證照/方向，新增或刪除工作及專案。空白職稱/專案名稱須補填或移除。
8. 點「確認履歷」。這是唯一解鎖初次 matching 的動作，確認後使用修改過的資料。
9. 預期進入「職缺任務佈告欄」，以既有匿名 local jobs 和既有 Matching Engine 配對。
   不必登入、設定 API Key、使用 Connector、前往 104 網站或操作資料庫。
10. 搜尋關鍵字留空、地區選「全部地區」時，預期有 7 筆 104-labelled 示範職缺，
    可看到職缺名稱、公司、match % 和 S/A/B/C/D 級。分數取決於確認的履歷，不保證特定等級。
    右側技能/「冒險者檔案」應保留 Python 與修改的科系；點「編輯履歷」可再次修改後確認。
    可測試搜尋、查看詳情、收藏及收藏頁。示範職缺的 example.com 外部連結不是實際求職服務。
11. 若失敗，截取當下畫面與本機 URL，記下按鈕及最後一步；開啟 F12 Console，提供紅色
    error 的截圖（分享前遮蔽私人檔名或個人資訊）。不要提供 API Key 或私人 PDF 內容。

補充：重新整理會清除本次記憶體資料，回到上傳；「公會設定」也可清除本次資料。
本機 server ready / tests PASS / build PASS 都不等於產品功能驗收 PASS。

## Report Fields

Mock extraction seam: mockResumeExtraction(file): Promise<ResumeProfile>.
Resume UI connected: YES (implementation).
User editing supported: YES (implementation).
User confirmation supported: YES (implementation).
Matching Engine connected: YES (existing engine unchanged).
Job result / Quest Board reachable: YES (confirmation-controlled implementation).
Database required: NO. OpenRouter called: NO. Private resume used: NO.
Manual acceptance performed by Codex: NO.
Final status: MANUAL PASS / FROZEN_BY_MANUAL_ACCEPTANCE.
Current unresolved seam: REAL_PDF -> AI_EXTRACTION -> EXISTING_RESUME_REVIEW.
Existing 104 integration is preserved. Real Resume + Real 104 end-to-end
acceptance remains pending real AI extraction; do not restart connector work.
Stop; await the user's next authorized Work Item.
