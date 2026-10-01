# JOBQUEST RESUME EDITOR UX DESIGN

2026-09-29 · INVESTIGATION → DESIGN ONLY · STOP

Recommended next action: **APPROVE_RESUME_EDITOR_UX_IMPLEMENTATION**.
No production implementation, CSS/component/type changes, cloud query/write,
migration, AI runtime or continuation of manual acceptance occurred.

## Observe

Manual usability issue confirmed: **YES**. Source: the user's current manual
findings (small labels and actual entered text; unnecessarily split education).
This is a readability problem supported by computed CSS, not a diagnosed save bug.
Prior entry acceptance is **A PASS / B PASS / C PASS; D–H PAUSED**, as reported
by the user. Neither this investigation nor the earlier automated tests promote
D–H to PASS. Do not ask the user to resume them before this design is resolved.

## Inspect: current typography

Evidence: `src/styles.css`, Tailwind Preflight, `tailwind.config.js` and actual
ResumeReview SSR markup rendered with the unchanged last-build stylesheet in an
isolated local browser page. Root computed font size is 16px, viewport 1280×720.
The probe includes only static Review with observation fixtures, not App/Auth,
personal resume data, save handlers or matching. No controls were submitted.
Browser measurement is a read-only investigation, **not product acceptance**.
All source files remained unchanged and the build stylesheet was not rewritten.

| Current element | Computed size / line height | Other evidence |
| --- | --- | --- |
| Body/default form inheritance | 16px / 24px | weight 400; root uses Noto Sans TC, Microsoft JhengHei, system fallbacks |
| Intro/explanatory paragraph | 13px / 22.1px | `.onboarding-card > p`, bottom margin 25px |
| Section heading | 16px / 24px | `.review-group h2`, computed weight 400 after Preflight |
| Field label: name, education, work, project | 10px / 15px | weight 800; label/control gap 5px |
| **Input value: name, school, department, status, company, title, dates, project name** | **10px / 15px** | **inherits label weight 800**, height 39px, padding 0 10px |
| **Textarea value: work content and project description** | **10px / 15px** | **inherits label weight 800**, min-height 68px, padding 9px 10px, vertical resize |
| Grid input/textarea placeholder, when present | 10px / inherited 15px | default Preflight gray `#9ca3af`, opacity 1 |
| Tags input: skills, certificates, directions, project technologies | 16px / 24px | weight 400; height 35px; padding 0 9px |
| Tags input placeholder | 16px / inherited 24px | same Preflight gray |
| Tags label | 10px / 15px | weight 700; bottom margin 7px |
| Entered tags after addition | 9px / 13.5px | padding 5px 8px; 29px min tag-row space |
| Missing-field/helper message | 12px / 18px | margin 4px 0 8px |
| Validation/save error | 10px / 15px | padding 10px 12px; bottom margin 14px |
| Primary confirmation | 16px / 24px | weight 700; min-height 46px; horizontal padding 22px |
| Tag add button | 10px / 15px | 60px grid column; same 35px row height |
| Back/cancel | 10px / 15px | absolute position; desktop top 22px, mobile top 15px |
| Entry heading (經歷/專案 index) | 12px / 18px by inherited 1.5 | remove button is 32×32px with 20px glyph |
| Add experience/project text button | inherited 16px / 24px | no separate `.text-button` typography rule found |
| Source kicker | 10px / 15px by inherited 1.5 | no longer letter-spaced in Review |
| Save notice outside editor | 12px / 19.2px by CSS | outside proposed editor scope |

The label rule at `src/styles.css:188` sets 10px. Grid inputs have no independent
font-size or font-weight override. Tailwind Preflight sets input/textarea font
size 100%, font weight and line height inherit. The app's `button, input, select
{ font: inherit }` reinforces input inheritance; textarea also inherits through
Preflight even though it is absent from that local selector. Thus enlarging just
the body or a nearby heading cannot fix value text consistently. Values need an
explicit editor control token and normal weight, independent of labels.

Current spacing: two equal `minmax(0,1fr)` columns, gap 12px; label gap 5px;
tag group margin-top 15px, tag form gap 6px and top margin 7px; section margin
24px 0 and top padding 16px; entry padding 12px 0 18px and bottom margin 12px.
Desktop card padding is 44px 50px 34px, within the existing 760px create wrapper.
Profile edit uses the same card inside the narrower main column. Width alone does
not enlarge typography on a large monitor.

At an explicit 375×812 browser viewport, the existing <=520px rule uses one
column and card padding 44px 18px 28px. Measured field width is about 292.8px,
tag input about 226.8px. **Values remain 10px; tag inputs remain 16px.** There
is no mobile font-size override correcting this. The probe's visible scrollbar
reduces body content width; do not treat these measured widths as fixed tokens.
The 1180/780px app layout breakpoints also affect profile-edit available width.

Shared typography system exists: **NO for the editor**. Shared selectors and
Tailwind color names exist, but there are no reusable editor typography tokens
or CSS custom properties. Sizes are scattered literal declarations in one CSS
file, rather than scattered component inline styles.

Contrast calculations, using computed colors and sRGB relative luminance:

| Pair | Contrast | Finding |
| --- | --- | --- |
| Value `#2e1e12` / control `#f1ddaa` | 11.95:1 | color is strong; value size is still inadequate for the reported use |
| Placeholder `#9ca3af` / control `#f1ddaa` | 1.89:1 | weak placeholder, including textarea and tag entry |
| Label `#5b3e24` / parchment base `#e5c98f` | 6.06:1 | retain existing ink family |
| Helper `#594027` / parchment base `#e5c98f` | 5.98:1 | size, not base-color contrast, is the primary issue |

Parchment has gradients/texture; base-color calculations are not a full rendered
contrast audit. Disabled confirmation has opacity/filter, so do not classify it
using the enabled foreground alone. Active controls need separate verification.
Normal text, including placeholders, should reach at least 4.5:1 under
[W3C Contrast Minimum](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html).
This does not establish a WCAG-required minimum font size: 17–18px is this
product's readability decision, informed by the user's stated needs.

## Design: scoped readability system

Keep guild/parchment/ink/brass identity, current card/grid/sections and controls.
Define one token group scoped to `.resume-review` in `src/styles.css`; existing
selectors consume it. Avoid changing global body, search controls, Board, profile
read-only sheet or Auth UI. Use rem sizes relative to the current 16px root so
user font preferences still work. Values below are proposed tokens, **not edits**.

| Role/token | Proposed value at 16px root |
| --- | --- |
| `--resume-editor-value-size` | 1.125rem = **18px**, input and textarea, weight 400 |
| `--resume-editor-label-size` | 1.0625rem = **17px**, weight 600–700 |
| `--resume-editor-support-size` | 1rem = **16px**, intro/helper/error/kicker |
| `--resume-editor-placeholder-size` | 1rem = **16px**, opacity 1, no lighter fade |
| `--resume-editor-tag-size` | 1.0625rem = **17px**, added values and remove text |
| `--resume-editor-heading-size` | 1.375rem = **22px**, section headings, weight 700 |
| `--resume-editor-button-size` | 1.0625rem = **17px**, confirm/add/back/cancel |
| Control line height | 1.5 = **27px** at 18px |
| Textarea line height | 1.65 ≈ **29.7px** at 18px |
| Support line height | 1.6 = **25.6px** at 16px |
| Label/heading line height | 1.5 / 1.35, respectively |
| Control padding | 0.625rem vertical / 0.75rem horizontal = **10/12px** |
| Input minimum height | 3.25rem = **52px**, use auto height; remove fixed 39/35px heights in the scoped rules |
| Textarea minimum height | 10rem = **160px**, auto-growing content area or existing vertical resize; no fixed max-height |
| Label/control gap | 0.5rem = **8px** |
| Field row/column gap | 1.125rem = **18px** |
| Section margin/top padding | 2rem / 1.25rem = **32/20px** |
| Tag form gap | 0.5rem = **8px**; second column auto with an adequate minimum rather than fixed 60px |
| Action minimum height | 3rem = **48px**, padding 10/14px; clear remove target without changing its operation |

Keep existing dark value/label colors. Explicit placeholder token can use the
existing dark brown `#6f4b25` on `#f1ddaa` (approximately 5.7:1; see measured
candidate result in investigation evidence), rather than default gray. This is
a scoped readability correction using the current palette, not a theme change.
Preserve the existing focus-visible outline. Ensure labels remain actual labels;
placeholder is a hint, not their replacement.

Use min-height plus padding instead of fixed control heights: 27px line + 20px
vertical padding + 2px border already requires 49px. A 52px minimum has room;
old 35/39px boxes would crowd enlarged text. Preserve wrap/vertical resize for
long Chinese text and English tokens. Added tags must also enlarge, so skill,
certificate and direction text does not shrink after the user clicks 新增.

Back/cancel is absolutely positioned. Increasing it to a readable 48px target
while retaining current 44px card top padding would overlap the kicker/title.
Reserve roughly 76px above content in the existing card, with a stable top inset;
allow a slightly smaller horizontal inset on mobile. This is spacing within the
same structure. Primary and validation regions must remain in normal flow.

Responsive risks: narrow desktop profile columns, long tag labels, the fixed
60px add column, existing card border/padding, absolute back control, text-spacing
overrides and zoom. Keep `minmax(0,1fr)` and `min-width:0`; consider changing
only the editor's column-collapse threshold from 520px to 780px if available
content width shows crowding. Do not reduce font sizes on mobile to fit.
Verify actual create and profile-edit contexts at 320/375/520/780/1280/1440px,
200% zoom, long values and enlarged text spacing before any future PASS claim.
The proposed layout at these sizes is **NOT VERIFIED**: no CSS was applied.

[W3C Resize Text](https://www.w3.org/WAI/WCAG22/Understanding/resize-text.html)
describes 200% enlargement without loss of content/functionality;
[W3C Reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html) addresses
reflow at 320 CSS pixels. Test user spacing overrides against
[W3C Text Spacing](https://www.w3.org/WAI/WCAG22/Understanding/text-spacing.html)
(line height 1.5, paragraph spacing 2em, letter spacing .12em, word spacing .16em).
Those are tolerance tests, not a requirement to apply all those spacing values
as the default design.

## Dependency analysis: education

Current model: **one ResumeEducation object** with required string keys
`school`, `department`, `graduationStatus` (`src/types/index.ts:45`). There is
no `major` key; the user's conceptual major corresponds to **department**.
There is no current degree/date field or multi-entry education array.
The draft is the same ResumeProfile shape, cloned in Review; no separate manual
education type exists.

| Field | Exact consumers and purpose |
| --- | --- |
| school | Review input; ProfilePage via formatResumeEducation; repository write/read; analyzer and structured parser producers/validity; Mock/manual fixtures; AI candidate schema, factual paths and mapDomain; associated tests |
| major → department | Same consumers as school; no `major` property rename is needed or permitted |
| graduationStatus | Review input; ProfilePage formatter; repository write/read; analyzer/parser producer and profile validity; Mock/manual fixtures; AI schema/factual path/mapDomain and tests |

Specific evidence:

- `src/components/onboarding/ResumeReview.tsx:60–62`: three independent inputs.
- `src/utils/resumeReview.ts:3`: confirmation checks only name and every added
  work title/project name. **Education and graduation status are optional today.**
- `src/utils/resumeFormatting.ts:6–11`: formatter joins nonempty values with ｜;
  existing parseResumeEducation splits delimiters. The parser has no current
  production caller found. Do **not** reuse it for a free manual sentence.
- `src/pages/ProfilePage.tsx:14`: education is display only; ResumePanel does
  not consume education.
- `src/repositories/resumeRepository.ts:9–15,68,84`: object keys are normalized
  to strings, legacy JSON string becomes school text + empty other keys, writes
  retain `profile.education` unchanged.
- `src/services/confirmedResumePersistence.ts`: clones/saves/restores complete
  profiles, without education-specific inference or validation.
- `src/types/database.ts:7–9` and migration
  `supabase/migrations/20260919114039_create_job_quest_user_data.sql:10`:
  education is nullable JSON/JSONB. Local migrations contain no education key
  checks, SQL JSON-path consumer or separate school/major/status columns.
- `src/matching/scoreCalculator.ts:19` prepares skills, career directions,
  work experience and projects. skillMatcher and careerMatcher also do not read
  education. Search of all `src/matching` found no education-field references.
- `supabase/functions/_shared/aiResumeExtractionV1.ts:6,67,92,108`:
  the V1 wire schema requires all three nullable keys, factual paths refer to
  them, and mapping converts null to empty string. ReviewCandidate wraps these
  fields as REVIEW_REQUIRED; they are not accepted automatically.
- Existing analyzer (`src/analyzers/resumeAnalyzer.ts`) and structured domain
  parser (`src/parsers/structuredResumeDomains.ts`) produce all three fields;
  `resumeDocumentOutcome.ts` checks their runtime string shape. Preserve these
  off-manual-path consumers rather than deleting supposedly unused fields.

**MATCHING_EDUCATION_STRUCTURE_DEPENDENCY = NO.** This conclusion is limited
to the inspected current Matching code. A temporary read-only test compared the
entire match outputs across all existing mock jobs for empty, structured and
opaque-text education while holding everything else fixed; outputs were equal.

**Persistence dependency = YES on the current application object mapping;
NO on a DB requirement for three separate semantic fields.** Existing repository
tests and a temporary probe proved object round-trip and legacy string reading
with injected repository stubs. This is not a live Supabase acceptance test.
No remote schema inspection was needed or performed; the no-migration conclusion
uses checked-in schema and unchanged mapping already in use. New deployment-wide
schema claims outside this evidence are NOT VERIFIED.

**AI contract dependency = YES.** Removing/renaming these keys would break strict
required-key validation, evidence paths and mapping, including existing contract
tests rejecting missing status and unapproved degree. Therefore Option B would
require changes to frozen AI/domain/persistence boundaries and is rejected here.

## Design: Option A, one optional manual 學歷 input

Preferred manual UX: **學歷（選填） [朝陽科技大學 資訊工程系]**. The example
is a placeholder/example only; an empty draft remains empty. Helper:
「可直接填寫學校與科系，不需拆欄；不必填寫畢業狀態。」
Do not require education for confirmation or alter existing validation.

The narrow presentation adapter is explicit and non-inferential:

1. On entering manual create/edit, retain an isolated original education object.
   The single input's initial string is the existing display projection
   `formatResumeEducation(original)`; new manual draft projects to ''.
2. If the input is unchanged, or the user returns it exactly to its initial
   value, confirmation passes the **original object unchanged**, including
   missing positions and structured department/status. Never split the projected
   display back into fields. Editing skills alone cannot flatten education.
3. If the user changes the education text, it is an explicit replacement by one
   opaque manual text: `{ school: rawInput, department: '', graduationStatus: '' }`.
   Preserve the user's string; do not split pipes, spaces, school suffixes or
   detect graduation, degree, dates or specialties. The school slot is an
   existing compatibility carrier for manual education text, **not a claim that
   the entire sentence was identified as an institution**. Empty input produces
   all empty strings; missing facts remain missing.
4. For an original object with department/status, show a visible change notice
   as soon as replacement is pending: 「修改學歷後，原有科系與畢業狀態會改為
   這段文字；確認後才會保存。取消可保留原資料。」 Do not silently discard
   hidden structure. Cancel retains the original confirmed object and original
   Review cancellation behavior; existing 確認履歷 is the explicit commit.
5. Preserve profile id/other fields and the existing confirm snapshot/save
   callback. No automatic save, cloud write on typing, inferred fields, new
   parseMetadata marker or matching change.

This projection is intentionally not reversible by parsing. For example an
original `{school:'',department:'資訊工程系',graduationStatus:''}` displays that
department, but untouched confirmation must retain it as department rather than
moving it into school. An edited opaque sentence round-trips through the current
repository and displays through the current formatter as one sentence.

Tradeoff: the `school` slot can carry manual free text, just as the legacy reader
already allows. The schema has no provenance marker distinguishing that text
from an institution-only value. No current downstream consumer needs that
distinction. A future institution classifier/filter, education scoring or
normalized multi-entry model must reopen its contract explicitly; it must not
infer structure or treat these manual strings as verified institutions.

Future AI coexistence: preserve the richer V1 three-key candidate and mapping.
For `ai-draft` (and preserved Mock/dev), retain the existing structured correction
mode so a user can correct proposed school/department/status individually.
Manual create and confirmed-edit use the single input with the preserve/replacement
rules above. This avoids forcing manual users into AI's data-entry burden while
retaining future structured review. Degree and education dates are **not supported
by current V1**; adding them requires a separate approved contract change, not
this UX implementation. No AI runtime or route is introduced.

Decision: Can manual UI use ONE 學歷 field: **YES**.
Recommended education UX: **Option A**.
Underlying ResumeProfile contract change required: **NO**.
Database migration/schema/RLS/grant change required: **NO**.
Frozen dependency conflict: **NO for this bounded design**; Option B would conflict
with the exact typed/repository/AI/parser consumers listed above.

## Expected implementation scope and gates

Expected production changes only after approval:

- `src/styles.css`: one editor-scoped readability token group and scoped rules,
  height/spacing/placeholder adjustments, narrow responsive and back-button clearance.
- `src/components/onboarding/ResumeReview.tsx`: replace only manual education
  controls with the single input and visible replacement notice; preserve existing
  AI/Mock structured mode and field/validation/confirm/save/cancel behavior.
- A small presentation-only utility such as
  `src/utils/resumeEducationInput.ts`: initial projection, unchanged preservation
  and explicit opaque replacement; no parser/inference or new domain contract.
- `tests/manualResumeEntry.test.tsx`, `tests/resumeReviewHardening.test.tsx` and
  focused new education-presentation tests; docs for the approved scope/results.

Explicitly protected: `src/types/index.ts`, `src/types/database.ts`,
`src/utils/resumeReview.ts`, `src/utils/resumeFormatting.ts`,
`src/repositories/resumeRepository.ts`, confirmed persistence service/hook,
Supabase schema/migrations/RLS/grants, Auth implementation, Job Preferences,
`src/matching/**`, matchingService, Board, REAL104 Connector/normalization,
job actions, REAL session/TTL, job_snapshot, Mock adapter/fixtures, analyzer/parser
contracts and `supabase/functions/**` AI contracts/runtime. App/ProfilePage/manual
entry orchestration need no behavior changes for this design.

Future automated gates: no fake/default education; no education required;
unchanged structured object survives skill-only edits; edit-then-revert preserves
original; arbitrary `|`/spaces stay raw; clear removes all education only after
confirmation; cancel/failure keeps original; legacy object/string restore; current
id retained; existing field editing/validation/tag actions; AI/Mock correction
shape remains; only confirmed profiles match; Match outputs remain invariant to
education; no schema/AI runtime changes. Inspect computed label/value/textarea/
placeholder/tag/error/button sizes, control clipping, wrapping and focus at stated
widths in create and profile contexts. Do not settle for CSS source assertions.

Future **user** acceptance A–J: labels; actual input values; long textarea text;
placeholder/helper/error; no clipping/overlap; no broken layout; single education
entry; no graduation-status burden; confirm/F5 restore; REAL104 Matching.
These are future gates, currently **NOT VERIFIED**. Existing entry D–H remain
**PAUSED**. Do not conduct or request their continuation in this design turn.

Investigation verification: **7 files / 218 tests PASS**: four temporary education
probes plus 214 existing manual entry, Review hardening, persistence, repository,
matching and pure AI contract tests. The temporary probe was archived outside
the project and removed; no permanent test or production changes remain.
No TypeScript/build rerun was required for a documentation-only change.
The 884-file baseline is SHA-256 compared with the final state; only this design
document is added, with every existing tracked-by-manifest file unchanged.

**STOP — design complete; await an implementation instruction.**
