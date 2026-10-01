# JobQuest Resume Review Hardening

Manual Acceptance Track, Work Item 2. No new RP number.

Work Items 1 and 2 Manual PASS were reported by the user. Work Item 2 cases
A/B/C/D are PASS; the downstream flow is FROZEN_BY_MANUAL_ACCEPTANCE.
Acceptance source: USER_MANUAL_BROWSER_TEST. Codex has not performed browser/manual acceptance.
The existing real-AI runtime freeze remains unchanged.

## Implementation

- Upload offers complete (default) and deliberately incomplete Mock scenarios.
- `mockResumeExtraction(file)` remains the complete adapter. The incomplete
  adapter returns the same formal ResumeProfile with empty education/certificates,
  work title only, and project name with empty skills. Neither reads PDF content.
- Scenario selection stays in the upload UI; Review has no scenario flag,
  Demo-name condition or fixed-value dependency. Both adapters return ResumeProfile.
- Review explicitly labels its content DRAFT / MOCK, not actual PDF AI analysis.
- Empty optional inputs display a placeholder; empty lists display
  "未辨識，可手動補充" with their existing add controls. Missing data is never generated.
- Existing skill, work, project/project-skill, certificate and career-direction
  add/delete controls and education/work/project editing remain in place.
- Confirmation uses `confirmResumeDraft(draft)`, a deep snapshot of current edits,
  trimmed name and current timestamp. Only then does the existing confirmation
  action place a ResumeProfile in the state consumed by matching.
- Existing name/work-title/project-name checks are unchanged. Empty education,
  certificates, project skills, optional work fields and empty collections do not
  block confirmation; empty named entries can be removed instead of filled.
- No new draft/mock fields were added to ResumeProfile. Future extraction can
  replace the file-to-ResumeProfile adapter without modifying Review or matching.

## Files Changed

- `src/services/mockResumeExtraction.ts`
- `src/components/onboarding/ResumeStep.tsx`
- `src/components/onboarding/ResumeReview.tsx`
- `src/utils/resumeReview.ts` (created)
- `src/styles.css`
- `tests/resumeReviewHardening.test.tsx` (created)
- `CONTEXT.md`
- `docs/jobquest-resume-review-hardening.md` (created)

## Verification

Focused command:
`npx.cmd vitest run tests/resumeReviewHardening.test.tsx tests/manualAcceptanceFlow.test.tsx tests/matchingEngine.test.ts`

PASS: 44/44 (14 hardening, 17 local-flow, 13 existing matching tests).
These cover adapter privacy, static component output/control availability,
optional empty data, confirmation snapshots and deleted-skill matching.
They do not claim browser interaction acceptance.

`npm.cmd run typecheck`: PASS.
`npm.cmd run build`: PASS.

Matching Engine, parser, 104 connector and Supabase source files: unchanged.
OpenRouter/AI calls: 0. Private resume used: NO. Database required: NO.
Browser final acceptance by Codex: NO.

## User Manual Tests

Preview: http://localhost:5174/ (5173 was already occupied). Use only a non-private synthetic PDF selection
(nonempty, PDF extension/type, at most 10 MB). Its bytes are not read or uploaded.
Reload before each case to clear in-memory state and return to Upload.

### Case A: Complete Draft

1. Select a synthetic PDF, select "完整草稿", then "產生 Mock Extraction".
2. Verify DRAFT / MOCK notice; add Python under skills and remove Git.
3. Edit education, work description and project description. Test adding/removing
   a work entry, project, project skill, certificate and career direction.
   Any retained new work/project needs its existing title/name; other fields may stay blank.
4. Click "確認履歷". Expect the Quest Board and edited data in the profile/sidebar;
   no matching should appear before confirmation.

### Case B: Missing Certificates

1. Select "缺漏草稿" and generate the draft.
2. Under certificates, expect no certificate tags and "未辨識，可手動補充".
3. Add "Synthetic Certificate", confirm and enter matching. Verify it remains in
   the profile. Repeat without adding a certificate: confirmation must still work.

### Case C: Missing Work Fields

1. Generate "缺漏草稿". Expect a work title but blank company/location/dates,
   duration and description, with missing-data placeholders.
2. Enter "Synthetic Studio" and a synthetic work description. Fill the empty
   education fields and add/remove project skills as desired.
3. Confirm and enter matching. In the profile, verify the entered content remains
   and untouched optional fields were not replaced by guessed values.

### Case D: Deleted Prefilled Skill

1. Generate "完整草稿" and remove React from the top-level skills list.
   Leave React in project skills to test that it is not restored automatically.
2. Confirm. On the Quest Board, open the React frontend job's skill details.
3. React must not appear under "符合"; it should appear under "待補" where required.
   Its appearance as a job requirement/project skill does not mean it is a Resume skill.
4. Verify the profile/sidebar skills do not contain React. Do not assume a fixed
   matching score, since other retained skills and evidence still contribute.

The user subsequently reported all four cases PASS, as recorded below.

## Manual Acceptance and Freeze

Recorded: 2026-09-28. This is a documentation-only freeze, not a new RP.
Evidence source is the user's explicit report supplied with this freeze request;
Codex did not rerun the browser cases or replace them with automated acceptance.

RESUME_REVIEW_MANUAL_ACCEPTANCE = PASS.
Acceptance performed by: USER.
Acceptance performed by Codex: NO.
Browser manual verification: YES (USER).

| Case | Result | User-observed evidence |
| --- | --- | --- |
| A: Complete Draft Edit | PASS | Complete Mock prefilled Review; edited skills/content were preserved and passed into matching after confirmation. |
| B: Missing Certification | PASS | Missing certificates were visible and manually addable; both added and empty certificates allowed confirmation/matching; no facts were invented. |
| C: Partial Work Experience | PASS | Missing company/work-content fields could be filled; edits remained after confirmation; untouched fields were not guessed; matching succeeded. |
| D: Delete Resume Skill | PASS | Projects still contained React, but the user removed it from primary resume skills. The confirmed primary skills excluded React, and Quest Board listed it as 待補, not 符合. |

Case D supports that this accepted flow consumes the user's confirmed snapshot,
not the original Mock object. It does not claim that real AI extraction has been verified.

### Frozen Boundary

Status: FROZEN_BY_MANUAL_ACCEPTANCE.

1. Resume Review editing flow.
2. Missing-data handling.
3. Skills add/delete.
4. Education editing.
5. Work experience add/edit/delete.
6. Projects add/edit/delete.
7. Project skills add/delete.
8. Certifications add/delete.
9. Career directions add/delete.
10. User confirmation behavior.
11. Confirmed ResumeProfile snapshot behavior.
12. Confirmed ResumeProfile -> Matching Engine handoff.
13. Quest Board consumption of confirmed resume data.

Changing these areas requires all three conditions: a reproducible production
bug exists, evidence implicates the frozen area, and a dedicated Work Item
explicitly authorizes modification. No incidental refactor or redesign.

### Locked Product Contract

Extraction result is always DRAFT. Only explicit user confirmation creates the
CONFIRMED ResumeProfile consumed by matching. Never send raw AI results, raw
Mock results or unconfirmed extraction results directly to matching.

Frozen flow: Resume Draft -> Resume Review -> User Correction -> Confirmation
-> Confirmed ResumeProfile -> Matching -> Quest Board.

Extraction uncertainty leaves fields empty or [] where appropriate. Do not
invent resume facts. Users may add/edit/delete before confirmation. Optional
empty fields must not automatically block confirmation; retain existing domain
requirements without adding arbitrary required fields.

### Remaining Upstream Seam and Project Status

Current upstream: mockResumeExtraction(file) -> existing Resume Review.
Future upstream: callAiResumeExtraction(file) -> existing Resume Review.
Real AI must produce data compatible with the existing ResumeProfile / extraction
contract. Do not create a second Resume model or redesign the frozen downstream flow.

MANUAL CORE FLOW: Resume Upload -> Mock Extraction -> Resume Review -> User
Correction -> Confirmation -> Matching -> Quest Board.
Status: MANUAL PASS / FROZEN.

REAL AI PDF EXTRACTION: BLOCKED / NOT YET VERIFIED.
The course-shared OpenRouter inference path cannot currently be relied upon.
Only the external AI runtime seam is blocked; this is not a failed PDF/AI product
design and does not establish a new technical root cause for prior failures.
The historical runtime checkpoint and safety requirements remain unchanged.

Existing 104 connector/integration work remains preserved. Real Resume + Real
104 end-to-end acceptance is pending until real AI extraction is available.
No 104 work is reopened by this freeze.

Current unresolved seam: REAL_PDF -> AI_EXTRACTION -> EXISTING_RESUME_REVIEW.
Project status: ACTIVE_WITH_AI_RUNTIME_PENDING.
Recommended next step: WAIT_FOR_VERIFIED_WORKING_AI_CREDENTIAL or explicitly
authorized CONTINUE_NON_AI_PRODUCT_WORK.

### Freeze Verification Boundary

This freeze changes only CONTEXT.md and the two existing manual acceptance guides.
No new document, production/test/config/Supabase change, OpenRouter/database call,
or broad test rerun is part of this work. The directory has no .git; verify the
change boundary by comparing pre/post file counts and SHA-256 manifests for src,
tests, supabase, scripts, root configuration files and individual documentation files.
Existing automated test results above remain historical implementation checks.
User manual acceptance is the authoritative product evidence for this freeze.

STOP. Wait for the user's decision; do not start real AI, 104 or another Work Item.
