# JOBQUEST PROJECT EXPERIENCE READABILITY DESIGN

2026-09-29 · INVESTIGATION → DESIGN ONLY

Recommended next action: **BLOCKED_STRUCTURED_DATA_GAP**.
Exact blocker: **STRUCTURED_PROJECT_PRESENTATION_DATA_NOT_AVAILABLE** for an
independent development-tools list. Current project data has name, skills and
optional description, but no tools field or authoritative technology/tool split.
No production, CSS, contracts, database or workflow was changed.

## Observe and acceptance status

The user reports a dense project line containing VTUBER電商, 使用技術 and
開發工具. This is sufficient evidence of the reported hierarchy problem.
Resume Editor UX acceptance **A–H PASS / I–J PAUSED** is supplied by the user;
it is not Codex browser acceptance. Project information hierarchy is **NOT
ACCEPTED YET**. Do not freeze Editor UX or resume I–J in this work item.

## Inspect: exact render path

**PROJECT_RENDER_COMPONENT:** `src/pages/ProfilePage.tsx:16`, confirmed profile
專案經驗 section. It maps `resume.projects` to list items and calls
`formatResumeProject(project)`. App's profile page passes the current confirmed
local resume; the persistence controller populates that same state on restore.

**PROJECT_DATA_SOURCE:** `ResumeProfile.projects: ResumeProject[]` in current
confirmed state. Manual Review edits a cloned ResumeProfile, then explicit
confirmation passes its snapshot through existing confirmed persistence. Restore
uses `resumeRepository.getCurrent()` and its project deserializer. These paths
do not establish a separate tools list.

**PROJECT_RENDER_FORMATTER:** `src/utils/resumeFormatting.ts:41–42`:

```ts
return [project.name, project.skills.join(' / '), project.description]
  .filter(Boolean).join('｜')
```

**CURRENT_OUTPUT_CONSTRUCTION:** one string, inserted as React text inside one
`<li>`. Existing string values are not HTML. Browser wrapping changes visual line
breaks but does not provide labels or section hierarchy. Existing newlines in a
description are not given a dedicated white-space preservation rule in this list.

The observed dense display has an exact **C: formatter joining fields** cause.
Its inputs can also contain **B: a preformatted stored string**, depending on the
actual saved values. The formatter's separator/inline output is confirmed; the
precise field distribution of this user's VTUBER example is **NOT VERIFIED**.
No personal resume row or browser state was read, and the complete example does
not occur in the checked source/fixtures. Do not reconstruct fields by reversing
the displayed string: a long name alone and name-plus-description can be ambiguous.

**Editor path:** `src/components/onboarding/ResumeReview.tsx:92–106` already uses
an entry container with separate 專案名稱 input, 專案描述 textarea and
`EditableTags` labelled `專案 N 技術`, bound respectively to name, description
and skills. It does not use `formatResumeProject`. There is no development-tools
input or display section. Thus the confirmed inline display and the editor are
different render paths; a formatter change cannot by itself separate arbitrary
text inside the editor's description or name.

`ResumePanel` does not render project experiences. No second active confirmed
project formatter consumer was found. `parseResumeProjectLine` exists beside
the formatter but has no production caller found; it is not a safe mechanism to
recover categories from this display.

## Inspect: project model and consumers

| Required information | Current exact field | Availability |
| --- | --- | --- |
| Project name | `ResumeProject.name: string` | YES |
| Technology/skill list | `ResumeProject.skills: string[]` | YES, a single undivided skill list |
| Development tools | No `tools`, `developmentTools` or equivalent project field | **NO** |
| Description | `ResumeProject.description?: string` | YES, opaque free text |

Evidence and dependencies:

- `src/types/index.ts:61–65`: the formal project has only these three fields.
  Draft and confirmed profile share this exact model; there is no richer manual
  project type or UI-only tools sidecar.
- Review edits those fields independently and adds `{ name: '', skills: [] }`.
  `src/utils/resumeReview.ts` requires project names, not descriptions or skills.
  Preserve that validation and add/delete/confirm behavior.
- `src/repositories/resumeRepository.ts:35–46`: object restore builds only
  name, string skills and optional string description. Unknown tool properties
  are not retained by this mapper. Legacy string items become a name plus the
  existing dictionary-derived skills; they do not yield an authoritative tools
  list. This pre-existing compatibility behavior must not be expanded here.
- Repository upsert at line 82 writes `profile.projects` as JSON. Database types
  and checked-in schema use a projects JSON/JSONB column, not separate project
  tool columns. A flexible JSON column does not supply a missing domain field
  or guarantee restore preserves it. No cloud schema/data inspection occurred.
- `supabase/functions/_shared/aiResumeExtractionV1.ts:5,68–70,119–120`: AI
  project wire shape is name, skills and nullable description; mapping returns
  only these. Its object schema uses required keys and additionalProperties false.
  A tools property would not be an unchanged V1 extraction contract.
- Mock/dev fixtures in `src/data/mockResume.ts` and `mockResumeExtraction.ts`
  use the same three-field shape. Tests in `confirmedResumeRepository.test.ts`,
  `resumeReviewHardening.test.tsx`, `matchingEngine.test.ts` and
  `aiResumeExtractionContract.test.ts` cover existing projects, not a tools list.
- The legacy analyzer has an explicit 使用技術 label pattern and can populate
  `skills`. Its other project text can accumulate in description. Neither it nor
  the structured-domain producer exposes an independent project tools field.
  Existing extraction rules are evidence of historical producers, not permission
  to introduce a new presentation parser or change the PDF/AI flow.

Structured technology data exists: **YES**, as skills. This array may include
tools such as Git or Vite; it has **no authoritative per-item technology/tool
classification**. Preserve all values and order; do not relocate or classify them.
Structured tool data exists: **NO**.

## Origin of 使用技術 and 開發工具

The confirmed formatter generates **neither** label: it adds only `/` and `｜`.
The current editor labels project tags as `專案 N 技術`, not 開發工具. A source
search found 使用技術 in existing parser label rules, but no active project
presentation or project-field assignment that generates 開發工具. No exact
InfinityFree / Visual Studio Code / VTUBER電商 stored example was found.

Therefore these visible words must already be in one or more supplied/restored
field strings along this render path; their exact placement in name/skills/
description and whether the saved profile originated from manual or legacy input
remain **NOT VERIFIED**. Description or legacy text is a plausible source, not a
confirmed identification. Even if tools are written in description, they are
not structurally available for a distinct tools section.

The skill dictionary's global `group: 'tools'` taxonomy does not resolve this
gap. It serves other normalization/game/matching concerns, is not a project
tools field, and using it to split the displayed list would violate the user's
no-classification rule. Do not infer tool categories from names or group metadata.

## Matching dependency analysis

**PROJECT_TECH_MATCHING_DEPENDENCY = YES.**
`src/matching/scoreCalculator.ts:21` joins each project's name, description and
skills into project text. `detectCanonicalSkills` identifies evidence used by
`projectSkills`; matching's project evidence score/reasons consume that set.
Changing stored skills or rewriting a description can therefore change results.
Pure rendering from the unchanged fields does not need a scoring change.

**PROJECT_TOOLS_MATCHING_DEPENDENCY = NO for a dedicated field, because none
exists.** This does **not** mean tool-like content is ignored. Values already in
skills/name/description can be recognized by the existing dictionary and affect
project evidence. Preserve them exactly. Do not add education/tool scoring, move
values between categories or strip labels/content from description.

Global required-skill coverage uses `resume.skills`, while project evidence uses
the project text described above. Keep both paths unchanged.

## Design boundary and safe legacy fallback

The complete desired presentation — project name + independent 使用技術 +
independent 開發工具 — is **not safely possible from the current contract**.
Reconstructing tools from a sentence would require prohibited string heuristics
or a newly approved data contract. Do not split on 使用技術/開發工具, pipes or
spaces; do not call existing analyzers/dictionaries to infer presentation groups.

A **limited fallback design**, requiring a separately narrowed implementation
instruction, can display only already available fields:

1. Project name on its own line, verbatim.
2. A 使用技術 section only when the existing skills array contains actual
   values; display the same list in order, without filtering/reclassification.
   This is the existing project skill list, not a claim that every entry is a
   language/framework or that it excludes tools.
3. A 專案說明 section only when description has actual text; retain all raw
   content and meaningful line breaks, with wrapping. Do not remove apparent
   technology/tool labels from inside that text.
4. **Do not render 開發工具**, an empty heading, a “none” claim or fabricated
   entries. Omit headings for absent data. If the entire legacy project was
   retained as one long name, display it intact without guessing a shorter title.

This fallback separates existing fields and avoids data loss, but **cannot
satisfy the user's independent tools section or guarantee all legacy sentences
become categorically separated**. It must not be reported as a complete fix.
The project editor remains unchanged; no extra tool input is proposed under the
current frozen contract.

For any later approved fallback, keep the existing project list/container and
guild/parchment design. Reuse the established editor sizes (18px body/value,
17px labels/list items, 16px supporting text, 22px section heading) in a narrowly
scoped confirmed-project presentation style. Current tokens are defined only on
`.resume-review`; ProfilePage is outside that scope. A later implementation would
need explicit shared/scoped token availability, not undefined CSS variable
references or another global typography change. Preserve responsive rules and
test wrapping of Chinese, long unbroken values and multi-paragraph descriptions.
No layout/CSS changes or future visual PASS claims occur in this design turn.

## Required decision/report

| Item | Result |
| --- | --- |
| Current render component | ProfilePage confirmed 專案經驗; ResumeReview is the separate editor |
| Current data source | confirmed ResumeProfile.projects / cloned draft / existing repository restore |
| Project name field | name |
| Technology field | skills, undivided list |
| Development-tools field | **NOT AVAILABLE** |
| Description field | description, optional raw text |
| Structured technology data exists | YES |
| Structured tool data exists | NO |
| Current dense rendering root cause | formatResumeProject joins name, skill list and description into one inline string |
| String parsing required | YES to attempt the full split from today's opaque text without a new contract; **prohibited, STOP** |
| Presentation-only fix possible | NO for the full requested tools/technology separation; YES only for the limited fallback |
| ResumeProfile change required | YES for an explicit independent tools field; NO for the limited fallback |
| Database change required | NO for this design/fallback; none performed |
| Matching change required | NO; preserve stored values and scoring |
| AI contract change required | NO for the limited fallback; a future tools-bearing V1 extension would require separate approval |
| Legacy-data fallback | preserve raw name/skills/description, render only available sections, omit tools heading |
| Recommended next action | **BLOCKED_STRUCTURED_DATA_GAP** |

Expected implementation files **if the limited fallback is separately approved**:
`src/pages/ProfilePage.tsx`, narrowly scoped project styles in `src/styles.css`,
focused confirmed-project presentation tests and the corresponding report.
`formatResumeProject` could remain intact for compatibility while ProfilePage
renders the existing fields directly. No Review/persistence/type/AI changes are
needed for that limited scope. No implementation file is currently authorized.

Completing the full request needs a separately approved ownership/storage/editor/
restore/AI decision for authoritative tools data. An exact saved field snapshot
can clarify this example's content placement, but by itself does not create the
missing tools contract. This report does not choose or implement an extension.

Protected: ResumeProfile and AI contracts, serializers/deserializers, confirmed
persistence, Matching, Auth, Connector, preferences, actions, session TTL/restore,
job_snapshot, existing editor operations and unrelated typography/PDF/AI/import
work. No new RP. No OpenRouter or cloud actions.

Verification is static dependency/source inspection; no tests/build or browser
acceptance were rerun because no behavior changed. SHA-256 comparison against the
890-file baseline verifies only this design document was added and all existing
files remain unchanged. Future A–H project readability acceptance is NOT VERIFIED;
existing Editor UX I–J remain PAUSED.

**STOP — STRUCTURED_PROJECT_PRESENTATION_DATA_NOT_AVAILABLE.**
