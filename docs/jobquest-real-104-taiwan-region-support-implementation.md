# JOBQUEST REAL 104 TAIWAN REGION SUPPORT IMPLEMENTATION

2026-09-29 · IMPLEMENTATION → AUTOMATED VERIFICATION → STOP

Final status: **READY_FOR_USER_MANUAL_TEST**。

## Required report

| Item | Result |
|---|---|
| Shared region config | YES — location104Map is the single canonical ordered label/mapping object |
| 全部地區 | SUPPORTED — area parameter omitted entirely |
| Taiwan coverage | COMPLETE — approved source search classifications, including combined Hsinchu/Chiayi |
| 新竹市 | SUPPORTED — 6001006001 |
| 新竹縣市 | SUPPORTED — 6001006000, city + county |
| 嘉義市 | SUPPORTED — 6001013001 |
| 嘉義縣市 | SUPPORTED — 6001013000, city + county |
| Unsupported pure 新竹縣 exposed | NO — not a selectable product label |
| Unsupported pure 嘉義縣 exposed | NO — not a selectable product label |
| Guessed mappings | 0 |
| Connector changed | NO |
| Normalization changed | NO |
| Matching changed | NO |
| Database changed | NO |
| Job Preferences schema changed | NO |
| Focused tests | PASS — 10 files / 311 tests |
| TypeScript | PASS — npm.cmd run typecheck |
| Build | PASS — npm.cmd run build |
| Manual acceptance performed by Codex | NO |
| Final status | READY_FOR_USER_MANUAL_TEST |

SUPPORTED/COMPLETE describe implemented configuration and automated contracts. Live browser navigation, installed extension capture, cloud persistence after actual F5, and end-to-end regional imports are **NOT VERIFIED in this work item**. They remain the user manual gates below.

## Implementation

- `src/integrations/job104/locationMap.ts`: one object in the approved user-facing order. String labels remain UI/persistence values. No new region IDs, enum migration, or domain model. `null` means omit area; supported membership is checked separately from area value, so unknown and unrestricted searches are distinct.
- `src/components/search/SearchPanel.tsx`: renders options directly from that object and retains existing classes, layout, submit and quick-search behavior. A restored unknown/legacy pure-county value remains the underlying value and displays a disabled “此地區不支援，請重新選擇” placeholder; it never silently changes to 全部地區 or a combined region. The normal dropdown offers no pure-county labels.
- `src/integrations/job104/build104SearchUrl.ts`: retains keyword trimming/encoding and mapped area behavior. Unknown locations keep the existing explicit error. 全部地區 omits area. Payload comparison uses the same configuration and requires absence of area for unrestricted captures; area empty, 0, ALL, *, or any restricted value does not match 全部地區.

No Board lifecycle, preference save/restore implementation, session restore implementation, Connector internals, scoring, or normalized job fields were edited. Existing explicit search saves the exact selected label through the existing callback. Matching still uses the same confirmed resume and normalized jobs.

## Approved evidence and canonical values

Evidence: [design](./jobquest-real-104-taiwan-region-support-design.md), [20-region and unrestricted evidence](./jobquest-104-region-mapping-evidence.md), [special-region resolution](./jobquest-104-special-region-contract-notes.md). The implementation follows the later approved source taxonomy, replacing the earlier unresolved pure-county assumption.

| Label | Area behavior |
|---|---|
| 全部地區 | omit area |
| 台北市 | 6001001000 |
| 新北市 | 6001002000 |
| 桃園市 | 6001005000 |
| 台中市 | 6001008000 |
| 台南市 | 6001014000 |
| 高雄市 | 6001016000 |
| 基隆市 | 6001004000 |
| 新竹市 | 6001006001 |
| 新竹縣市 | 6001006000 |
| 嘉義市 | 6001013001 |
| 嘉義縣市 | 6001013000 |
| 苗栗縣 | 6001007000 |
| 彰化縣 | 6001010000 |
| 南投縣 | 6001011000 |
| 雲林縣 | 6001012000 |
| 屏東縣 | 6001018000 |
| 宜蘭縣 | 6001003000 |
| 花蓮縣 | 6001020000 |
| 台東縣 | 6001019000 |
| 澎湖縣 | 6001021000 |
| 金門縣 | 6001022000 |
| 連江縣 | 6001023000 |

These are 22 regional search options plus 全部地區, with intentional city/combined-region overlap. This is not a claim of 22 mutually exclusive administrative county/city options. 全部地區 is unrestricted, not a Taiwan-only geographic filter.

## Automated verification

Command:

```powershell
npx.cmd vitest run tests/taiwan104Regions.test.tsx tests/taiwan104Preferences.test.tsx tests/job104Integration.test.ts tests/jobPreferenceRepository.test.ts tests/jobPreferencePersistence.test.ts tests/jobPreferenceApp.test.tsx tests/real104MatchingFlow.test.tsx tests/matchingEngine.test.ts tests/real104Session.test.ts tests/real104SessionRegression.test.tsx
npm.cmd run typecheck
npm.cmd run build
```

Final tests: **10 files / 311 tests PASS**.

| Focused user cases | Evidence |
|---|---|
| 1–3: all approved labels render; pure counties absent | taiwan104Regions: independent approved ordering/mapping expectations and actual SearchPanel static markup |
| 4–8: 台北/台中/高雄 and distinct city/combined values | exact approved URL assertions for all 23 options; exact payload cross-region rejection matrix |
| 9–10: unrestricted/unknown handling | area absence assertions; reject unknown/pure-county/prototype values; no navigation/save/capture for unsupported Board submission |
| 11–14: preference city/special/all round-trip | taiwan104Preferences: all 23 labels through actual controller/service/repository with mocked I/O, then fresh controller + fresh SearchPanel render; exact persisted label and selected option |
| 15: Connector interface unchanged | bridge client status/getLatest/clear command/DTO tests for all options; existing integration contracts; frozen-source hashes |
| 16: normalization unchanged | varied public location strings preserved verbatim with canonical IDs/links; existing normalization tests; frozen-source hashes |
| 17: Matching unchanged | identical capture + resume inputs produce identical complete ranked JobWithMatch output across all option handoffs; existing scoring regressions; frozen-source hashes |
| Indirect REAL session dependency | all 23 approved locations restore through unchanged validator; existing TTL/version/corruption/limit/Real-Demo regressions |
| Explicit search wiring | existing Board submit opens correct public URL and saves exact label for all options; no capture on navigation |

One new comparison initially constructed a second capture after advancing fake timers, which changed capture timestamps. The fixture was corrected to reuse the same capture; no production or Matching correction was needed. All final assertions compare complete output, including timestamps, grades, scores, skill evidence and links.

TypeScript and build passed. Vite retains a non-blocking warning for a minified chunk over 500 kB; no unrelated bundling change was made.

Preference I/O tests use mocks and session tests use memory storage. They do not claim live database acceptance, installed browser-extension operation, actual F5 acceptance or actual multi-region capture.

## Frozen-source preservation

Before/after SHA-256 comparison covered 254 existing files under src, tests, browser-extension, supabase, scripts and experiments. Six existing files changed, all authorized:

- Three production files listed above.
- `tests/job104Integration.test.ts`, `tests/real104MatchingFlow.test.tsx`, `tests/real104Session.test.ts`.

Two focused test files were added: `tests/taiwan104Regions.test.tsx`, `tests/taiwan104Preferences.test.tsx`. **248 remaining existing files unchanged; unexpected changes 0**. Formal Connector, schema/DTO, normalizer, Matching implementation, preferences repository/service/controller/hooks, Resume/Project tools, Auth, job actions/snapshot and REAL session implementation retain their hashes.

No migration, cloud mutation, login/register, account upgrade, 40-job import, accumulation, AI/PDF or unrelated UI cleanup was performed. Production build updates generated dist artifacts normally.

## User manual acceptance — NOT PERFORMED

開啟目前本機預覽（必要時在專案目錄執行 `npm.cmd run dev`），使用已確認履歷與既有 REAL 104 模式。每個 A–L 項目都依相同步驟：選地區、輸入有職缺的關鍵字 → 按「前往 104 搜尋」→ 核對104選取地區與URL → 使用既有Connector擷取 → 回JobQuest「匯入並配對」。無職缺時可以換關鍵字；零結果不等於成功匯入。

| Gate | 手動項目 | 預期 |
|---|---|---|
| A | 台北市 | area=6001001000，擷取／匯入正常 |
| B | 新北市 | area=6001002000，擷取／匯入正常 |
| C | 桃園市 | area=6001005000，擷取／匯入正常 |
| D | 台中市 | area=6001008000，既有流程正常 |
| E | 台南市 | area=6001014000，擷取／匯入正常 |
| F | 高雄市 | area=6001016000，擷取／匯入正常 |
| G | 新竹市 | area=6001006001，城市搜尋 |
| H | 新竹縣市 | area=6001006000，明確合併範圍 |
| I | 嘉義市 | area=6001013001，城市搜尋 |
| J | 嘉義縣市 | area=6001013000，明確合併範圍 |
| K | 彰化縣等普通縣 | 彰化縣area=6001010000，擷取／匯入正常 |
| L | 花蓮縣或金門縣 | 花蓮6001020000／金門6001022000，擷取／匯入正常 |
| M | 全部地區 | 不限制地區，URL完全沒有area參數；照既有流程擷取／匯入 |
| N | 偏好還原 | 選地區並明確搜尋／保存→F5→同一標籤；至少分別測試普通城市、新竹縣市、嘉義縣市、全部地區，未默默換成城市 |
| O | 回歸 | REAL匯入→Matching→收藏等既有actions→原始104職缺連結，都正常；相同履歷與職缺的分數、等級、技能證據不變 |

可回報每項 PASS／FAIL 與失敗時地區、關鍵字、實際URL、提示訊息。Codex未執行這些最終瀏覽器驗收；本次工作在 **READY_FOR_USER_MANUAL_TEST** 停止。
