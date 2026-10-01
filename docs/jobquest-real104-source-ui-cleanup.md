# JOBQUEST REAL104 SOURCE UI CLEANUP

Final status: **REAL104_SOURCE_UI_CLEANUP = PASS**

## Implementation

- Production `App` always uses REAL 104. Both source radios are absent, including on fresh startup and when restoring an old DEMO selection. Existing REAL session APIs handle mode selection and clearing; the session implementation is unchanged.
- Header retains `目前來源 104`; its settings action now has the accurate `公會設定` tooltip. Board retains `來源限定：104`.
- Named `DevelopmentApp` preserves the original mock source selector for development/test consumers. `main.tsx` mounts only the default production App. No production navigation or URL exposes the development entry.
- Mock fixtures and adapters remain unchanged. Existing mock-flow tests use the explicit development entry and preserve their original assertions.
- Added six production-entry checks for fresh startup, old DEMO/1111 preference restore, and navigation to favorites/history/profile/settings. These verify fixed 104 branding, no source radios, no MOCK/DEMO branding, and no implicit batch creation or matching.

## Files changed

- `src/App.tsx`
- `src/components/layout/GuildHeader.tsx`
- `tests/real104BatchAppIntegration.test.tsx`
- `tests/real104SessionRegression.test.tsx`
- `tests/jobActionApp.test.tsx`
- `tests/jobPreferenceApp.test.tsx`
- `tests/ghostSavedJobRegression.test.tsx`
- This report.

No Batch domain/hook/adapter, Connector, Matching, DB, RLS, Auth or Resume implementation changed. All 13 recorded SHA-256 checks match the pre-change files, including Batch/session/Matching/Connector seams and mock fixtures/adapters.

## Verification (2026-09-30)

| Check | Result |
| --- | --- |
| Source UI + actions/preferences/snapshot + legacy REAL + Batch App tests | 80/80 PASS |
| Relevant Batch/domain/storage/matcher/Connector/REAL/session/region/Matching/snapshot regressions | 476/476 PASS |
| Production Typecheck (`tsc --noEmit -p tsconfig.app.json`) | PASS |
| Changed Batch App integration test file Typecheck | PASS |
| Production build (`vite build`) | PASS; existing bundle-size advisory remains |
| Full suite | 2346 PASS / 5 FAIL |
| New regressions | NONE |

The full-suite JSON was compared against the previous next-batch UI baseline (2340 PASS / 5 FAIL). All five failure names and their complete failure messages are identical. They remain the four RP-014 approved PDF reconstruction cases and the RP-014 public PDF parser reproduction case in `tests/pdfLineReconstruction.test.ts`. No PDF source or test was edited.

An additional broader standalone Typecheck over legacy test fixtures reports their existing duplicate `favorite` property and widened session `status` type (`ghostSavedJobRegression.test.tsx:65`, `real104SessionRegression.test.tsx:91`). Those fixture lines were not changed. The required production Typecheck and the newly extended integration test file pass.

## Browser evidence and limits

The actual localhost production entry was inspected in the browser. Board, settings, favorites and history contain zero source radios and no MOCK/DEMO branding. Reload completes with `目前來源 104`, the REAL search/import controls and `來源限定：104`. The existing layout is retained.

Screenshot: `C:/Users/user/.codex/visualizations/2026/09/29/01a0eb07-2eb1-7013-9686-e1339b2534ac/real104-source-ui-cleanup.png`.

The in-app browser does not have the 104 Connector installed. Live 104 capture/import and the next-batch action were therefore not re-executed in this browser. Their automated regression checks pass, including pending-first consumption, seen-history dedupe, successive batches, restore and search reset. This result is implementation verification, not a new user manual acceptance claim.

Full-suite evidence: `%TEMP%/jobquest-source-ui-cleanup-full.json`.
