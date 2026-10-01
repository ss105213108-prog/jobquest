# Resume Parsing Context

## Current Mainline (2026-09-29)

The user explicitly reopened local-only development as JobQuest Manual Acceptance
Track, without a new RP number. Work Item 1 was reported Manual PASS by the user.
Work Item 2 cases A/B/C/D were also reported PASS by the user in browser tests.
RESUME_REVIEW_MANUAL_ACCEPTANCE = PASS; acceptance source is
USER_MANUAL_BROWSER_TEST, not Codex automated acceptance.
The manual core flow is MANUAL PASS / FROZEN_BY_MANUAL_ACCEPTANCE.
Project status: ACTIVE_WITH_AI_RUNTIME_PENDING.
See [the Work Item 1 guide](docs/jobquest-manual-acceptance.md) and
[the authoritative review freeze record](docs/jobquest-resume-review-hardening.md#manual-acceptance-and-freeze).
The current official resume entry now uses 建立我的履歷 → an empty manual
ResumeProfile → the existing Review → explicit confirmation and existing persistence.
Existing confirmed profiles use 編輯我的履歷 through the same Review.
The PDF/Mock entry was removed only from the official App/Profile flow; the Mock
adapter, its dev path/tests, and AI contracts/seams remain preserved.
The user reported entry acceptance A/B/C PASS and paused D–H for editor usability;
the entry cleanup is not yet frozen. The subsequent approved Editor UX implementation
uses shared scoped typography (18px values) and one optional manual education input.
Unchanged structured education stays intact; explicit replacement stores opaque text
using the approved compatibility mapping, with a visible consequence notice.
Editor UX is READY_FOR_USER_MANUAL_TEST; Codex performed automated isolated style
checks, not final browser acceptance. Existing D–H remain PAUSED until user review.
See [Editor UX implementation and A–J checks](docs/jobquest-resume-editor-ux-implementation.md).
The earlier cleanup changed only entry orchestration and approved source-copy context,
not frozen Review editing/validation/confirmation or persistence/matching behavior.
See [the implementation and A–H manual checks](docs/jobquest-manual-resume-entry.md).
The earlier mainline used metadata-only mockResumeExtraction(file). Work Item 3 was
explicitly authorized to reconnect the existing 104 job input, not change frozen
resume/confirmation/scoring behavior. The user subsequently reported
REAL_104_MANUAL_ACCEPTANCE = PASS, with source USER_MANUAL_BROWSER_TEST.
Real 104 integration is now FROZEN_BY_MANUAL_ACCEPTANCE; Codex performed no
browser acceptance. See [the authoritative Real 104 freeze record](docs/jobquest-real-104-manual-integration.md#user-manual-acceptance-and-freeze).
Job source selection begins explicitly: DEMO_LOCAL uses existing local fixtures;
REAL_104 uses only validated existing Connector captures, without automatic fallback
or mixing. Switching modes remounts the Board so previous jobs cannot leak across.
The separately authorized session-restore fix below preserves an explicit working
selection and valid normalized job snapshot across same-tab F5.
Work Item 4 continuation explicitly authorizes existing anonymous Auth and confirmed
ResumeProfile persistence. The App now reuses useAuth/authService and the existing
resumeRepository against JobQuest neqwkiruqfevlchiajor. Auth-ready initialization
restores a saved confirmed profile; explicit review confirmation saves the current
edited snapshot. Drafts remain memory-only. Job actions were memory-only at that
checkpoint; the separately authorized Work Item 6 integration is recorded below.
Certifications round-trip through existing parsed_data JSON; no schema/RLS changes.
No OpenRouter or PDF parsing is called. The user subsequently reported Work Item 4
cases A/B/C/D/E PASS, with source USER_MANUAL_BROWSER_TEST.
CONFIRMED_RESUME_PERSISTENCE_MANUAL_ACCEPTANCE = PASS.
Confirmed Resume Persistence is now FROZEN_BY_MANUAL_ACCEPTANCE; Codex did not
perform or repeat browser acceptance.
See [the authoritative persistence freeze record](docs/jobquest-confirmed-resume-persistence.md#user-manual-acceptance-and-freeze).
Only the user performs browser acceptance; Codex checks units, TypeScript and build.
Work Item 5 explicitly authorizes Job Preferences persistence only. Investigation
verified existing public.job_preferences schema, user_id ownership and owner RLS
metadata against the same JobQuest project; no user rows or credentials were read.
App preference callbacks now reuse preferenceService/preferenceRepository with
the existing SearchPreference fields source, keyword, location and sortBy. Auth-ready
restore populates existing state; no row preserves existing defaults without a write.
Only existing explicit search-submit/quick-search preference callbacks save, not
unsubmitted SearchPanel input. No migration, schema/RLS change or second model.
Initial preference restore completes before Board initialization; restored values
never select REAL_104 mode, import jobs or open an external search. Existing REAL 104
actions remain user-triggered. Failures preserve local filters and offer safe retry;
late restores and previous-owner completions cannot overwrite newer state.
The user subsequently reported Work Item 5 cases A/B/C/D PASS, with source
USER_MANUAL_BROWSER_TEST.
JOB_PREFERENCES_PERSISTENCE_MANUAL_ACCEPTANCE = PASS.
Job Preferences Persistence is now FROZEN_BY_MANUAL_ACCEPTANCE. Acceptance was
performed by USER; Codex did not perform or repeat browser acceptance.
See [the authoritative preferences freeze record](docs/jobquest-job-preferences-persistence.md#user-manual-acceptance-and-freeze).
Upload offers complete and incomplete mock drafts, both returning ResumeProfile
without mock-specific fields. Missing optional data remains blank. Review keeps
an independent editable DRAFT and only explicit confirmation snapshots current
edits into the confirmed state used by matching. No new required fields were added.

The frozen boundary covers review editing, missing-data handling, all six domain
areas plus project skills, confirmation/snapshot, the confirmed-profile handoff
and Quest Board consumption. Matching must never consume raw AI/Mock or
unconfirmed extraction data. Extraction uncertainty stays empty/[]; optional
empty fields do not automatically block confirmation.
Modify a frozen area only when a reproducible production bug exists, evidence
implicates that area, AND a dedicated Work Item explicitly authorizes modification.
No incidental refactors. The Real 104 freeze additionally locks Connector capture/
bridge, existing normalization and canonical identity, confirmed-profile matching
integration, Real/Demo separation, Quest Board consumption and original 104 links.
Matching Engine is VERIFIED THROUGH MANUAL PRODUCT FLOW and UNCHANGED;
Quest Board is VERIFIED WITH REAL 104 DATA, based on the user's report.
The persistence freeze additionally locks existing anonymous Auth initialization,
valid-session reuse, signInAnonymously only when a session is absent, explicit
confirmed-profile save trigger, resume_profiles upsert, authenticated restore,
certifications serialization/deserialization, restore precedence, failure retaining
the local confirmed state, and restored-profile handoff to Matching. Only CONFIRMED
ResumeProfile may persist; raw Mock/AI extraction, unconfirmed drafts and temporary
editing state must never auto-persist. Existing public.resume_profiles remains
canonical, with no second table, schema/RLS changes or new Email/OAuth/login UI.
The Job Preferences freeze additionally locks existing public.job_preferences
usage, owner/RLS behavior, preference serialization, existing explicit save
trigger, restore, no-row/default behavior, restore into existing application state,
save failure preserving local state, no automatic REAL 104 navigation/import,
and the preference handoff to the existing search UI. Preferences may persist
user-selected search/career fields and populate existing UI on restore. Restore
must never automatically switch to REAL 104, open 104, trigger Connector, import
jobs or start Matching. External/job-source actions remain user-triggered.
The same reproducible-bug, module-evidence and dedicated-authorization rule applies;
no incidental refactor is allowed.

Current primary unresolved seam: REAL_PDF -> AI_EXTRACTION -> EXISTING_RESUME_REVIEW.
This is the primary remaining product gap; the downstream Review/confirmation and
Real 104 integration, Confirmed Resume Persistence and Job Preferences Persistence
flows are USER MANUAL PASS / FROZEN.
Real AI PDF extraction is BLOCKED / NOT YET VERIFIED because the current
course-shared OpenRouter inference path cannot currently be relied upon.
This is an external runtime limitation, not a failed PDF/AI product design.
Future callAiResumeExtraction(file) must satisfy the existing ResumeProfile /
extraction contract and feed the frozen review flow; do not create a second model
or redesign downstream. Existing 104 connector/integration work is preserved;
Real Resume + Real 104 end-to-end acceptance remains pending real AI extraction.
Mock-confirmed Resume + Real 104 acceptance is USER MANUAL PASS / FROZEN.
This does not verify real AI PDF extraction. Use http://localhost:5173, the unchanged Connector's
only approved app origin; current search support remains 台中市 plus a nonempty
keyword. Connector/normalizer, frozen Review/confirmation and scoring source files
remain unchanged. Do not broaden origin/location permissions or automate acceptance.
Next approved non-AI Work Item: USER_JOB_ACTIONS_PERSISTENCE_AND_RESTORE.
Work Item 5 is USER MANUAL PASS / FROZEN; previous freeze evidence remains unchanged.
The 2026-09-29 preferences freeze updates documentation only: production, tests,
config, schema, RLS, Auth, Resume persistence, Matching and 104 remain unchanged.
No tests or browser acceptance were rerun, and OpenRouter was not called.
User Job Actions implementation remains out of scope for this freeze work item.
AI continues to WAIT_FOR_VERIFIED_WORKING_AI_CREDENTIAL.
No next Work Item starts automatically.

The user separately authorized Work Item 6: USER_JOB_ACTIONS_PERSISTENCE_AND_RESTORE.
Investigation verified existing public.user_job_actions metadata and owner RLS in
the same JobQuest project. Schema/RLS are compatible: (user_id, job_key) primary
key, source, favorite/viewed/applied/rejected booleans and existing timestamps;
no full job record or new table is required. Anonymous Auth and Supabase client
remain unchanged. App now connects the existing useJobActions / jobActionService /
jobActionRepository through an isolated optimistic persistence controller.
REAL 104 keeps source='104', Job.id=sourceKey='104:{jobId}'; DEMO_LOCAL keeps
existing fixture IDs such as 104-01. Only the active source/mode's action map is
passed to the unchanged Board/Collection; identities are never inferred from
title, company, order or score. Auth-ready restore is read-only and owner-filtered;
legacy unowned localStorage is not automatically imported. Explicit actions update
local UI immediately and upsert only identity plus the four status booleans.
Current action semantics remain unchanged: favorite toggles independently, viewed
is additive, and applied/rejected are mutually exclusive without erasing viewed.
Writes are ordered; failed jobs retain local markers and retry snapshots. Late
restores preserve edited keys while restoring untouched jobs. Owner changes,
session-only reset and unmount invalidate stale work; saved rows are never deleted
by reset. No Connector/import/navigation/matching is triggered by action restore.
Work Item 6 focused development verification: 15 files, 203/203 tests PASS
(52 new action tests and 151 existing regression tests); TypeScript PASS, build PASS.
Previously frozen source modules, pre-existing tests, config and schema/RLS files
remain unchanged; only App action glue and existing action hook/service/repository
were modified, plus the two new action support modules and three new test files.
Codex did not perform browser acceptance or live owner-session action writes.
Status: READY_FOR_USER_MANUAL_TEST, not USER MANUAL PASS or frozen.
See [the action persistence guide and A-F checklist](docs/jobquest-user-job-actions-persistence.md).
The existing JobCard has no independent viewed badge; Case B includes a read-only
browser Network restore-response check rather than redesigning the frozen UI.
AI remains BLOCKED / NOT YET VERIFIED; project status remains
ACTIVE_WITH_AI_RUNTIME_PENDING. Await USER_MANUAL_BROWSER_TEST before freeze.

The user's subsequent Work Item 6 manual test reported two failures: a saved
REAL favorite count without a card, and F5 returning REAL to Demo without jobs.
The separately authorized REAL 104 SESSION RESTORE bug item reproduced both in
focused tests before production changes. Root cause: App mode and Board jobs were
transient component state, while REAL Collection explicitly used an empty list.
Supabase actions correctly have no full job-content contract; stable identity
and the accepted Connector TTL were not the missing boundary.
App now owns a shared REAL working session through useReal104Session /
real104Session. sessionStorage holds only the explicit mode and latest public
normalized Job set (existing maximum 10), search keyword/location, capturedAt and
importedAt. Canonical Job.id/source/url remain unchanged; raw Connector envelopes,
HTML, credentials, account data, resume data and match scores are not stored.
Within the unchanged JOB104_PAYLOAD_TTL_MS (30 minutes from capturedAt), same-tab
F5 restores the explicit REAL mode and jobs, recomputes through existing Matching
with the restored Confirmed ResumeProfile, and joins unchanged Supabase actions
by canonical Job.id. Board, favorites and history share that same job metadata.
Existing read-only Connector status checks remain; restore never invokes getLatest,
extracts/imports jobs or opens 104. No valid cache means explicit re-import state;
expired/corrupt REAL cache drops jobs and retains REAL with a clear message, never
silently falling back to Demo. Mounted TTL expiry and focus checks also drop stale
results. Explicit Demo selection, session reset and new-search invalidation remain
separate from permanent Supabase data. Session storage is scoped to the tab;
closing it ends this transient cache, not the saved action/resume/preferences data.
Only App and Board/Collection metadata handoff/rendering changed, plus two new
session modules and two new test files. Frozen Resume Review/persistence, preference
persistence, Auth/client, action persistence, Matching, Connector extraction/client,
normalization, canonical link functions, JobCard and configs/schema remain unchanged.
Final development verification: 17 files, 248/248 tests PASS (45 new session tests
and 203 existing regression tests); TypeScript PASS, build PASS with the existing
non-blocking >500 kB chunk-size warning. Codex performed no final browser acceptance.
Status: READY_FOR_USER_MANUAL_TEST. Neither this fix nor Work Item 6 is newly frozen.
See [the root-cause record and current A-F checklist](docs/jobquest-real-104-session-restore.md).
Its valid-cache F5 behavior supersedes the earlier re-import-only checklist.
Project status remains ACTIVE_WITH_AI_RUNTIME_PENDING; AI remains pending.

The user subsequently reported a distinct GHOST / ORPHAN SAVED JOB bug: permanent
REAL favorite actions outlive the latest transient job metadata, producing badge=2
with only one visible card. The dedicated 2026-09-29 investigation reproduced
that exact symptom and the no-metadata badge=1/cards=0 variant twice through actual
repository mapping and App/Collection rendering with synthetic persisted rows.
Adding metadata for the exact same canonical ID resolves the mismatch in a control
probe; fresh TTL and correct identity do not prevent it while metadata is absent.
Read-only live catalog inspection of public.user_job_actions in neqwkiruqfevlchiajor
confirmed no JSON/metadata/snapshot field: EXISTING_SCHEMA_SUPPORTS_JOB_SNAPSHOT=NO.
Per the user's explicit schema STOP rule, this Ticket is BLOCKED under
SCHEMA_GAP_REQUIRES_SEPARATE_MIGRATION_DESIGN. There is no production fix, count-only
patch, migration, schema/RLS change, orphan deletion, AI call or browser acceptance.
The proposed minimum is one nullable job_snapshot jsonb column on the existing
table, subject to a separate migration design; it has not been added or executed.
Only investigation documentation changed. Temporary diagnosis tests were removed
from the project; required fixed-behavior regressions and current TypeScript/build
verification are NOT VERIFIED/NOT RUN. Previous checkpoint passes do not prove
this newly reported bug fixed. See [the exact blocker and investigation report](docs/jobquest-ghost-saved-job-investigation.md).
Do not proceed to implementation, manual acceptance or freeze across this gate.

The separately authorized JOBQUEST DATABASE DESIGN item is now DESIGN COMPLETE,
awaiting explicit approval. Read-only live/local inspection confirmed a single
nullable job_snapshot jsonb column with implicit SQL NULL is sufficient for the
schema evolution, without new table/index/RLS/policy/grant changes. The proposed
closed V1 uses schemaVersion, sourceKey (binding check only), title, company,
location, salary, experience, description (existing normalized public snippet,
including empty string), and capturedAt. Row owner/source/job_key remain identity
authority; URL and other derived normalized fields come from the unchanged
normalizer/canonical helper, not arbitrary JSON. Description is needed to preserve
the existing Matching inputs; no scores, raw/private/AI data or extra extraction.
Existing NULL rows stay valid and stored; future resolver/count must use current
valid session > validated persisted snapshot > unresolved action. Saved interacted
metadata is distinct from the unchanged 30-minute working-session TTL.
Recommended next action: APPROVE_MINIMAL_MIGRATION_IMPLEMENTATION. This recommendation
is not approval. No migration file/execution, production/test changes, backfill,
cloud writes, AI or browser acceptance occurred. See [the exact migration and V1 design](docs/jobquest-job-snapshot-migration-design.md).
The ghost bug is still unfixed. STOP; await explicit implementation authorization.

Work Item 7 subsequently explicitly authorized DATABASE FOUNDATION ONLY. Pre-check
against the approved JobQuest project neqwkiruqfevlchiajor passed: job_snapshot
absent, existing columns/identity/constraints/RLS/policies/grants/index/trigger
unchanged from design. Exactly one migration was created through migration new,
applied via Supabase apply_migration, and aligned to the actual remote history
version: 20260929041121_add_job_snapshot_to_user_job_actions.sql. It adds only
public.user_job_actions.job_snapshot jsonb NULL, with implicit SQL NULL default.
Post-migration catalog checks PASS: only the expected column added, 7/7 existing
rows preserved, all 7 snapshots NULL, original row-field/identity aggregate
fingerprints equal, constraints/index/trigger/RLS/policies/ACL/grants unchanged.
No personal row contents were exposed, no snapshot data/backfill/DELETE/UPDATE
performed, no other project or existing migration touched. The static Database
type used by createClient<Database> was mechanically synchronized in only the
user_job_actions Row/Insert/Update declarations; repository behavior is unchanged.
TypeScript PASS and build PASS, with the existing non-blocking chunk-size warning.
No broad suites/browser acceptance, UI/count fix, action persistence changes,
sessionStorage/TTL changes, frozen-module edits or AI calls occurred.
Status: DATABASE_FOUNDATION_READY. Ghost bug is NOT FIXED; App does not yet write
or restore snapshot metadata. Recommended next action is
IMPLEMENT_JOB_SNAPSHOT_WRITE_READ_AND_GHOST_FIX, only with a new explicit Work Item.
See [the migration foundation verification record](docs/jobquest-job-snapshot-foundation.md).
STOP after this foundation; no automatic repository implementation or UI changes.

Work Item 8 subsequently explicitly authorized job_snapshot write/read and the
ghost saved-job fix. The existing nullable column in neqwkiruqfevlchiajor was
rechecked read-only and reused; no migration/schema/RLS/grant changes occurred.
The closed nine-field V1 adapter projects only existing normalized public facts,
validates version/shape/canonical time and row-sourceKey binding, and reconstructs
the existing Job through unchanged normalizer/canonical helpers. No scores, raw
HTML/private data or AI data persist. Only explicit REAL favorite/viewed/applied/
rejected interactions attach metadata to the same existing action upsert; Demo
flags retain their original isolated fixture keys. Import/restore do not bulk-save.
Current valid session jobs take precedence over validated persisted metadata;
unresolved NULL/corrupt legacy actions remain stored, with no fake card or count.
Collection/history reuse existing cards. The favorite badge counts renderable
resolved favorite cards. Missing interacted jobs are recomputed through unchanged
Matching with the current Confirmed Resume; current session matches are reused.
Owner/profile/input generations, queued versions and independent retry snapshots
protect against late work and preserve local metadata/actions on write failure.
The working sessionStorage cache and 30m TTL are unchanged; saved interacted
snapshots do not expire with that cache. Fresh tabs still begin with the existing
Demo default; selecting REAL explicitly without import exposes saved REAL cards.
Development checks: 18 relevant test files, 283/283 PASS (59 new, 224 existing),
TypeScript PASS, build PASS with the existing non-blocking chunk-size warning.
Frozen source modules, original tests/config/types/migrations and Board/cards/styles
were verified SHA-256 unchanged. Synthetic transport tests are not live DB/RLS
acceptance. Codex made no live action data mutations and no browser final acceptance.
Status: READY_FOR_USER_MANUAL_TEST; USER MANUAL ACCEPTANCE and freeze NOT VERIFIED.
See [the implementation report and A-H user checklist](docs/jobquest-job-snapshot-ghost-fix.md).
STOP; await user manual results. Do not start another Work Item automatically.

The [real AI runtime freeze checkpoint](docs/jobquest-final-runtime-freeze.md) is
preserved. Real AI remains frozen under
EXTERNAL_AI_RUNTIME_UNAVAILABLE_WITH_CURRENT_COURSE_SHARED_KEY. Its resume condition
remains USER_OWNED_OR_VERIFIED_WORKING_AI_API_CREDENTIAL_AVAILABLE plus explicit
authorization. This condition does not block the newly authorized local mock work.
Do not retry or diagnose OpenRouter/PDF/model/provider issues, change deterministic
parsers, modify the 104 connector, work on 1111 or start another RP automatically.

This vocabulary describes the proposed resume-parsing decision boundary. It does not claim that the current application has implemented it.

## Language

**Deterministic result**:
A resume interpretation supported by approved, reproducible parser evidence, without an external AI inference step. A resolved page grouping alone is not a resolved document.

**Insufficient evidence**:
A valid, processable resume whose available deterministic evidence cannot safely select a required interpretation. It is not a parser defect.

**Hard failure**:
An invalid input, broken contract, corrupt extraction, or unexpected parser failure that must not be concealed by another parser path.

**Fallback-eligible document**:
A valid resume with an explicitly classified deterministic limitation for which a separately enabled and consented fallback may be considered. Eligibility does not mean that fallback ran or succeeded.

**Parsing-critical page**:
A page that may contain substantive resume information needed for the document-level result. An uncertain page remains critical until there is evidence to exclude it.

**Extraction candidate**:
Structured resume fields proposed by either parser path for human review, not authoritative resume truth.

**Document routing outcome**:
The single whole-resume classification produced after a deterministic attempt: success, fallback eligibility, or hard failure. It does not describe whether a later fallback ran.

**Candidate provenance**:
The parser path that produced an extraction candidate. It belongs to the candidate wrapper, not the resume's domain fields.

**Parser cause**:
A format-specific, observed reason that a parsing stage could not complete or produced limited evidence. It records what happened before deciding the document's routing meaning.

**Scoped validity evidence**:
A supported claim about file, document, page, or content validity, with an explicit valid, invalid, or unknown state. Validity at one scope does not imply validity at another.

**Legacy compatibility projection**:
An existing parser result or error exposed to current consumers from a preserved cause. Its coarse public error code is not evidence from which the original cause can be recovered.

**VisualGroup**:
An upstream, page-local grouping of PDF text runs whose membership is authoritative before spatial analysis. Spatial structure and Reading Order do not split or merge it.

**Observable spatial fact**:
An independently checkable geometric relationship among resolved VisualGroups within a stated page context. It is neither a Region-ownership claim nor a reading-order decision.

**Spatial structure graph**:
A page-level account of the resolved VisualGroups and supported observable spatial facts. Missing relationships remain unknown; the graph does not require a unique Region partition.

**V1 spatial fact formation policy (production foundation, not parser-wired)**:
After exact same-page Spatial admission and complete node grounding, form only strict local envelope `X_DISJOINT`, strict local envelope `X_OVERLAP`, and strict envelope `Y_ABOVE`. Horizontal facts use the exact positive-height intersection of the two group envelopes as their local scope; vertical facts use the smallest hull of the separated envelopes. Touching boundaries produce none of these facts. Current evidence does not authorize formation of `BAND_OCCUPANCY` or `X_SPANS`. Zero facts with complete grounded nodes remain a valid spatial result, and every omitted relation remains `UNKNOWN`.

**Spatial track**:
An observable horizontal occupancy pattern within a stated vertical context, not a group owner, semantic sidebar, or page-global Column.

**Region**:
An optional derived grouping of VisualGroups only when its ownership is independently observable. It is not a resume section or a prerequisite for Reading Order.

**Reading Order**:
The page-local ordering of resolved VisualGroups for Serialization, not an order encoded by the spatial structure graph. Conservative V1 resolves exactly one validly admitted authoritative group as `[G1]`; multiple groups without separately approved precedence return `INSUFFICIENT_EVIDENCE` with no authoritative sequence. Invalid evidence or internal failure is `FAILED`. Only `RESOLVED` permits authoritative Serialization. Geometry-only precedence research is frozen for V1; any multi-group extension needs new approved evidence.

**Reading Order insufficiency cause (architecture only)**:
`PDF_READING_ORDER_INSUFFICIENT` preserves normal, validly reached, page-scoped evidence insufficiency in the production cause foundation; the current parser does not emit it. Confirmed-valid file, document, page, and content evidence can classify it as whole-document `FALLBACK_ELIGIBLE / INSUFFICIENT_STRUCTURE` when no hard failure exists. Unknown validity cannot grant fallback; internal failure is hard. No partial profile or page-level AI merge is allowed.

**PDF Serialization V1 (production foundation, not parser-wired)**:
After a runtime-valid resolved page Reading Order, serialize a sole authoritative group only when it has one valid canonical text run. Preserve that run's text exactly as an ordered unit in a `SerializedPage`; a valid multi-run group without internal sequence/separator evidence yields Serialization `INSUFFICIENT_EVIDENCE`, while broken references or runtime contracts yield `FAILED`. No inferred whitespace, line semantics, geometry ordering, or section detection. `SerializedDocument` retains validated canonical PDF page order and explicit page boundaries. The production cause foundation recognizes `PDF_SERIALIZATION_INSUFFICIENT` and `PDF_SERIALIZATION_FAILED`; the current parser does not emit them. The guarded mechanical downstream adapter is a separate foundation; no parser integration exists.

**PDF structured domain-input boundary (production foundation, not parser-wired)**:
`ResumeSourceDocument` preserves exact unit text, ordered pages and page/group/run provenance after existing Serialization admission. The mechanical adapter adds no evidence state, cause, normalization, section detection or fallback trigger. Page and unit boundaries are structure, not inserted text or guaranteed lines. DOCX and the legacy PDF runtime remain unchanged until a separate authoritative integration.

**Analysis fragment (selected architecture, not implemented)**:
A source-referenced text slice in an ordered structured analysis-segment stream, with distinct source-authored break, unit-transition and page-transition information. Local comparison views do not alter source payload. A source unit is not a line; unknown cross-unit lexical context remains unknown. Semantic section state can continue across pages without joining their text.

**Structured analyzer entry (selected architecture, not implemented)**:
A future PDF-only entry consuming structured source and returning the existing resume profile shape. It coexists with the unchanged legacy DOCX entry until an explicit authoritative PDF switch, never a parallel production shadow. Section bodies are source references, not joined strings; normalization, section and domain input migration require separate contracts. Empty domain fields and unfinished migration are not fallback causes.
