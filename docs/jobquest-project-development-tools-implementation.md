# JOBQUEST PROJECT DEVELOPMENT TOOLS IMPLEMENTATION

2026-09-29 · IMPLEMENTATION → AUTOMATED VERIFICATION · STOP

Final status: **READY_FOR_USER_MANUAL_TEST**. Automated verification is complete;
browser acceptance, live F5, REAL 104 and I–J acceptance remain for the user.
No freeze was performed.

## Delivered behavior

The existing nested `ResumeProject` model now includes `tools?: string[]`.
No second project model exists. Old projects may omit tools, which is an empty
editor/display value; untouched legacy confirmation and restore preserve omission.
New manual projects start with their own empty tools array.

In manual-create and confirmed-edit contexts, each project follows:
專案名稱 → 使用技術 → 開發工具 → 專案說明. Tools use the existing editable
tag interaction: explicit entry, trim on add, case-insensitive duplicate-add guard,
empty submission rejection and individual removal. Existing name/skill/description
updates retain tools. Tags, inputs and labels reuse the approved editor typography.
AI/Mock candidate editors do not acquire a tools input; AI wire/contracts remain
unchanged. No extraction or AI runtime was called.

The unchanged repository writer saves the project object into existing projects
JSONB. The deserializer now copies a present string-array tools property without
changing order, casing, duplicates or whitespace. Missing tools stays absent.
Explicit malformed values (null, scalar, non-string array items) fail through the
existing safe restore-error path, without committing partial data or repair-writing.
Ownership, conflict key, controller/hook lifecycle and all unrelated fields remain
unchanged. No schema/RLS/grant/migration operation was performed.

ProfilePage now projects each project directly as a standalone name and separate
使用技術 / 開發工具 / 專案說明 sections. Each optional section requires actual
nonempty text. Raw descriptions and meaningful line breaks are retained. The
old formatter remains available to existing consumers, but ProfilePage no longer
uses its dense `｜` joined project line. User-entered `｜` remains literal text.
Scoped project CSS uses 22px names, 17px labels and 18px values at a 16px root;
values wrap and preserve line breaks. No whole-page redesign.

Tools are explicit display metadata, never copied into name, description,
project/global skills or matching input. Existing Matching is unchanged. Legacy
tool words already inside descriptions remain untouched and retain their existing
matching semantics; changing only the new tools array has no matching effect.

## Automated evidence

New focused coverage: `tests/projectDevelopmentTools.test.tsx`. It uses the
existing deterministic React callback testing pattern, the actual repository
with injected in-memory Supabase responses, and fresh existing persistence
controllers. It performs no browser acceptance or cloud mutation. Fetch is
forbidden within these focused tests.

| Requested case | Evidence |
| --- | --- |
| 1 Legacy project valid | confirmation retains omitted tools and raw original fields |
| 2 Add tools | real EditableTags submit handler, explicit names, empty/duplicate guards |
| 3 Remove tools | real tag removal handler retains other explicit tools |
| 4 Confirm/save | real Review → controller → actual repository writer; no write before confirmation |
| 5 Reload/restore | fresh controller → actual repository deserializer; tools retained without another write |
| 6 Two projects | distinct explicit arrays survive actual repository round-trip |
| 7 Skills unchanged | project/global skills identical after tools editing |
| 8 Description unchanged | exact multiline string and trailing spaces retained |
| 9 No heuristics | tool names in legacy description do not populate tools |
| 10 Separate sections | structural React/SSR name + ordered dt/dd sections, no dense formatter join |
| 11 Empty tools hidden | absent / [] / whitespace-only display values have no empty heading |
| 12 Matching invariant | complete results equal across every local mock job, including recognized technologies only in tools |
| 13 Legacy round-trip | optional omission and explicit arrays retain full profile equality |
| 14 AI unchanged | AI/Mock controls retain no new tools entry; existing pure AI contract suite passes; AI files unchanged |

Additional tests cover new-entry isolated arrays, name/skill/description edits,
cancel/source isolation, failed-confirmation draft retention, malformed tools safe
restore errors and legacy string projects. The existing Review hardening assertion
was updated for the approved label 專案說明; its behavior checks remain intact.

Focused run: **7 files / 247 tests PASS**.

Expanded relevant regression run: **24 files / 512 tests PASS**, including
manual entry/acceptance-flow automation, confirmed resume repository/controller/App,
Review/education, Matching, pure AI contract, REAL104 session/Matching flow,
104 integration, preferences, user job actions, job snapshots, ghost saved jobs
and anonymous-auth reuse. These are automated tests, not user acceptance.

`npm.cmd run typecheck`: **PASS**.

`npm.cmd run build`: **PASS**, 117 modules transformed. Vite emits a non-fatal
warning for a minified JavaScript chunk larger than 500 kB; this work item does
not introduce a bundle-splitting refactor.

SHA-256 scope evidence is retained in the task-specific temporary evidence folder:
`%TEMP%\jobquest-project-tools-implementation-d874ac0f\`.
Only the authorized implementation/test files and this report changed; the
Matching, AI, Auth, 104, preferences, job actions, snapshot and schema sources
remain unchanged. Build output is excluded from source preservation comparison.

Supabase JSON storage and changelog references were checked under the Supabase
skill. This change is a local JSON deserializer extension with no API/schema
change: [JSON documentation](https://supabase.com/docs/guides/database/json),
[changelog](https://supabase.com/changelog).

## Required implementation report

| Item | Result |
| --- | --- |
| Project tools field implemented | YES |
| Project type | `tools?: string[]` |
| Legacy projects remain valid | YES |
| Persistence write | YES, existing writer unchanged |
| Persistence restore | YES, tools retained when present |
| Manual editor tools input | YES |
| Separate ProfilePage sections | YES |
| Dense `｜` project rendering removed | YES from ProfilePage; literal user text retained |
| Automatic description parsing | NO |
| Matching changed | NO |
| Changing tools affects Matching | NO in automated regression |
| Database changed | NO |
| AI contract changed | NO |
| 104 Connector changed | NO |
| Focused tests | PASS, plus expanded 24 files / 512 tests |
| TypeScript | PASS |
| Build | PASS |
| Manual acceptance performed by Codex | NO |
| Final status | READY_FOR_USER_MANUAL_TEST |

## User manual acceptance — all NOT VERIFIED in this work item

| Gate | User check |
| --- | --- |
| A | 打開既有專案，專案名稱／使用技術／專案說明仍正常 |
| B | 手動新增 Visual Studio Code、InfinityFree，顯示正常 |
| C | 確認保存後按 F5，開發工具仍存在 |
| D | ProfilePage 顯示 VTUBER電商，再分段顯示使用技術及開發工具，沒有全部擠成一行 |
| E | 沒有 tools 的舊專案不顯示空白「開發工具」標題 |
| F | 舊 description 的工具文字不被自動解析或搬移 |
| G | 只修改 tools，Matching 分數及等級不變 |
| H | 履歷保存／編輯／F5 正常 |
| I | REAL 104 Matching 正常，由使用者進行驗收 |
| J | 偏好／收藏／任務紀錄／原始職缺連結正常，由使用者進行驗收 |

Live cloud persistence/F5 and responsive browser appearance are **NOT VERIFIED**
by Codex here. Automated PASS does not replace these checks.

**STOP — no final browser acceptance, no I–J continuation, no freeze.**
