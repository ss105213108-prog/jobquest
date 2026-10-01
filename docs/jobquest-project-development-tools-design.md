# JOBQUEST PROJECT DEVELOPMENT TOOLS DESIGN

2026-09-29 · INVESTIGATION → DESIGN ONLY · STOP

Recommended next action: **APPROVE_PROJECT_TOOLS_CONTRACT_IMPLEMENTATION**,
limited to the additive application project field, explicit manual editor,
repository restore mapping and structured display described here. This is a
recommendation, not implementation authorization. AI wire/runtime changes remain
a separate future work item.

The earlier `BLOCKED_STRUCTURED_DATA_GAP` is resolved at the **design level** by
an explicit user-owned field, not by parsing the existing description. No tools
feature exists in production yet. Editor UX A–H remain user-reported PASS;
I–J remain PAUSED. Do not freeze the editor or continue that acceptance here.

## Observe and inspect the current contract

`src/types/index.ts:61–65` currently defines:

```ts
interface ResumeProject {
  name: string
  description?: string
  skills: string[]
}
```

ResumeProfile holds `projects: ResumeProject[]`; Review clones that same shape,
not a different draft project model. `ResumeReview.tsx:92–106` edits project
name/description and project skills via EditableTags, adds `{name:'',skills:[]}`,
and removes entries. It has no tools control. `utils/resumeReview.ts` requires
every project name but does not require skills or description; confirmation
clones the current full draft. No new required resume field is needed.

Confirmed display `ProfilePage.tsx:16` passes each project to
`formatResumeProject`, which joins name, skills and description using `｜`.
It neither emits tool labels nor has an authoritative tool list. The previous
design documents the user's dense example without claiming to have inspected
the private saved field values.

MockResume, Mock extraction, analyzer/parser producers and relevant existing
fixtures use the same three-field shape. They must remain valid without updates
that invent example tools. `resumeDocumentOutcome.validateCandidateEnvelope`
currently checks project name/skills shape, not tools; it does not strip a cloned
field. No PDF/parser integration is necessary for a manual-only field extension.

## Persistence investigation

**PROJECTS_STORAGE_TYPE = public.resume_profiles.projects JSONB**, existing
column, not a normalized project table or individual project-tool columns.
Evidence: migration `20260919114039_create_job_quest_user_data.sql:8` and
`src/types/database.ts:7–9` (`projects: Json`). Checked-in migrations contain
no project-object key constraint or SQL consumer requiring only three keys.

`resumeRepository.upsert` writes `profile.projects` directly as JSON. Its existing
serializer can already carry an extra array property, with no new column or
request method. However, `parseProjects` at lines 35–46 reconstructs only name,
skills and description, so it currently discards tools on restore. A temporary
injected-repository probe verified this exact gap: write payload retains tools,
restored project loses them while description remains intact.

**DATABASE_MIGRATION_REQUIRED = NO** under the checked-in/current application
storage contract. **PERSISTENCE_MAPPING_CHANGE_REQUIRED = YES**, specifically
the project deserializer's allowlisted field projection. A serializer-only fix
would fail F5 restore. No PostgreSQL column, JSON SQL schema, RLS/grant, generated
database type or migration change is needed. No remote schema/data query was
performed; deployment-wide schema drift is NOT VERIFIED. Stop and report any
contradicting deployed JSON constraint if discovered during later implementation.

Auth owner initialization → existing persistence controller → repository
getCurrent → existing local confirmed snapshot → App/Profile/Review is the F5
path. The controller's save/restore order, cloning, ownership/epoch guards,
failure/retry behavior and statuses need no changes. Existing upsert conflict
key/user ownership stays unchanged. No autosave or bulk legacy backfill.

## Backward-compatible field design

Proposed **application** contract:

```ts
interface ResumeProject {
  name: string
  skills: string[]
  tools?: string[]
  description?: string
}
```

`tools?: string[]` is intentionally optional at the compatibility boundary.
Making it required everywhere immediately would invalidate old typed fixtures,
saved projects and AI V1 producer outputs. The conceptual new project's type is
an explicit array; new manual project entries should initialize `tools: []`.

Default/missing behavior: `project.tools ?? []` is the empty **view/edit value**.
Absence does not trigger a cloud write or materialize a field in an untouched
legacy project. Preserve omission during restore/untouched confirmation; a new
project or an explicit tools edit can save the actual array. Thus both absent
tools and tools:[] are valid, visually empty and compatible, without altering
old descriptions or unrelated fields. Valid stored arrays round-trip verbatim,
including order/casing; restore must not deduplicate or canonicalize them.

Tools semantics: names explicitly entered by the user for that project. Example
values Visual Studio Code and InfinityFree are examples, never defaults. No
classification, aliases, dictionary lookup, recommendation, description parser
or automatic movement from project/global skills. A user-declared name is not
an inferred classification. Do not reject/reclassify it merely because the same
word can be used as a technology elsewhere.

Reuse existing EditableTags interaction: trim a newly submitted item, reject an
empty submission, apply its existing case-insensitive duplicate-add guard and
allow removal. These are user-input operations, not normalization of restored
values. Empty tools is allowed and never blocks confirmation. Existing required
name/work-title/project-name conditions remain unchanged.

Deserialization design: keep all existing name/skills/description branches.
If tools is absent, omit it; if it is a valid string array, copy it onto the
restored project. Do not manufacture tools from a legacy string project, run
additional legacy parsing or change existing legacy compatibility behavior.
For explicitly present malformed tools (null, scalar or mixed non-string array),
do not silently erase the value or replace it with []; surface a safe existing
restore error and avoid a repair write. Implement a small field guard in the
repository mapping, not a broader parser/schema refactor. The supported old/new
contract remains absent or string[]; malformed future data is not legacy absence.

No tools list is required in `createEmptyResumeDraft`, which starts with no
projects. Adding a project in Review initializes its own independent array.
Two projects must never share arrays or put tools at the resume top level.
Other project editing callbacks already spread existing project objects; tests
must prove they retain tools across name/skill/description edits and cloning.

## Matching dependency and desired behavior

**PROJECT_TECH_MATCHING_DEPENDENCY = YES.**
`matching/scoreCalculator.ts:21` builds projectText from name, description and
skills; detected projectSkills contribute to project evidence score/reasons.
`normalizeResumeSkills` continues to read only global `resume.skills` for its
coverage input. Neither path should acquire the new project tools array.

**PROJECT_TOOLS_MATCHING_DEPENDENCY = NO for the new field.**
Keep current preparation/scoring code byte-for-byte unchanged. Tools must never
be copied into project.skills, global resume.skills, project.description or a
string fed to the matcher. A temporary probe injected tools containing React
and tool names: all existing mock-job match outputs stayed exactly equal to
the same profile with empty tools. This demonstrates current exclusion, not
an implemented new field or user REAL104 acceptance.

Legacy tool-like text already in name/skills/description can continue to affect
existing matching. Do not delete it or claim tools are ignored everywhere.
Only changing the new tools array must leave score, grade, reasons, breakdown,
ordering and missing/matched skills unchanged. If the user independently edits
description, ordinary existing matching effects of that edit are expected.

## Manual editor design

Within each existing project entry, use this order:

1. 專案名稱 — existing name input.
2. 使用技術 — existing skills EditableTags, original values retained.
3. 開發工具 — a separate optional tools EditableTags, empty for legacy projects.
4. 專案說明 — existing description textarea, original text retained exactly.

Retain the same entry container/add/remove structure, confirmation/cancel and
validation. Visible labels can be simple, while aria labels retain a project
index so users and tests can distinguish each project's add/remove controls.
Reuse the current 18px normal-weight input/textarea, 17px label/tag/button and
16px supporting text tokens; no tiny new chip text. No whole-page redesign.

Legacy example: if description contains “開發工具 Visual Studio Code、InfinityFree”,
leave it there. User may add these tools explicitly and optionally edit that
description themselves. Until then, tools stays empty; both texts may appear
after manual tool entry because deduplication across independent fields would
be another prohibited heuristic. Adding/removing tools never edits description.

For the first implementation, expose new manual tool entry under existing
manual-create/confirmed-edit contexts. Keep AI/Mock producer/candidate contract
paths unchanged; do not route an expanded application object into a strict AI
V1 acceptance validator as if it were an unchanged wire candidate. Future AI
correction/handoff for tools is part of the separate extension below.

## Confirmed-profile presentation

Render directly from each structured project, without parsing a formatter result:

- Name stands alone.
- 使用技術 only when skills contains actual text; preserve values/order.
- 開發工具 only when tools contains actual text; preserve values/order.
- 專案說明 only when description contains actual text; retain raw string and
  meaningful line breaks, with safe React text rendering and wrapping.

No empty headings, default examples or inferred “none” statements. A read-only
test such as `.some(value => value.trim().length > 0)` may control heading visibility;
it must not rewrite/filter the stored array. No dense `｜` joining across sections.
Legacy string/name-only entries stay intact. The old formatter can remain for
compatibility; confirmed display no longer needs to use it for this projection.

Use the existing profile project list/container and responsive layout. Current
editor tokens are scoped to `.resume-review`; share their values through a
narrow common token definition for editor/project presentation, or a dedicated
project scope, not a global typography rewrite or undefined-variable reference.
Verify wrapping and contrast in that scope before any future visual PASS claim.

## AI future compatibility

Current AI V1 project schema at
`supabase/functions/_shared/aiResumeExtractionV1.ts:68–70` requires name/skills/
description and disallows additional properties. Its WireProject, DomainFields,
factual leaf enumeration, evidence-pointer validation and mapDomain do not
contain tools. The test-only post-review domain validator in
`tests/helpers/aiResumeExtractionContractHarness.ts` is also strict and lacks tools.
That helper is not a production Review handoff API.

**AI_CONTRACT_CHANGE_REQUIRED = YES for AI to propose project tools.**
**NO AI change is required for the first manual field implementation.** Existing
AI V1 candidates remain valid application inputs with absent tools interpreted
as empty; do not weaken V1 schema/tests or add tools to its existing payload.

Smallest future semantic extension: a separately versioned AI project schema
with `tools: string[]`, empty when no supported tools exist, plus the corresponding
wire/domain map, factual paths `/projects/{i}/tools/{j}`, evidence validation,
request contract and tests. Keep the existing V1 decoder/schema unmodified and
available; explicitly dispatch any approved new version, rather than silently
changing `AI_RESUME_EXTRACTION_V1` while keeping its identifier. Do not select
or enable a new provider/model/runtime as part of this design.

Each AI tool needs source-supported name, project association and tool context,
with excerpt/page reference for its factual leaf. Do not classify a technology
as a tool based only on its name, infer an IDE/host from a framework, copy a
different project's tool or interpret unrelated source text. Unknown is [];
candidate remains REVIEW_REQUIRED until explicit confirmation. Extension tests
must cover unsupported tool facts, association, missing evidence, old V1 inputs
and strict new-version payloads. No PDF/AI work occurs now.

## Frozen boundaries and precise approval scope

**FROZEN_DEPENDENCY_CONFLICT = YES, narrow and explicit:** an additive
ResumeProject application contract and existing repository project-deserializer
mapping must be reopened to retain a newly owned field. They are not changed in
this design turn. Recommended next approval must name these two exceptions.
Without that permission, adding only the editor field would create tools that
disappear after F5 and is unacceptable.

This is not a design contradiction: the necessary exceptions are bounded and
no DB migration or persistence lifecycle/scoring changes are needed. Keep Auth,
save/restore semantics/controller/hook, repository request ownership, schema,
RLS/grants, Matching, Board, 104 Connector/normalization, preferences, actions,
session/TTL and job_snapshot unchanged. AI wire/runtime extension is expressly
excluded from the manual implementation approval. No 40-job import or new RP.

Expected future implementation files:

| File | Exact purpose |
| --- | --- |
| `src/types/index.ts` | optional `ResumeProject.tools?: string[]` only |
| `src/repositories/resumeRepository.ts` | restore valid tools arrays/preserve absence; existing writer already uses full projects JSON |
| `src/components/onboarding/ResumeReview.tsx` | explicit per-project manual tools control and new-entry empty array; preserve other operations |
| `src/pages/ProfilePage.tsx` | direct conditional structured project sections |
| `src/styles.css` | only shared/project-scoped readability tokens and section spacing |
| focused project/Review/repository/persistence/Matching tests | verify compatibility, separate ownership, restore and metadata-only behavior |
| implementation report/CONTEXT | describe authorization, results and pending user acceptance |

Mock/dev fixtures and parser outputs can remain unchanged and omit tools. No
production parser refactor or global validator rewrite is needed for this scope.
If a later implementation finds a runtime guard on an active new-field boundary
that rejects tools, report its exact contract before modifying it; do not reopen
unrelated frozen admission logic. AI files and strict V1 harness stay protected.

## Future test contract

| Case | Required evidence |
| --- | --- |
| 1 Legacy without tools | typed fixture and restored object remain valid; view is []; no backfill or guessed tools |
| 2 New project | independent explicit string[] is editable and confirmed; optional empty list is valid |
| 3 Persistence round-trip | actual repository write/read stubs retain arrays, order/case and all existing fields |
| 4 F5/restore | fresh existing controller restores tools once owner-ready, no regeneration/write; user F5 remains a separate manual gate |
| 5 Skills unchanged | adding/removing tools leaves project/global skills identical |
| 6 Matching invariant | identical complete outputs across the same jobs when only tools differs, including a recognizable technology string in tools |
| 7 Description untouched | typing tools, changing other fields and save/restore preserve raw description/newlines |
| 8 No heuristics | description containing 使用技術/開發工具 remains literal; no tools inferred or labels removed |
| 9 Presentation | name, actual skills/tools/description each have own section and order without inline concatenation |
| 10 Empty tools | absent/[]/no actual text produces no empty 開發工具 heading |
| 11 Two projects | edit/delete/reorder-independent source ownership; no shared arrays or cross-project tool leakage |
| 12 AI compatibility | current V1 fixtures still validate unchanged; new manual tools does not alter V1 requests; future AI extension tested separately |

Also verify unchanged name/work-title/project-name validation, cancel/failure
snapshot isolation, malformed explicit-tools restore failure without silent
repair, and new scoped typography/layout at the existing responsive widths.
Run TypeScript/build plus focused frozen regressions after any future code change.
New feature tests and user browser acceptance are **NOT VERIFIED** today.

## Required report

| Item | Result |
| --- | --- |
| Current Project contract | name:string, skills:string[], description?:string |
| Proposed field | tools |
| Proposed type | tools?: string[] at legacy/application boundary; new manual entries initialize [] |
| Default/missing behavior | treated as [] for view/edit; retain omission in untouched legacy storage, no automatic backfill |
| Database migration required | NO |
| ResumeProfile contract change required | YES, additive nested ResumeProject field only |
| Persistence mapping change required | YES, project restore projection; writer already carries JSON |
| Matching change required | NO |
| AI contract future extension required | YES for AI-produced tools; excluded from first manual implementation |
| Legacy projects remain valid | YES by optional field and no legacy rewrite |
| Automatic legacy parsing required | NO |
| Manual editor design | name → skills → explicit tools → raw description, current readable controls |
| Profile presentation design | name plus only nonempty skills/tools/description sections |
| Frozen dependency conflict | YES, exact application type/restore mapping exception needs next approval |
| Recommended next action | **APPROVE_PROJECT_TOOLS_CONTRACT_IMPLEMENTATION**, narrowly scoped as above |

Investigation verification: two temporary probes plus existing repository,
Review, Matching and pure AI contract tests: **5 files / 184 tests PASS**. These
prove the current restore gap and Matching exclusion; they do not prove a
tools implementation. Probes were archived outside the workspace and removed.
No TypeScript/build rerun was required for the documentation-only deliverable.
SHA-256 comparison against the 891-file baseline verifies all existing files
unchanged, only this design document added. No live DB/AI/runtime/browser actions.

**STOP — design complete; do not continue I–J acceptance.**
