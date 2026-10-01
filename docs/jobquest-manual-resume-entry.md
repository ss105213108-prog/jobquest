# JOBQUEST MOCK PDF ENTRY REMOVAL

Date: 2026-09-29. Status: READY_FOR_USER_MANUAL_TEST.
Authority: approved `jobquest-mock-pdf-entry-removal-design.md` and the subsequent
implementation request. No new RP, deployment, cloud SQL, AI runtime or browser acceptance.

## Implementation

Official App entry is 建立我的履歷 → `createEmptyResumeDraft()` → existing
`ResumeReview` → existing `persistence.confirm`. Creation is mounted after the
existing initialization gate and keyed to the current owner so an unconfirmed draft
cannot carry over to a different identity. It stays in component memory; 返回
discards only that draft. Confirmation alone unlocks matching.

The factory uses existing ResumeProfile: empty name, skills, education strings,
work experiences, projects, certificates, career directions and abilities; a unique
id, current updatedAt and technical baseline level 1. No file, contact, synthetic
candidate, parseMetadata, extraction or inferred ability is generated.

ProfilePage retains its existing edit/update/cancel handoff and id. The replacement
PDF branch is removed and its edit CTA is 編輯我的履歷. ResumeReview gains only
the approved optional source-copy context: manual-create, confirmed-edit, ai-draft,
mock. Manual/confirmed edit use 未填寫 and accurate unconfirmed/updated copy.
Mock remains the legacy default. AI copy remains an unused future presentation
seam and does not activate extraction. Field editing, validation, tag operations,
cloning, confirmation, busy/error handling and layout are unchanged.

`mockResumeExtraction`, ResumeStep, legacy off-main-entry dev components and Mock
tests remain. The official App/Profile/manual factory/wrapper have no Mock or AI
extraction calls. The AI JSON schema, ReviewCandidate/draft, mapping, server
`parse-resume-ai` architecture and tests remain unchanged. The documented future
`callAiResumeExtraction` seam is preserved; it is not an implemented frontend
runtime function. No AI provider or Edge Function was invoked.

## Automated verification

Focused regression: 21 files / 460 tests PASS, including 12 new manual-entry cases,
the existing Review, persistence/repository/App, Mock adapters, pure AI contract,
confirmed-only matching, REAL104 integration/session, preferences, actions and
job snapshot/ghost saved-job suites. The initial run had one stale expectation
for a creation CTA during Auth initialization; corrected to assert the preserved
loading gate and absence of an entry mount. No production fix was needed for it.

TypeScript PASS. Production build PASS; existing bundle-size advisory remains
(main JS approximately 517 kB). No browser or real cloud round-trip was performed.
Repository mocks and deterministic component callbacks prove local handoffs, not
user browser acceptance or live cloud results. A–H remain NOT VERIFIED until the
user reports manual results.

SHA-256 scope comparison covers the 880-file pre-change baseline, excluding build
output/dependencies. Frozen Resume data contract, Review validation utility,
confirmed persistence, Auth, preferences, actions, Matching/Board, REAL104
Connector/normalization/session TTL, snapshots, Mock and AI implementation/tests
retain their prior hashes. ResumeReview functional blocks and field callbacks were
compared after normalizing only the approved source-copy substitutions.

## Required report

| Item | Result |
| --- | --- |
| Official PDF/MOCK entry removed | YES |
| Manual create-resume entry | YES |
| Empty draft contains synthetic data | NO |
| Existing edit-resume flow | YES |
| Misleading MOCK/PDF production copy removed | YES (resume mainline; Demo job labels remain accurate) |
| Resume Review behavior changed | NO, except approved source-copy interface |
| Mock adapter preserved | YES |
| Official production flow calls mock adapter | NO |
| AI seams preserved | YES |
| Database changed | NO |
| Auth changed | NO |
| Matching changed | NO |
| 104 Connector changed | NO |
| Focused tests | PASS, 460/460 |
| TypeScript | PASS |
| Build | PASS |
| Manual acceptance performed by Codex | NO |
| Final status | READY_FOR_USER_MANUAL_TEST |

## User manual checks — STOP after implementation

Use the existing preview. For A, use an identity with no saved confirmed resume;
an identity with existing data should restore its profile, not force new creation.
No cloud deletion or Auth changes are needed for these checks.

A — New user/manual entry: after identity initialization/restoration, confirm
建立我的履歷 appears and no PDF selection is required.

B — Empty draft: click it; the existing editor opens with all domain fields empty,
no fake person/skills/education/work/projects/certificates/directions. Blank name
keeps confirmation disabled. 返回 cancels without saving; reopen starts blank.

C — Manual Review copy: confirm no Mock/PDF/AI-parsing claims. Missing fields say
未填寫; the copy describes an unconfirmed manual draft.

D — Fill and confirm: enter name and desired fields. New work items require title;
new projects require name, or remove blank rows. Click 確認履歷; matching uses the
entered profile and the existing save status reports success.

E — F5: refresh in the same existing identity. The saved confirmed fields restore
without Mock regeneration or a forced create/upload step.

F — Edit existing resume: open profile → 編輯我的履歷. Check fields, cancel once
to confirm old content remains, then change and confirm. Refresh and verify update
persists, including edited skills/certificates and the same existing profile.

G — REAL104: select REAL104 and use the existing Connector input. Matching uses
the confirmed edited profile; no unconfirmed draft or Demo fallback enters it.

H — Regression: change preferences; exercise favorite/viewed/applied/rejected;
refresh and inspect saved-job cards, statuses, preference restoration and original
104 links. Confirm the existing session restore/expiry behavior remains intact.

Record A–H as PASS/FAIL with the first exact failure. Do not label this cleanup
MANUAL PASS or FROZEN_BY_MANUAL_ACCEPTANCE until the user supplies that evidence.
