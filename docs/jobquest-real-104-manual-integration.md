# JobQuest Real 104 Integration

Non-AI Product Work, Work Item 3. No new RP number.
Current status: USER MANUAL PASS / FROZEN_BY_MANUAL_ACCEPTANCE.
REAL_104_MANUAL_ACCEPTANCE = PASS.
Acceptance source: USER_MANUAL_BROWSER_TEST.
Browser/manual acceptance performed by Codex: NO.

## Observe and Gap Report

CURRENT_104_FLOW:
The existing MV3 connector reads the active, visible public 104 search results
only after the user clicks capture. It stores at most 10 DTOs for 30 minutes in
chrome.storage.session. An origin/channel/command/request-ID-limited bridge
delivers the payload to the app at http://localhost:5173. No permanent 104 host
permission, credential/cookie/history access, private API or automated capture is added.

Raw DTO: externalId, sourceKey, title, company, location, salaryText, canonicalUrl,
with optional experienceText and snippetText. Payload v1 includes capturedAt and
the public search sourceUrl. Missing essential capture fields are rejected by the
existing capture/schema contract, not invented. Optional snippet is empty and
optional experience uses the existing 未提供 marker in the Job normalizer.

Existing normalization: normalize104CapturedJob maps sourceKey to Job.id,
source='104', externalId to the canonical https://www.104.com.tw/job/{jobId},
and observed text fields directly. Skills come only from the existing dictionary
applied to observed title/snippet. No new scoring/extraction heuristic or Job model.

EXPECTED_MATCHING_INPUT:
Confirmed ResumeProfile + normalized Job[] -> existing matchingService ->
JobWithMatch[] -> existing JobList/JobCard. Local fixtures already use the same
Job model. Match percent is resume/job fit, not hiring probability.

MISSING_SEAM (code evidence before edits):
- App always passed localDemo to Board, disabling its already-existing Connector path.
- Import called onPreferenceChange after setting results. The reducer created a
  new preference object; Board's initialPreference effect then cleared real jobs.
- Card's 查看職缺 command only expanded details; the canonical link was inside
  those details. Real jobs also inherited a false 今日新增 badge because capture
  time is the normalizer's required timestamp fallback, not publication evidence.
- Header used a fixed 23 count when no Demo count was supplied.

No architectural model contradiction was found. Existing 104/matching baseline
tests passed 24/24 before edits. These were development tests, not live acceptance.

## Minimal Implementation Boundary

- App adds explicit DEMO_LOCAL / REAL_104 radio selection after existing confirmation.
  Default remains Demo; a Connector error never switches source or injects fixtures.
- Board instances are keyed by source/mode, so switching modes discards the previous
  result list. Real mode shows the existing search/import controls and REAL 104 label.
- The import validation/normalization/matching boundary is extracted into
  matchCaptured104Jobs for focused testing. It rechecks schema/TTL and search
  keyword/area, then calls the existing normalizer and matcher. No network reader
  or fallback is added to this service.
- Search preferences are saved when opening the search, not again after import;
  successful imports no longer trigger the preference-reset effect.
- Real cards expose a direct 查看職缺 canonical anchor, with target=_blank and
  noopener noreferrer. 查看配對 preserves the existing detail panel. Clicking the
  link only marks the local viewed status; it does not apply to a job.
- Suppress unsupported real-job freshness badges and the fixed real-header count.
  Existing card layout, grading, ranking, evidence and Demo behavior remain intact.
- Imported jobs remain in the Board's in-memory state; leaving/remounting the Board
  requires reimport. Existing real-mode collection pages retain their session-only
  explanation; this item does not add job persistence or redesign collections.

Production files changed:
- src/App.tsx
- src/pages/BoardPage.tsx
- src/services/connectorJobService.ts (created)
- src/components/layout/GuildHeader.tsx
- src/components/jobs/JobCard.tsx
- src/styles.css (link sizing/wrapping only)

Test created: tests/real104MatchingFlow.test.tsx.
Documentation: CONTEXT.md and this document (created).
104 extension/client/schema/normalizer, matching algorithm, Resume Review,
confirmation/snapshot, Mock extraction, parsers, AI architecture and Supabase
files remain unchanged. No config/dependency or database changes.

## Development Verification

The following results are historical implementation checks, not rerun for this
freeze. Authoritative product acceptance is the user's report recorded below.

Command:
`npx.cmd vitest run tests/real104MatchingFlow.test.tsx tests/job104Integration.test.ts tests/matchingEngine.test.ts`

PASS: 44/44 (20 new flow checks, 11 existing 104 checks, 13 matching checks).
Includes existing recorded capture fixtures, normalization identity/canonical links,
optional missing data, confirmed-profile handoff, stable matching, deleted primary
skill semantics, rejected missing/expired/malformed/mismatched inputs, distinct
Board states and a captured import-callback regression check for preference writes.
Component checks are server-rendered markup/callback unit checks, not browser E2E.
Recorded fixtures do not prove current live 104 capture availability.

`npm.cmd run typecheck`: PASS.
`npm.cmd run build`: PASS.
No broad suites, AI/DB calls, live public 104 browsing or browser acceptance by Codex.
The existing 5173 dev-server session reports HMR updates for these changes.

## Manual Test Instructions

1. In desktop Edge, open edge://extensions, enable Developer Mode and load unpacked
   folder `browser-extension/jobquest-104-connector/` from this repository. Existing
   Chrome/Chromium loading is also supported. Do not alter permissions or origin.
2. Open http://localhost:5173/ . This exact origin is required. Do not use 5174,
   127.0.0.1 or a deployed URL: the unchanged extension does not authorize them.
   The existing server is running; otherwise run
   `npm run dev -- --host localhost --port 5173` in the repository.
3. Complete the frozen Mock flow with a non-private synthetic PDF selection:
   generate complete/incomplete draft, review/edit, then 確認履歷. No PDF bytes are
   read or sent, and no real AI analysis occurs.
4. On the Board select REAL 104 under 職缺資料來源. Expect REAL 104 source labeling
   and Connector controls, no Demo cards. Resume remains Mock-confirmed.
5. Enter 前端工程師 and choose 台中市, the only existing verified area. Click
   前往 104 搜尋 to open the normal public results page. Empty keyword, 全部地區,
   台北市 and 新竹市 are not supported by the current connector search contract.
6. On that public results tab, click the installed Connector and 擷取目前職缺.
   Expect its captured count to be 1-10. If it captures none, record that first
   failing seam; do not change selectors, bypass challenges or scrape privately.
7. Return to JobQuest, press 檢查 Connector, then 匯入並配對 within 30 minutes.
   Keyword/location must match the captured source page. For missing/expired/bad
   data expect a specific message and no silent Demo fallback.
8. Verify REAL 104 label, real titles/companies/location/salary/available experience,
   match percentages/grades, matched/missing skills and descending matching order.
   Results should remain after import rather than disappear on preference update.
9. Click at least one 查看職缺. Verify the new tab is the corresponding canonical
   https://www.104.com.tw/job/{jobId} without tracking query. 查看配對 opens the
   existing details/evidence panel; no automatic application submission occurs.
10. Compare that card's company/title/location/salary/experience and visible snippet
    with its captured source result and original page. Missing snippet/experience
    must not become invented facts; source pages can change after capture.
11. Switch to MOCK / DEMO, then back to REAL 104. Expect distinct source labels,
    no mixed cards, and Real requires explicit reimport. No frozen Resume edits
    should be lost just because job source changed. Reload still clears local
    confirmed state; repeat confirmation and reimport if you reload.
12. Report your results and any first failing step/message. Real Resume + Real 104
    end-to-end acceptance is still pending real AI, independent of this Mock Resume
    + Real 104 test. Do not share private PDF content or credentials.

Final status: USER MANUAL PASS / FROZEN_BY_MANUAL_ACCEPTANCE.
The user subsequently reported the manual flow successful, as recorded below.

## User Manual Acceptance and Freeze

Record updated: 2026-09-28. Documentation-only freeze; no new RP number or document.
Evidence source: the user's explicit browser acceptance report supplied with this
freeze request. Codex did not repeat browser acceptance or replace it with tests.

REAL_104_MANUAL_ACCEPTANCE = PASS.
Acceptance source: USER_MANUAL_BROWSER_TEST.
Acceptance performed by: USER.
Acceptance performed by Codex: NO.

### User-Reported Evidence

1. Edge JobQuest 104 Connector loaded normally.
2. Visible public 104 search results were captured successfully.
3. JobQuest could check the Connector.
4. Real jobs were imported and matched successfully.
5. REAL 104 / DEMO LOCAL source labels were clear.
6. Real Quest Board job data matched the source 104 pages.
7. Matching results were produced normally.
8. Match percent, grade, matched skills and missing skills displayed normally.
9. 查看職缺 opened the corresponding canonical original 104 job page.
10. Real and Demo data did not mix.

These are user-reported observations, not new automated or live observations by Codex.

### Frozen Integration Boundary

Freeze status: FROZEN_BY_MANUAL_ACCEPTANCE.

Frozen flow: REAL 104 -> Browser Connector -> Existing Normalization ->
Confirmed ResumeProfile -> Existing Matching Engine -> Quest Board ->
Canonical Original 104 Job Page.

The confirmed profile is the existing user-confirmed matching input paired with
normalized jobs; normalization does not create or alter a ResumeProfile.

The freeze locks existing public capture/bridge behavior, normalization and
canonical identity (source='104', sourceKey/Job.id='104:{jobId}', canonical URL),
the confirmed-profile matching handoff, Real/Demo source isolation, existing
matching score/grade/ranking semantics, Quest Board data consumption/display and
the original-job link behavior. No synthetic facts or silent Demo fallback.
Match percent remains resume/job fit, not hiring probability.

Resume Review/editing/missing-data/confirmation snapshot remains independently
USER MANUAL PASS / FROZEN under its existing record.
Change any frozen area only if a reproducible production bug exists, evidence
implicates that area AND a dedicated Work Item explicitly authorizes modification.
No incidental refactor, connector rebuild, scoring change or Board redesign.

### Current Product Status

| Area | Status |
| --- | --- |
| Resume Review / Confirmation | USER MANUAL PASS / FROZEN |
| Real 104 Integration | USER MANUAL PASS / FROZEN |
| Matching Engine | VERIFIED THROUGH MANUAL PRODUCT FLOW / UNCHANGED |
| Quest Board | VERIFIED WITH REAL 104 DATA |
| Real AI PDF Extraction | BLOCKED / NOT YET VERIFIED |

Current primary unresolved seam: REAL_PDF -> AI_EXTRACTION -> EXISTING_RESUME_REVIEW.
This is the primary remaining product gap. Current manual PASS uses the
Mock-confirmed resume; it does not establish Real Resume + Real 104 AI end-to-end
acceptance. The external AI runtime remains blocked under the preserved checkpoint
and credential condition; this is not a failed PDF/AI product design.
Project status: ACTIVE_WITH_AI_RUNTIME_PENDING.

### Documentation-Only Verification

This freeze edits only CONTEXT.md and this existing document. No production,
test, config, browser extension, normalization, matching, Board, Review or Supabase
change, OpenRouter/database call or new feature is authorized or performed here.
No automated suites or browser acceptance were rerun. This directory has no .git;
verify the boundary using fresh pre/post SHA-256 manifests and file counts for
source/tests/extension/Supabase/scripts/root configs, plus individual document hashes.
Historical development verification remains separate from USER_MANUAL_BROWSER_TEST.

STOP. Await the user's next decision; do not start AI, 1111 or modify frozen modules.
