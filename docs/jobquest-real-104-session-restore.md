# JobQuest REAL 104 Session Restore

2026-09-29. Type: INVESTIGATION -> DESIGN -> IMPLEMENTATION -> VERIFICATION.
Status: READY_FOR_USER_MANUAL_TEST. No new RP number or final browser acceptance.
This is a dedicated user-authorized fix for the two reported Work Item 6 failures;
it does not alter previously frozen algorithms or permanent persistence modules.

Subsequent user report: ghost favorites outside the latest cached job set still
produce badge/card mismatch. The separately authorized investigation is **BLOCKED**:
live user_job_actions has no snapshot field, so the user's schema STOP rule prevents
implementation here. See [the current ghost-job blocker](jobquest-ghost-saved-job-investigation.md).
The READY status and verification below describe this earlier session-restore
checkpoint; they do not establish that the subsequent ghost-job bug is fixed.

## Investigation and Reproduction

The user observed a favorite count of 1 with no REAL job card, and F5 returning
REAL to Demo while discarding imported jobs. Investigation preceded production
changes. The deterministic component mount/effect regression command was:

```powershell
npx.cmd vitest run tests/real104SessionRegression.test.tsx
```

Before the fix, both minimal one-job tests failed: the App rendered
`Board source: DEMO_LOCAL` with a valid REAL working snapshot, and Collection
rendered its empty state despite matching `104:844qv` action and metadata input.
Both failures were reproduced again after reducing the fixture to one job.
After the fix, that same loop passes; additional lifecycle tests also pass.
This is development reproduction, not Codex browser acceptance.

| Required observation | Proven state before the fix |
| --- | --- |
| SOURCE_MODE_STORAGE | App useState('DEMO_LOCAL'); component memory only |
| REAL_JOB_LIST_STORAGE | BoardPage useState<JobWithMatch[]>; no App handoff or client cache |
| ACTION_STORAGE | Existing Supabase user_job_actions stores owner, job_key/source, four boolean flags and timestamps, not full jobs |
| SAVED_PAGE_JOB_LOOKUP | REAL Collection explicitly sets sourceJobs=[] and stops; it cannot resolve Board's imported metadata |
| F5_BEHAVIOR_ROOT_CAUSE | A fresh App uses its default Demo mode; the unmounted Board's job list is lost |
| SAVED_JOB_EMPTY_ROOT_CAUSE | The canonical action key has no shared metadata source for Collection, even before F5 |
| SAME_ROOT_CAUSE | YES - missing App-level transient working-session boundary, with separate mode and job-metadata handoff gaps |

Three ranked hypotheses were checked: missing working-session ownership/handoff,
canonical-key mismatch, and freshness/search rejection. Existing normalization
produces Job.id=sourceKey=104:{jobId}, exactly matching the action repository's
job_key. The repro uses a fresh capture with matching accepted search conditions.
Source inspection confirms the transient state and explicit Collection empty
branch; identity and TTL are preserved, rather than repaired speculatively.
No reusable App localStorage/sessionStorage utility existed for this job session.
Relevant source uses the unchanged JOB104_PAYLOAD_TTL_MS = 30 * 60 * 1000.

## Storage and Shared State Design

Permanent user data stays in the existing Supabase tables: confirmed resume,
Job Preferences and user_job_actions. No database table, migration, cloud job
cache, Auth change or cloud query/write was introduced by this fix.

Transient public data uses same-tab **sessionStorage**, key
`jobQuest.real104Session.v1`, with versioned mode/snapshot and a small invalidation
marker when needed. Refresh retains it; closing the tab ends this working cache.
Other tabs start with their own session state, and the permanent Supabase data
is unaffected. Unavailable/quota-blocked storage retains current in-memory jobs
and displays that refresh may require re-import; it does not claim persistence.

The snapshot contains only selected REAL_104 / DEMO_LOCAL mode, the most recent
normalized public Job set required by the existing cards (maximum JOB104_MAX_JOBS,
currently 10), keyword/location, capturedAt and importedAt. Existing Job.id,
source, externalId and canonical URL are copied without changing semantics.
Explicit field projection strips unknown properties. No credentials, cookies,
browsing history, private account data, raw HTML, raw Connector payload, confirmed
resume, saved actions or match scores are stored in this session snapshot.

App -> useReal104Session -> real104Session owns the shared snapshot and ephemeral
matching results. Existing explicit Board import still calls the frozen Connector
and matchCaptured104Jobs. Only its successful normalized result/time handoff is
new. The capture time is taken from the existing normalizer's canonical collectedAt,
so accepted offset timestamps preserve the same instant and freshness deadline.
Raw extraction/normalization/Connector code remains unchanged.

## Restore, Freshness and Safety

Within accepted TTL, a new App mount immediately respects the saved explicit
source mode; it does not first show a Demo job list. Snapshot search values feed
the working UI without calling the frozen preference save/restore module.
After the saved Confirmed ResumeProfile is available, the unchanged matchingService
recomputes scores/grades/ranking/skills from the normalized jobs. Matches stay
in memory. Profile changes recompute, and late matching responses are ignored.
A successful live import can reuse its existing matching result in memory.

Board, favorites and history read the same shared REAL matching list. The existing
JobList lookup joins Supabase action flags through exact Job.id/sourceKey, never
title/company/index/score/order. REAL colon keys and Demo hyphen fixture keys
remain distinct, including counts and page filtering. Viewed/progress records
now have metadata on history while the cache is valid; JobCard semantics and
original links are unchanged. Actions for jobs outside the latest cached set
remain saved, but this fix does not fabricate or permanently archive their cards.

Cache validation checks shape, supported version/mode, source, canonical ID and
URL, normalized timestamps, required field types, unique identities and accepted
maximum size. In-memory freshness validation reuses get104PayloadState with a
minimal transient validation envelope; that envelope is never stored. It preserves
the exact existing TTL boundary and accepted clock tolerance without new durations.
The deadline is capturedAt + JOB104_PAYLOAD_TTL_MS; importedAt never extends it.

After expiry, snapshot jobs/scores are removed and an expired marker preserves
REAL mode across another F5. Both Board and Collection say
「104 職缺資料已過期，請重新匯入。」 Mounted expiry uses the same deadline, with
a focus recheck for background tabs. Corrupt caches likewise discard job content,
retain explicit REAL state and request re-import. There is no partial job restore,
fabricated result or silent Demo fallback. An explicit prior Demo selection stays
Demo. A fresh tab without a saved selection follows the existing default contract.

Explicit source changes are saved separately from preferences. Switching to Demo
does not apply REAL jobs/actions to fixtures. Starting a new valid REAL search
invalidates the old job set; the frozen search/Connector action still requires
the user. Session reset clears only this transient cache alongside existing local
reset behavior; it does not delete permanent rows.

Existing read-only Connector availability checks remain on REAL Board mount.
Session restore does not invoke getLatest, extraction/import or external navigation.
A failed restored matching run shows the existing error style and can retry
matching the same normalized cache without re-import. Stale Board imports after
unmount, new search or confirmed-profile change cannot overwrite the new session.

## Changes and Development Verification

Production files modified: src/App.tsx, src/pages/BoardPage.tsx,
src/pages/CollectionPage.tsx. Changes concern session ownership, metadata handoff,
display/error input and obsolete import-response guards, without a UI redesign.
Production files added: src/services/real104Session.ts,
src/hooks/useReal104Session.ts.
Tests added: tests/real104Session.test.ts, tests/real104SessionRegression.test.tsx.
Documentation: CONTEXT.md, a follow-up pointer in the existing action guide,
and this root-cause/fix record. Pre-existing tests/configs are unchanged.

Focused tests: **17 files, 248/248 PASS**: 25 storage/validation tests, 20 component
session/import regressions, and 203 existing action/preference/resume/Auth/104/
Matching tests. The regression harness runs real component effects and the
existing matching function with synthetic fixtures and deterministic timers;
it uses no browser final acceptance or live DB mutations.

```powershell
npx.cmd vitest run tests/real104Session.test.ts tests/real104SessionRegression.test.tsx tests/jobActionRepository.test.ts tests/jobActionPersistence.test.ts tests/jobActionApp.test.tsx tests/jobPreferenceRepository.test.ts tests/jobPreferencePersistence.test.ts tests/jobPreferenceApp.test.tsx tests/confirmedResumeRepository.test.ts tests/anonymousAuthReuse.test.ts tests/confirmedResumePersistence.test.ts tests/confirmedResumeApp.test.tsx tests/manualAcceptanceFlow.test.tsx tests/resumeReviewHardening.test.tsx tests/real104MatchingFlow.test.tsx tests/job104Integration.test.ts tests/matchingEngine.test.ts
npm.cmd run typecheck
npm.cmd run build
```

TypeScript: PASS. Build: PASS, with the existing non-blocking >500 kB chunk-size
warning; no unrelated bundle/config work. No broad parser/all-tests suite was run.
No debug logging was added. The minimal reproduction remains as regression tests.

Before/after SHA-256 comparison excludes generated/dependency directories
node_modules/dist/.git/.vitest/.vite. Frozen Review, confirmed-resume persistence,
Job Preferences persistence, Auth/Supabase client, action persistence, Matching,
Connector/extraction/normalization, URL functions, JobCard, fixtures, pre-existing
tests, configs, scripts, Supabase/migrations and previous freeze records are unchanged.

## Current User Manual Acceptance Checklist

Open [JobQuest at the unchanged approved origin](http://localhost:5173) in the same
browser profile and tab. Keep the dev server running. Wait for confirmed resume,
preferences and saved actions to finish restoring. Explicitly select REAL 104 and
import a fresh capture using the existing search/capture/import flow. Record each
job's original 104 ID so similarly named jobs are not confused.

1. **Case A - Saved card:** favorite job A; wait for 職缺操作已保存至雲端, then open
   收藏任務. A's title/company/card and canonical link must appear, not just count 1.
2. **Case B - F5 session:** while REAL is selected, F5 in this same tab before
   capturedAt reaches the accepted 30-minute deadline. After restore/matching,
   REAL remains selected and imported jobs appear without manually re-importing.
   No 104 page should open automatically.
3. **Case C - Action join:** use distinct A/B/C jobs for favorite/applied/rejected;
   wait for saved status before F5. After restore, favorite/history cards and
   expanded progress buttons retain the correct flags for their exact job IDs.
   A view-only job should appear in history; opening an already applied/rejected
   detail must preserve progress. Switch to Demo and verify no REAL flags/cards mix.
4. **Case D - Matching:** restored cards still show scores/grades/skills and the
   normal ranking from the saved confirmed profile. Neither action flags nor the
   cache introduces different scoring. The resume and search preferences still
   restore through their existing flows.
5. **Case E - Original link:** 查看職缺 on A/B/C opens each exact original
   `https://www.104.com.tw/job/{jobId}` page; verify the ID in the address.
6. **Case F - Expiry:** leave this same tab/session open until more than 30 minutes
   after its original capturedAt (not importedAt). Return/focus or F5: REAL stays
   selected, stale cards are absent, and the explicit expiry/re-import message
   appears on Board and saved/history pages. No Demo jobs appear automatically.
   A fresh explicit capture/import should restore valid REAL cards and rejoin flags.

Use the same tab: closing it intentionally ends sessionStorage. Saved actions for
uncached jobs remain in Supabase; only the latest valid imported job set supplies
metadata here. Cases A-F are pending USER_MANUAL_BROWSER_TEST; Codex does not mark
them PASS. Await those observations before any freeze.

## JOBQUEST REAL 104 SESSION RESTORE

| Contract | Result |
| --- | --- |
| Root cause confirmed | YES |
| Saved-action empty-page root cause | No shared job metadata; REAL Collection selected an empty list |
| F5 REAL -> DEMO root cause | Component-only mode default and Board job state |
| Same underlying cause | YES |
| Storage used | Browser sessionStorage for transient public session; permanent user data remains existing Supabase |
| Supabase schema changed | NO |
| 104 Connector changed | NO |
| Normalization changed | NO |
| Matching changed | NO |
| Resume changed | NO |
| Job Preferences changed | NO |
| User Job Actions persistence changed | NO |
| OpenRouter called | NO |
| Focused tests | 248/248 PASS |
| TypeScript | PASS |
| Build | PASS |
| Manual acceptance by Codex | NO |
| Final status | READY_FOR_USER_MANUAL_TEST |

Project status remains ACTIVE_WITH_AI_RUNTIME_PENDING. STOP; no new RP, AI work,
cloud mutation, unrelated cleanup or automatic freeze.
