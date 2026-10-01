# JobQuest Job Preferences Persistence

Work Item 5 implementation: 2026-09-28. Documentation freeze: 2026-09-29.
JOB_PREFERENCES_PERSISTENCE_MANUAL_ACCEPTANCE = PASS.
Status: FROZEN_BY_MANUAL_ACCEPTANCE.
Authoritative evidence: USER_MANUAL_BROWSER_TEST, performed by USER.
Acceptance performed by Codex: NO; browser acceptance was not rerun.
Previous Review, Resume Persistence and REAL 104 USER MANUAL PASS / FROZEN records
remain unchanged. This freeze changes documentation only.

## User Manual Acceptance and Freeze

The following observations are the user's reported browser acceptance, not Codex
automated or independently repeated acceptance.

| Case | Result | User-observed evidence |
| --- | --- | --- |
| A - Preference Save | PASS | Set keyword = 前端工程師 and location = 台中市; the existing search action successfully saved Job Preferences. |
| B - F5 Restore | PASS | With the development server still running, F5 retained 前端工程師 / 台中市; the saved Confirmed ResumeProfile remained normal. |
| C - REAL 104 Compatibility | PASS | After restore, explicitly switching to REAL 104 retained saved search conditions. No automatic 104 opening or job import occurred; search and Connector flow still required user action. REAL 104 integration worked normally. |
| D - Resume / Matching Regression | PASS | Saved resume skills and certifications, Matching and REAL 104 Matching worked normally. Job Preferences persistence did not break existing frozen flows. |

Acceptance performed by: USER.
Acceptance performed by Codex: NO.

Frozen boundary:

1. Existing job_preferences table usage.
2. Existing owner/RLS behavior.
3. Preference serialization.
4. Preference save trigger.
5. Preference restore.
6. No-row/default behavior.
7. Restore into existing application state.
8. Preference save failure preserving local state.
9. No automatic REAL 104 navigation/import.
10. Preference -> existing search UI handoff.

Status: FROZEN_BY_MANUAL_ACCEPTANCE. Future modification requires all three:
a reproducible bug, evidence implicating this module, and a dedicated Work Item
explicitly authorizing modification. No "while I'm here" refactor.

## Locked Product Contract and Project Status

Job Preferences may persist user-selected search/career preference fields.
Restored preferences may populate existing UI. They must never automatically
switch to REAL 104, open 104, trigger Connector, import jobs or start Matching.
External/job-source actions remain user-triggered.

Previously frozen flows remain unchanged:

- Resume Review -> User Correction -> Confirmation -> Confirmed ResumeProfile.
- Confirmed ResumeProfile -> Supabase Save / Restore.
- REAL 104 -> Connector -> Normalization -> Matching -> Quest Board -> Original 104 Page.

| Project area | Current status |
| --- | --- |
| Resume Review / Confirmation | USER MANUAL PASS / FROZEN |
| Confirmed Resume Persistence | USER MANUAL PASS / FROZEN |
| REAL 104 Integration | USER MANUAL PASS / FROZEN |
| Job Preferences Persistence | USER MANUAL PASS / FROZEN |
| Real AI PDF Extraction | BLOCKED / NOT YET VERIFIED |

Next approved non-AI Work Item: USER_JOB_ACTIONS_PERSISTENCE_AND_RESTORE.
Project status: ACTIVE_WITH_AI_RUNTIME_PENDING.
The next Work Item is recorded only; no User Job Actions implementation, AI work,
new RP number or unrelated cleanup is started by this freeze.

## Existing Job Preferences State

Investigation preceded code changes. Read-only metadata queries used only the
approved JobQuest project `neqwkiruqfevlchiajor`; no projects were listed and no
user preference/resume rows, tokens, cookies or secret values were read.

| Item | Observed state |
| --- | --- |
| Table | Existing public.job_preferences |
| Ownership | user_id primary key, foreign key to auth.users(id), ON DELETE CASCADE |
| Existing repository | preferenceRepository.getCurrent / upsert |
| Existing service | preferenceService.load / save |
| Current frontend state | useLocalAcceptance.preference; App previously used only local.savePreference |
| Domain fields | SearchPreference: source, keyword, location, sortBy |
| DB representation | user_id, source, keyword, location, sort_by, created_at, updated_at |
| Schema compatible | YES |
| RLS compatible | YES; RLS enabled and authenticated owner SELECT/INSERT/UPDATE/DELETE policies |
| Authenticated grants | SELECT / INSERT / UPDATE present |
| Exact integration gap | Existing load/save were disconnected from the mainline App preference callback |

The existing UPDATE policy checks ownership in both USING and WITH CHECK;
SELECT/DELETE use auth.uid() = user_id and INSERT uses the same WITH CHECK.
Source constraint permits existing 104/1111 values. Keyword/location are non-null
text with empty-string defaults; sort_by is non-null text with default match.
No schema, RLS, grants, migrations, DB data or Edge Functions were changed.
Metadata reachability is verified; user-session live persistence is for manual
acceptance, not claimed from privileged metadata queries or mocked tests.

The older useCloudProfile mixes resume persistence and onboarding default writes.
It was inspected but deliberately not reactivated because those resume behaviors
are frozen. The new isolated preference hook reuses the existing service only.
No second SearchPreference model/table or new preference fields were added.

## Minimal Integration

App -> useJobPreferencePersistence -> jobPreferencePersistence -> existing
preferenceService -> existing preferenceRepository -> existing Supabase client.
The existing useAuth supplies the current owner; no Auth semantics changed.
UI components contain no new database queries.

| Existing domain field | Existing DB mapping |
| --- | --- |
| source | source, unchanged |
| keyword | keyword, unchanged |
| location | location; existing empty DB location restores as 全部地區 |
| sortBy = match-desc | sort_by = match |
| sortBy = newest | sort_by = newest |

Existing repository behavior, including legacy unknown-sort fallback, remains
unchanged. Upsert uses the current authenticated user id and existing
onConflict user_id. Official reference: [Supabase JavaScript upsert](https://supabase.com/docs/reference/javascript/upsert).

Existing search-submit/quick-search callbacks commit local preferences first and
then save an independent snapshot. Typing in the existing SearchPanel alone does
not persist its unsubmitted draft. There is no new save button or arbitrary field.
No preferences are automatically written on mount, no-row/default restore or
successful remote restore.

Auth-ready initialization loads saved preferences. If present they populate the
existing local preference state and search UI. If absent, current product defaults
remain and no fake settings row is created. Initial restore is allowed to finish
before mounting Board; restore failure still exposes the existing default flow.
Explicit restore retry leaves the current Board available.

Save failure keeps local search filters and matching input intact and displays a
safe retry state. Restore failure fabricates nothing and retains defaults/current
local settings. Raw database error details are not exposed. A late read cannot
override a newer edit/reset/owner. Writes are serialized; previous-owner queued
writes and late responses cannot replace current state. Existing RLS remains the
server-side authority for requests already in flight.

Initial offline edits can be saved when Auth recovers. Owner loss/change clears
previous-owner preferences to existing defaults without touching Auth semantics.
Unmount ignores late responses and supports StrictMode restart. Local settings
reset invalidates pending preference work without deleting the saved row; F5 can
restore it again, just as the unchanged resume persistence reset does.

## Frozen Source Behavior

Restored source is a SearchPreference field, not the App jobDataMode. REAL_104 /
DEMO_LOCAL selection remains explicit and does not persist in this work item.
Restore never imports 104 jobs, requests Connector capture/getLatest or opens an
external URL. A user must select REAL 104 and use the existing search/import buttons.
The frozen Board still performs its existing read-only Connector availability check
when the user selects REAL 104; no new Connector action was added.
Existing local Demo searching/matching behavior is unchanged.

Resume Review, confirmation/snapshot, resumeRepository, confirmed persistence
service/hook, Auth service/hook, Matching, Board/SearchPanel, Connector/normalization/
links and User Job Actions are not modified. No preferences were added to the
confirmed resume model. No AI, OpenRouter, PDF parser or 1111 work was performed.

## Prior Development Verification (2026-09-28)

This section preserves the implementation-stage evidence. Its file changes and
test/build results belong to the prior work item; none was rerun for this freeze.

Files modified: src/App.tsx, CONTEXT.md.
Files created: src/hooks/useJobPreferencePersistence.ts,
src/services/jobPreferencePersistence.ts, tests/jobPreferenceRepository.test.ts,
tests/jobPreferencePersistence.test.ts, tests/jobPreferenceApp.test.tsx,
and this guide.

Focused tests: 10 files, 129/129 PASS.
New preference tests: 35 PASS (mapping/service 8, lifecycle 20, App wiring 7).
Existing frozen-flow tests: 94/94 PASS, with their source unchanged.

```powershell
npx.cmd vitest run tests/jobPreferenceRepository.test.ts tests/jobPreferencePersistence.test.ts tests/jobPreferenceApp.test.tsx tests/confirmedResumeRepository.test.ts tests/anonymousAuthReuse.test.ts tests/confirmedResumePersistence.test.ts tests/confirmedResumeApp.test.tsx tests/manualAcceptanceFlow.test.tsx tests/resumeReviewHardening.test.tsx tests/real104MatchingFlow.test.tsx
npm.cmd run typecheck
npm.cmd run build
```

TypeScript: PASS. Build: PASS; non-blocking Vite >500 kB chunk-size warning.
No bundle/config refactor was added to address an unrelated size warning.
Tests use synthetic data and mocked service/database responses, not real Auth or
DB mutations. The existing verify:rls script is not executed because it writes
User Job Actions and other out-of-scope rows. No broad/all-tests TypeScript gate
or browser acceptance is claimed.

Before/after SHA-256 verification confirms all frozen production files, pre-existing
tests, configs, Supabase/migration files, scripts and previous freeze documents
unchanged. Only App glue, project context and the six new files above changed.

## Original Manual Test Instructions (Completed by USER)

The checklist below is retained for traceability. The authoritative A-D PASS
record is above; these instructions were not rerun by Codex during the freeze.

Use [JobQuest at the existing Connector-compatible origin](http://localhost:5173).
Stay in the same browser/profile with its existing anonymous session. No real
resume is needed; use the already confirmed restored profile. If none exists,
complete the existing Mock confirmation flow first.

1. **Case A - Save:** in Quest Board set keyword 前端工程師 and location 台中市.
   Use the existing 搜尋任務 button in DEMO LOCAL to submit these preferences.
   Wait for 求職偏好已保存至雲端. Typing alone is not a save. A zero-result Demo
   search is allowed and does not mean persistence failed.
2. **Case B - F5 Restore:** refresh the same tab. Confirm 已還原雲端求職偏好 and
   that 前端工程師 / 台中市 remain in the existing search UI. No Demo fallback
   values should replace them. The saved confirmed resume must also remain.
3. **Case C - REAL 104 Compatibility:** select REAL 104 explicitly. Verify the
   restored keyword/location are displayed. No external search page or job import
   should start by itself. Press 前往 104 搜尋 yourself, then follow the unchanged
   Connector capture/import workflow and check matching/original links.
4. **Case D - Resume Regression:** open 冒險者檔案 and verify the saved profile's
   edited skills/certificates remain. Return to matching; the restored confirmed
   profile, not raw Mock extraction, remains the matching input.

If saving fails, the local submitted preferences should stay available; retry from
the preference error control. Wait for successful saved status before F5 if those
edits must survive refresh. An unsaved edit cannot be promised after refresh.
No User Job Actions persistence is expected; favorites/applied/viewed/rejected are
still local-only. The user has now reported A/B/C/D PASS as recorded above.

## Deliverable

JOBQUEST JOB PREFERENCES PERSISTENCE FREEZE RESULT

| Contract | Result |
| --- | --- |
| Manual acceptance | PASS |
| Acceptance source | USER_MANUAL_BROWSER_TEST |
| Cases | A PASS / B PASS / C PASS / D PASS |
| Acceptance performed by | USER |
| Acceptance performed by Codex | NO |
| Freeze status | FROZEN_BY_MANUAL_ACCEPTANCE |
| Production files changed | NONE |
| Tests changed | NONE |
| Config changed | NONE |
| Documentation files changed | CONTEXT.md; docs/jobquest-job-preferences-persistence.md |
| Schema changed | NO |
| RLS changed | NO |
| Auth changed | NO |
| Job Preferences persistence behavior changed | NO |
| Resume persistence changed | NO |
| Resume Review changed | NO |
| Matching changed | NO |
| 104 changed | NO |
| Quest Board changed | NO |
| OpenRouter called | NO |
| Tests / TypeScript / build rerun | NO |
| Browser acceptance rerun | NO |
| Next approved Work Item | USER_JOB_ACTIONS_PERSISTENCE_AND_RESTORE |
| Project status | ACTIVE_WITH_AI_RUNTIME_PENDING |

Freeze verification uses the documentation diff and before/after SHA-256 file
comparison, not new runtime acceptance. Production source, tests, config, local
schema/RLS artifacts, Auth and all previously frozen flows remain unchanged.
No Supabase query, cloud mutation, schema migration or OpenRouter call was made.

STOP. Job Preferences Persistence is frozen by the user's manual acceptance.
No subsequent Work Item starts automatically.
