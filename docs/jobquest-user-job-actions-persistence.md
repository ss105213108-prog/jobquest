# JobQuest User Job Actions Persistence

Work Item 6, 2026-09-29: USER_JOB_ACTIONS_PERSISTENCE_AND_RESTORE.
Status: READY_FOR_USER_MANUAL_TEST. Development verification is not product
acceptance. Codex has not performed final browser acceptance or frozen this work.
Previous Resume Review / Confirmation, Confirmed Resume Persistence, REAL 104
Integration and Job Preferences Persistence manual PASS / FROZEN records remain.

Follow-up, 2026-09-29: the user's manual test exposed missing REAL job metadata
on Collection and lost working state after F5. The separately authorized
[REAL 104 session-restore fix](jobquest-real-104-session-restore.md) now supplies
shared browser-local metadata within the existing TTL, without changing this
action persistence module or storing jobs in Supabase. Its current A-F checklist
supersedes the re-import-only instructions below while a valid same-tab cache
exists. These changes do not constitute USER MANUAL PASS or a new freeze.

## EXISTING_USER_JOB_ACTIONS_STATE

Investigation preceded implementation. Read-only catalog queries used only the
existing JobQuest project `neqwkiruqfevlchiajor`, matching local configuration and
the existing client target guard. No projects were listed, user data rows read,
Auth accounts created or cloud writes performed during development verification.

| Item | Evidence / result |
| --- | --- |
| Table | Existing public.user_job_actions |
| Ownership | user_id references auth.users(id), ON DELETE CASCADE; primary key (user_id, job_key) |
| Columns | user_id uuid; job_key/source text; favorite/viewed/applied/rejected non-null boolean default false; created_at/updated_at timestamptz default now() |
| Source constraint | Existing 104 / 1111 values only; no new integration |
| Existing repository | jobActionRepository.getAll / upsert / importMany |
| Existing service | jobActionService.load / set and nextFavorite / nextViewed / nextApplied / nextRejected |
| Existing hook | useJobActions existed but App did not call it |
| Current frontend action state before this change | App consumed useLocalAcceptance.statuses/actions; state was memory-only |
| REAL 104 identity | Existing normalization maps capture.sourceKey to Job.id: 104:{jobId} |
| DEMO_LOCAL identity | Existing fixture Job.id, e.g. 104-01 / 1111-01; distinct from REAL 104 colon keys |
| Schema compatible | YES; no job FK/full-record requirement, new table or migration needed |
| RLS compatible | YES; enabled, authenticated owner SELECT/INSERT/UPDATE/DELETE policies |
| Privileges | has_table_privilege confirms authenticated SELECT/INSERT/UPDATE/DELETE; anon has none; public schema usage is present |
| Exact integration gap | App bypassed the existing action hook/service/repository; old hook waited for remote success and used render-captured state. Old load could auto-import unowned legacy localStorage, and old progress helpers differed from the active local reducer. |

Live policy metadata confirms SELECT/DELETE USING auth.uid() = user_id, INSERT
WITH CHECK on the same owner, and UPDATE with both USING and WITH CHECK. These
policies are unchanged. Metadata verification establishes backend compatibility;
it does not claim live browser-owner save/restore acceptance.

## Minimal Seam and Action Contract

UI -> App -> useJobActions -> jobActionPersistence -> existing jobActionService
-> existing jobActionRepository -> existing Supabase client / user_job_actions.
The existing useAuth provides readiness and owner. No query is placed in JobCard.

| Existing product action | Existing internal value / DB boolean | Preserved behavior |
| --- | --- | --- |
| 收藏 | favorite | Toggle independently |
| 已看 / 已查看 | viewed | Add on the existing view/detail action; retain existing progress |
| 已投遞 | applied | Add applied, remove rejected; retain viewed/favorite |
| 不適合 | rejected | Add rejected, remove applied; retain viewed/favorite |

All 16 combinations of the four existing flags are checked against the unchanged
localAcceptanceReducer transitions. No new action enum or ranking semantics.

REAL 104 keeps `source = 104` and `job_key = Job.id = sourceKey = 104:{jobId}`,
using the Connector's existing lowercase alphanumeric job ID contract. Demo keeps
its existing stable hyphen fixture IDs. A source/key mismatch or unsupported key
cannot be written as another job. Restore excludes inconsistent rows; it never
converts a title/company/index/score to an identity. The existing 1111 fixture
keys remain supported; no real 1111 connector is introduced.

App supplies only the current source/mode's statuses to the frozen Board and
Collection, including counts. REAL `104:01` and Demo `104-01` are separate keys
even if their title/company happen to match. The complete owner action map stays
in application state, so changing modes does not discard another mode's actions.

## Save, Restore and Failure Behavior

Each existing action updates local UI synchronously, then saves an independent
snapshot. Existing upsert uses onConflict `user_id,job_key` and writes only
user_id/job_key/source plus the four flags; timestamps use the existing DB rules.
There is no cloud job cache, resume payload, preferences payload or Matching data.
Official API reference: [Supabase JavaScript upsert](https://supabase.com/docs/reference/javascript/upsert).

Auth-ready initialization loads only the current owner's saved actions, with an
explicit user_id filter as well as existing RLS. It writes nothing for no rows,
restore or job import. Automatic legacy localStorage import was removed from the
active load path because it lacks owner attribution and is outside this work.
The repository's existing importMany remains unused by this flow.

Restored actions exist before any full job record is required. When the same
canonical job is explicitly re-imported through the unchanged Connector and
Matching flow, JobList's existing Job.id lookup applies its restored flags.
Action restore never switches to REAL 104, opens 104, triggers Connector/import
or calls Matching. The existing Demo initialization and explicit REAL selection
availability check are unchanged.

Writes are serialized, with obsolete queued versions skipped. A delayed read
restores untouched jobs while preserving all keys edited in this session,
including favorite removal. A failed write retains local markers and a retry
snapshot; another job's successful save cannot hide that failure. Restore errors
retain current state and allow retry and continued use. Raw DB errors are not
rendered. Neither failures nor action flags delete jobs or change match results.

Initial actions made without an owner remain local until Auth recovers. Switching
or losing an established owner clears that owner's statuses/pending retries;
stale reads, queued writes and completions cannot update the new owner's local
state. Already in-flight requests remain subject to existing server RLS. Unmount
ignores late work; StrictMode restart can reload and retry pending snapshots.
The existing settings reset clears session state and invalidates pending work,
without deleting saved rows; F5 may restore them again.

## Development Verification

Production files modified:

- src/App.tsx: action hook, active source projection, existing-style status/error
  notice and session-reset handoff; frozen resume/preference callbacks are retained.
- src/hooks/useJobActions.ts: Auth-ready lifecycle bridge to action persistence.
- src/services/jobActionService.ts: owner-filtered read-only restore, canonical
  source resolution and exact active local action semantics.
- src/repositories/jobActionRepository.ts: owner filter and source/key validation;
  same table, flags and upsert conflict key.

Production files created: src/services/jobActionIdentity.ts and
src/services/jobActionPersistence.ts.
Tests created: tests/jobActionRepository.test.ts, tests/jobActionPersistence.test.ts
and tests/jobActionApp.test.tsx. Pre-existing tests are unchanged.
Documentation updated/created: CONTEXT.md and this guide.

Focused tests: 15 files, 203/203 PASS (52 new action tests, 151 existing regression
tests). Executed as the following 14-file run (195 PASS) plus the new App run
(8 PASS), not a broad all-tests run:

```powershell
npx.cmd vitest run tests/jobActionRepository.test.ts tests/jobActionPersistence.test.ts tests/jobPreferenceRepository.test.ts tests/jobPreferencePersistence.test.ts tests/jobPreferenceApp.test.tsx tests/confirmedResumeRepository.test.ts tests/anonymousAuthReuse.test.ts tests/confirmedResumePersistence.test.ts tests/confirmedResumeApp.test.tsx tests/manualAcceptanceFlow.test.tsx tests/resumeReviewHardening.test.tsx tests/real104MatchingFlow.test.tsx tests/job104Integration.test.ts tests/matchingEngine.test.ts
npx.cmd vitest run tests/jobActionApp.test.tsx
npm.cmd run typecheck
npm.cmd run build
```

TypeScript: PASS. Build: PASS. Tests use synthetic owner/row/job data and mocked
DB responses. RLS rejection propagation is simulated; live owner-session RLS
write acceptance is reserved for the user. The existing verify:rls script is not
run because it creates users/writes rows and touches other frozen areas.
No broad parser suite, browser final acceptance, AI or OpenRouter call was run.

Before/after SHA-256 comparison covers workspace files excluding node_modules,
dist, .git, .vitest and .vite. Frozen Review, confirmed-resume and preference
modules, Auth/client, Matching, Connector/normalization, Board/Collection/JobCard,
fixtures, pre-existing tests, config, scripts, Supabase/migration artifacts and
previous freeze documents are unchanged.

## Original Work Item 6 Manual Test Instructions

The following checklist records the pre-session-fix checkpoint. For current
valid-cache refresh behavior use the linked session-restore checklist above.

Use [JobQuest at the existing approved origin](http://localhost:5173) in the same
browser/profile and anonymous session as the prior manual acceptance. Keep the
development server running. If it is not running, start it in the project with
`npm.cmd run dev -- --host 127.0.0.1 --port 5173 --strictPort`.

After loading, wait until 職缺操作 restore has finished before clicking actions.
For every action below, wait for **職缺操作已保存至雲端。** before F5. A failed or
still-pending save is not evidence that an edit will survive refresh. Use the
existing error retry if needed. F5 returns to the unchanged explicit source flow:
select REAL 104 yourself and re-import the same canonical jobs, recapturing through
the existing Connector if its session has expired. Do not accept an automatic
source switch, external opening or import as normal restore behavior.

Identify at least four distinct REAL jobs by the original 104 URL's job ID, and
record their exact keys `104:{jobId}`; avoid confusing similarly titled jobs.

1. **Case A - 收藏:** import REAL 104 jobs and toggle one job A to 收藏. Confirm
   ★ 已收藏, wait for saved status, F5, wait for restore, explicitly select REAL
   104 and re-import the same job A. It must still show ★ 已收藏 without toggling
   it again. Optional removal check: un-favorite, save, F5/re-import; it stays off.
2. **Case B - 已看:** use a different job B; its existing 查看職缺 or 查看配對
   action sets viewed. Wait for saved status, then F5/re-import. The frozen JobCard
   has no independent viewed badge, and REAL history does not keep full job
   records, so use a read-only browser check: open F12 -> Network, filter
   `user_job_actions`, then F5 and wait for restore. Select the GET restore
   request's Response; the row with B's exact job_key must have viewed=true.
   Inspect this before clicking B again, which would mark it viewed anew. This
   verifies the returned saved flag; Codex unit tests cover its application to
   state. It does not claim a new viewed badge exists.
3. **Case C - 已投遞:** use another job C; open its existing detail and choose
   標記已投遞. Wait for saved status, F5/restore/re-import C, then open its existing
   detail. It must show 已投遞 as active; opening detail must not clear applied.
4. **Case D - 不適合:** use another job D, open detail and select 不適合. Save,
   F5/restore/re-import, then verify 已標記不適合 stays active. A/B/C retain their
   own flags. This action must not delete D or modify its match score/grade/skills.
5. **Case E - Isolation:** with at least two distinct REAL jobs, retain different
   actions (e.g. A favorite and C applied). After F5/restore/re-import they must
   stay attached only to their exact job keys. Also switch to DEMO LOCAL: REAL
   flags/counts must not apply to Demo fixtures. A Demo action, if tested, must
   keep its hyphen fixture ID and must not overwrite a REAL colon key.
6. **Case F - Frozen Regression:** confirm saved resume skills/certifications and
   keyword 前端工程師 / location 台中市 still restore; explicitly selecting REAL
   104 and importing still works; Matching's score/grade/skills are unchanged;
   查看職缺 still opens the exact original 104 page for that canonical job.

Record A-F PASS/FAIL with observations. Cases are pending, not marked PASS by Codex.
No full REAL job list is promised in favorites/history after F5: the existing
Connector session/re-import limitation is preserved; action flags persist alone.

## JOBQUEST USER JOB ACTIONS PERSISTENCE

| Contract | Result |
| --- | --- |
| Existing Supabase reused | YES |
| Existing table reused | public.user_job_actions |
| Canonical job identity | REAL: source=104, job_key=Job.id=sourceKey=104:{jobId}; Demo: existing fixture Job.id |
| Schema changed | NO |
| RLS changed | NO |
| Auth behavior changed | NO |
| 收藏 persistence | YES - implemented / development verified; manual live acceptance pending |
| 已看 persistence | YES - implemented / development verified; manual live acceptance pending |
| 已投遞 persistence | YES - implemented / development verified; manual live acceptance pending |
| 不適合 persistence | YES - implemented / development verified; manual live acceptance pending |
| REAL / DEMO isolation | YES - development verified |
| Resume persistence changed | NO |
| Job Preferences changed | NO |
| Matching changed | NO |
| 104 Connector changed | NO |
| OpenRouter called | NO |
| Focused tests | 203/203 PASS |
| TypeScript | PASS |
| Build | PASS |
| Manual acceptance performed by Codex | NO |
| Final status | READY_FOR_USER_MANUAL_TEST |

Project status: ACTIVE_WITH_AI_RUNTIME_PENDING. Real AI PDF extraction remains
BLOCKED / NOT YET VERIFIED. No new RP number, migration, RLS/Auth redesign,
unrelated cleanup or subsequent work is started. STOP; await user acceptance.
