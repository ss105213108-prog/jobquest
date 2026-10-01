# Structured Resume Analyzer Input Migration

Status: Accepted architecture (RP-106, 2026-09-28). No analyzer, normalization, section, domain, contract-test, or parser implementation is authorized here. Builds on [ADR 0009](0009-pdf-legacy-domain-adapter.md) and the RP-105 production source foundation.

Choose **STRUCTURED_SEGMENT_STREAM (Option C)**: the future PDF analyzer consumes `ResumeSourceDocument` through an internal, ordered, provenance-bearing analysis stream. Keep a temporary **DUAL_ENTRY** interface: existing `resumeAnalyzer.analyze(parsed, normalizedText, options)` for legacy callers/DOCX, and a separately contracted future `analyzeSource(source, metadata, options)` for PDF. Neither the source adapter nor this decision inserts separators. The legacy PDF pipeline remains authoritative until a later single explicit switch; `NO_PRODUCTION_SHADOW` remains active.

## Actual production audit

The current chain is [`resumeService.analyzeResume`](../../src/services/resumeService.ts:11) -> `parseResumeFile` -> `normalizeResumeText(parsed.text)` -> `resumeAnalyzer.analyze(parsed, normalizedText)` -> section/domain interpretation -> existing `ResumeProfile`. The analyzer does **not** currently accept only `analyze(string)`: its additional `ParsedResumeFile` carries file metadata and parser messages. A future PDF entry must take metadata separately, without fabricating `ParsedResumeFile.text` or copying raw parser-message strings into diagnostics. [`parseDocxResume`](../../src/parsers/docxResumeParser.ts:4) extracts Mammoth raw text and messages; that complete legacy path remains unchanged. [`parsePdfResume`](../../src/parsers/pdfResumeParser.ts:11) currently joins reconstructed pages with `\n\n`; this is legacy behavior, not structured-source authority.

### Classification method and counts

Inventory: **18 named, reachable text-analysis functions/helpers** below. Each gets one primary classification, so totals are reproducible: **A LEXICAL_LOCAL: 5; B STRUCTURAL_SEQUENCE: 2; C GLOBAL_DOCUMENT: 2; D LEGACY_FLATTENING_DEPENDENT: 4; E DOMAIN_SEMANTIC: 5**. Secondary dependencies are stated rather than hidden by the primary label. Service/parser/source-adapter plumbing and three analyzer operation groups are audited separately; they are not counted as extra functions. Nested `pushPending`, `flush`, `has`, and `score` are included under their owning functions. `canonicalizeSkill` and `normalizeSkillList` are not called by this analyzer path; they are not substituted for `detectSkills`.

All string arguments are immutable JavaScript values. "Transforms" below means derived text, not mutation of the source string. Output objects/state and optional traces sometimes are mutated.

| Function / source | Exact input | Primary | Actual requirements, transformations and separator dependence | Structured reuse |
| --- | --- | --- | --- | --- |
| [`normalizeResumeText`](../../src/parsers/normalizeResumeText.ts:1) | `value: string` | D | Whole string; NFKC, line/control/bullet/space rewrites, newline split/join, blank-line collapse, trim. Legacy reconstructed separators are indistinguishable from authored ones. | Do not call the entire function on structured input; see operation audit. |
| [`cleanHeading`](../../src/analyzers/sectionDetector.ts:12) | `value: string` | A | Local prefix/bracket removal, trim, locale lowercase. No surrounding context. | Reuse comparison predicate on one source-backed candidate; retain raw reference. |
| [`matchHeading`](../../src/analyzers/sectionDetector.ts:19) | `line: string` | A | Alias equality, equality with colon suffix, or anchored alias + colon + nonempty inline body. Alias order is key insertion order, then descending alias length. Inline body comes from the original line after its first colon. | Same aliases/predicates on one candidate; no substring-based new headings or concatenated candidates. |
| [`traceExperienceHeadingCandidates`](../../src/analyzers/sectionDetector.ts:48) | `lines: string[]` | B | DEV/browser-only traversal; middle-dot candidates and first heading context. Emits supported aliases, indices, booleans and counts, not resume body. Does not determine recognition. | Optional structured ordinal/source-reference tracing; do not label unit ordinals as legacy line indices. |
| [`detectResumeSections`](../../src/analyzers/sectionDetector.ts:94) | `text: string` | D | Splits LF, maintains current section, skips blank lines, handles middle-dot heading suffix, joins section bodies with LF. No neighbor lookahead or flattened character-offset ranges. | Input and output migration required; retain rules and state, replace string accumulation with references. |
| [`detectName`](../../src/analyzers/resumeAnalyzer.ts:32) | `preamble: string[]` | B | First 14 supplied records; first pipe/full-width-pipe/middle-dot part, trim, contact/role exclusion, anchored Han or Latin name checks, length cap. Analyzer appends basic-info lines after preamble. | Local predicates reusable; the 14-line budget is not a 14-unit budget. Line-sensitive migration gap. |
| [`fallbackEducationText`](../../src/analyzers/resumeAnalyzer.ts:42) | `text: string` | D | Global first school-signal nonempty line plus up to two following lines, joins LF. Requires ordered context, not a single local search. | Return references to source-backed records instead; three-line window cannot silently become three units. |
| [`parseEducation`](../../src/analyzers/resumeAnalyzer.ts:48) | `value: string \| undefined` | E | LF and source middle-dot split, trim/filter; first status/school/department wins, dash/combined local school-department patterns, date exclusion, status removal. Mutates only result. | INPUT_ADAPTATION; retain local predicates and ordered field state, remove section-string wrapper. |
| [`parseDateRange`](../../src/analyzers/resumeAnalyzer.ts:82) | `value: string` | A | Local regex; whitespace around separator can include LF if the caller passes it. Work currently invokes it on a line subsegment. | Reuse on a bounded local candidate, not assembled units. |
| [`parseWorkHeader`](../../src/analyzers/resumeAnalyzer.ts:87) | `value: string` | A | Source dash splitting or local Chinese company/title pattern. Produces company/title; joins same-candidate title parts with ` - `. | Local rules reusable; source split across units is not reconstructed. |
| [`appendDescription`](../../src/analyzers/resumeAnalyzer.ts:94) | `item: WorkExperience, value: string` | E | Removes description label, trims, appends to interpreted domain description with a space; mutates item. | Reuse after domain association is established, never as a source or regex-input join. |
| [`parseWorkExperiences`](../../src/analyzers/resumeAnalyzer.ts:99) | `value: string \| undefined, trace?: WorkParserTrace` | E | LF records, bullet removal, local pipe/bullet/spaced-middle-dot splitting; pending company/title/location/description state, date-triggered commit, tail duration/description, trailing pending rejection, title filter. Nested `pushPending` mutates entries/trace. | INPUT_ADAPTATION with explicit record origin; no implicit unit/page flush. Line-sensitive unlabeled headers need contracts, not a new recognition policy. |
| [`parseProjects`](../../src/analyzers/resumeAnalyzer.ts:204) | `value: string \| undefined` | E | LF records, bullet removal; label/dash predicates, current project state, local `detectSkills`, source-record descriptions. Nested `flush` requires name + skills, deduplicates skills; first five projects. Some local tail parts joined before skill search. | INPUT_ADAPTATION; preserve state/order/filter/cap. Do not join cross-unit skill inputs. |
| [`careerDirections`](../../src/analyzers/resumeAnalyzer.ts:246) | `skills: string[], text: string` | C | Dictionary-group counts plus global existence regex for backend/data/AI terms; `machine learning` requires literal space, word-boundary AI/LLM are context-sensitive. | Fold counts and source-local predicate witnesses over ordered units; boundary-sensitive cases need guards. |
| [`abilities`](../../src/analyzers/resumeAnalyzer.ts:259) | `skills: string[]` | E | No text input; group-count score and cap, nested `score`. | UNCHANGED; profile level calculation likewise needs skills only. |
| [`resumeAnalyzer.analyze`](../../src/analyzers/resumeAnalyzer.ts:271) | `parsed: ParsedResumeFile, normalizedText: string, options: { traceWorkExperience?: boolean } = {}` | D | Whole-text section/skill searches; name/basic-info combination; education fallback; optional line traces; domain parsing; directions/warnings/profile construction. | New structured orchestration, same domain output. Keep legacy entry unchanged. |
| [`escapeRegex`](../../src/data/skillDictionary.ts:69) | `value: string` | A | Escapes literal regex metacharacters; no source traversal. | UNCHANGED for alias patterns. |
| [`detectSkills`](../../src/data/skillDictionary.ts:82) | `text: string` | C | Entire-string search; dictionary order, longest alias with any match first, negative letter/number/punctuation lookarounds; canonical output and noncanonical alias metadata. No text normalization here. | Ordered-unit searches plus dictionary-first aggregation; cannot simply concatenate per-unit outputs or ignore edge context. |

Additional analyzer operations: (1) count-based trace signals over nonempty LF records and section lengths, (2) whole-text non-whitespace length `< 120` plus empty-domain and parser-message warnings, (3) `ResumeProfile` metadata, UUID/time, level and abilities construction. Counts can be folds without joins; record counts require honest record-kind names. The low-text warning is **not routing evidence**. Empty name/skills/work/education/projects do not make document parsing fail. IDs/time are existing nondeterministic profile metadata, not evidence of a nondeterministic source projection. Do not introduce fake text to populate metadata or warnings.

## Normalization audit and ownership

Primary counts across the **10 chained operations**: **SOURCE_SAFE_LEXICAL 3; STRUCTURAL_FLATTENING 4; SEMANTIC_OR_LOSSY 3**. "Source-safe" permits a derived analysis view only; it never permits writing normalized text into `ResumeSourceDocument`, erasing provenance, or treating normalized indices as raw offsets.

| Operation, in legacy execution order | Classification | Future ownership / restriction |
| --- | --- | --- |
| 1. `.normalize('NFKC')` | SEMANTIC_OR_LOSSY | Compatibility conversion changes characters and lengths. Explicit, separately tested analysis-view policy may reuse it locally for alias/name matching; retain raw source span. Never implicit adapter normalization or cross-unit Unicode repair. |
| 2. CRLF / lone CR -> LF | SOURCE_SAFE_LEXICAL | Represent source-authored CRLF/CR/LF as typed source-break events with their original code units and ranges. Canonical comparison view may use LF locally; do not manufacture a break between units or merge CR from one unit with LF from another. |
| 3. Delete controls (including VT/form-feed) | SEMANTIC_OR_LOSSY | Can fuse tokens and erase potentially meaningful control distinctions. Do not inherit blanket deletion. Retain raw controls; contract any local exclusion without granting token adjacency or page-break meaning. |
| 4. Bullet variants + `\s*` -> bullet + space | SEMANTIC_OR_LOSSY | `\s*` can consume source newlines; replacement inserts a space. Do not migrate this whole regex. Domain bullet-prefix comparison may ignore a known source bullet locally, without inserting text or eating breaks. |
| 5. `.split('\n')` | STRUCTURAL_FLATTENING | Legacy line decomposition. Replace with per-unit raw-source break tokenization, never document flattening. |
| 6. Horizontal tab/space runs -> space per line | SOURCE_SAFE_LEXICAL | Optional local comparison view within one raw fragment only. Raw span, tabs and whitespace remain recoverable; no cross-break or cross-unit collapse. |
| 7. `.trim()` per line | SOURCE_SAFE_LEXICAL | Safe comparison operation, not permission to drop empty/whitespace source records. Raw refs retained; original character context remains available to boundary-sensitive searches. |
| 8. `.join('\n')` | STRUCTURAL_FLATTENING | No structured equivalent string join. Keep distinct fragments/break events. |
| 9. Three-or-more LF -> two LF | STRUCTURAL_FLATTENING | Also lossy: deletes authored break count. Preserve all source breaks; domain blank-record skipping is separate and must not change source coverage. |
| 10. Document `.trim()` | STRUCTURAL_FLATTENING | Also lossy: erases document-edge records/breaks. No global trim; consumers may ignore whitespace-only candidates while retaining structure. |

Decision: normalization belongs to **analysis comparison**, not serialization/source adaptation or a shared DOCX rewrite. The analysis stream retains raw slice references and may expose narrowly contracted `comparisonText` per fragment. It does not carry document-wide normalized text. NFKC/horizontal-space comparison requires its own RP-107 expectations before implementation; control deletion and newline-consuming bullet normalization are not approved by legacy precedent. Length-changing views must either map positions back to raw spans or return whole-fragment provenance; never invent raw character offsets. No fresh analysis-view transformation may insert newline/whitespace into source data.

## Alternatives and selected model

| Option | Assessment |
| --- | --- |
| A DIRECT_STRUCTURED | Small external interface, but each consumer would independently tokenize breaks, normalize comparisons and manage provenance. Repeats the exact shared complexity exposed by the audit. |
| B STRUCTURED_ANALYSIS_MODEL | A complete second nested page/unit document could hold normalized copies, but duplicates source containers and invites a disguised normalized-document string. More model than the present consumers need. |
| C STRUCTURED_SEGMENT_STREAM | Selected. Internal ordered traversal supplies shared raw references, typed transitions and local comparison views; section/domain consumers reuse them. No second source authority or public flattener. |
| D Direct calls to unchanged string subparsers | Rejected for multiple source records: preserving their signatures requires section joins or artificial delimiters. Local string recognition helpers can still be reused. |

The external future interface remains conceptually `analyzeSource(ResumeSourceDocument, sourceMetadata, options) -> ResumeProfile`. Exact exported types/signatures are deferred to contracts. `sourceMetadata` contains only existing profile construction needs (file name/type/page count and appropriate warning presence), never a required legacy whole-document text or raw error payload. This is one analyzer module with shared private domain predicates, not a new plugin framework or a second profile schema.

### Stream invariants and identity

Conceptual, not executable declarations: text-fragment records plus typed source-break, unit-transition and page-transition information. Each fragment identifies `(pageNumber, unitIndex, groupId, runId, rawStart, rawEnd)` with half-open **UTF-16** offsets into its original unit; an ordered ordinal is deterministic and not a random ID. Transitions identify their adjoining source references; source-break records additionally retain their original `\n`, `\r\n`, or `\r` raw span. Empty units and zero-length fragments remain represented. Text is functional private data; diagnostic projection permits only allowlisted codes, structural indices and counts, never fragment text, raw error messages or filesystem paths.

Traverse existing page order then existing unit order; no sorting by content, identity or geometry. Within a unit, tokenize only authored line-ending code units. Preserve every raw code unit through a fragment or break span, without overlap, loss or duplication. Source references belong to the original document; no anonymous copied string list is authoritative. Derived comparison text never replaces source text. Readonly source types are not deep runtime freezing; future consumers must neither mutate the input nor rely on an external caller freezing it.

`Unit("A\nB")` gives two source-local fragments with a **SOURCE_BREAK**; `Unit("A"), Unit("B")` gives a **UNIT_TRANSITION**, not LF, whitespace, adjacency or a visual line. A **PAGE_TRANSITION** adds page identity only and does not close a semantic section or reset pending domain state. There is no `flatText`, `normalizedText` document field, `source.toString()`, `units.join(...)`, `pages.join(...)`, separator constant or convenience flattener.

### Analysis line versus candidate

**YES**, existing recognition depends on a line-like record concept: heading equality, anchored labels, name budget, fallback window and work/project state transitions. A future `AnalysisLine` may describe a source-authored newline-delimited record **inside one unit**, with source-break/unit-edge tags. It is not a geometric line. Unit outer edges are not proof that the record is a complete legacy line; completeness/context must remain explicit. A one-unit document can have document-edge records, including an unterminated last record.

Use the neutral **analysis fragment** for general unit slices. A complete source unit whose entire comparison fragment matches an existing heading alias is a bounded heading candidate under the structured detector contract, **not** a declaration `ResumeSourceUnit = line`. Heading unit followed by content unit may start a section; content remains a separate referenced fragment. No recognition joins partial heading tokens across unit/page transitions. Unlabeled line-sensitive domain interpretation and line budgets at opaque unit edges remain named migration gaps until contracts establish their structured meaning. Do not split one unit into imagined visual lines by geometry, company names, vocabulary or heading substring searches.

## Structured section detection

Input: canonical analysis fragments with raw provenance and typed transitions. Output: structured section occurrences with `ResumeSectionKey`, heading reference, optional inline-body slice, and ordered **body references / ranges**, plus preamble references and detected-key order. Names are conceptual; exact interface follows RP-107. Local slice endpoints include raw source offsets, not a fabricated global-string offset. A section can span pages and contain several disjoint ranges; one simple `startSegment/endSegment` pair alone is insufficient for middle-dot splitting and repeated-key behavior.

Preserve current recognition details:

- Full candidate equality (after `cleanHeading`) or alias followed only by colon is a heading; alias + colon + nonempty local body is inline. Do not turn `contains(alias)` tracing into recognition. No surrounding-line context is used by `matchHeading` today.
- Source middle dot `・` is a domain delimiter already interpreted by the detector. Its special path runs only if the first heading-matching part has index **greater than zero**, after direct heading matching fails. Prefix is assigned to prior section/preamble; subsequent parts update section state. Retain raw subranges/delimiters; do not recreate a prefix with invented characters.
- Direct repeated heading preserves existing body if it has no inline body; direct repeated **inline** heading replaces that key's accumulated body. In the middle-dot path inline bodies append instead. Preserve this asymmetry in a compatibility aggregation view over references, not by "cleaning up" rules during migration.
- Blank candidates contribute no recognized body but remain in source structure. `detectedSections` is unique key first-insertion order, not occurrence count. Preserve absent versus present-empty section distinctions and the current education empty-section fallback behavior.
- Carry current section through unit/page transitions. No automatic page termination, flush or section inference. General aliases remain unchanged; no private-resume or coordinate-specific rules.

Downstream consumers need ordered preamble/basic-info candidates, section presence/body references, detected keys and local text access. They do not need original flattened line numbers or global character offsets. Split colon/middle-dot content retains source references even when comparison cleaning changes lengths/case. Section strings must not be reintroduced as a "small adapter" to unchanged parsers.

## Domain and global migration decisions

| Domain | Decision | Minimum change / preserved behavior |
| --- | --- | --- |
| Work | INPUT_ADAPTATION | Replace LF split wrapper with source-backed candidate traversal; retain labels/date/header regexes, pending state, duration/description assignment, title filter and order. Typed page/unit transition alone does not commit a record. Line-completeness ambiguity for unlabeled headers is explicitly gated below. |
| Education | INPUT_ADAPTATION | Ordered section-local candidates and source middle-dot subranges; preserve first-field wins, status mapping, inline dash/combined rules and date exclusion. Fallback must consume referenced records, not a joined snippet. |
| Projects | INPUT_ADAPTATION | Ordered candidates; same name/tech/description/dash rules, project state, required name+skills, dedup and five-entry cap. No geometry or cross-unit token repair. |
| Skills/profile | INPUT_ADAPTATION | Ordered-unit matching and dictionary-first aggregation, name/basic-info references, global predicate folds and count warnings. Abilities/level and existing profile shape unchanged. Name budget and boundary-sensitive alias matches need dedicated contracts within this same migration, not an unrelated parser rewrite. |

None of the top-level domain string functions can remain unchanged for arbitrary multi-unit input behind a separator-free string adapter. The local predicates can remain unchanged when given eligible source-local candidates. Domain **output** formatting (existing description-space accumulation or title formatting after recognition) is not source reconstruction; it must never be fed back into headings/skills/global regexes as assembled source evidence. Preserve it only after a domain association is supported. Unsupported candidate grouping stays unresolved, not repaired.

### Whole-string searches and cross-unit gaps

| Existing rule / dependency | Structured reformulation and gap |
| --- | --- |
| `detectSkills` literal aliases and negative lookarounds | Search each complete unit's local view, preserving real in-unit newline context. Aggregate in **dictionary order**, choose longest alias having any witness across the document, then emit that one alias metadata record. Concatenating per-unit results changes longest-alias priority. At opaque unit edges a regex must not gain a fake start/end token delimiter: `Unit("Java"), Unit("Script")` cannot justify Java or JavaScript fusion. Guard boundary-sensitive witnesses whose adjacent character/delimiter is not supported; document outer edges or explicit source-local delimiters can qualify. `MIGRATION_GAP`: unknown edge context may reduce detection; contracts must specify it. No per-page join. |
| Career regex existence | Per-unit existence folds preserve matches contained in source units; skill-count conditions unchanged. `machine learning`, `\bAI\b`, `\bLLM\b` must not span opaque unit edges or gain unsupported word boundaries. `Unit("machine"), Unit("learning")` has no authorized literal space. Treat missing complete witness as unresolved, not a match created by joining. |
| Education fallback first match + three lines | Ordered source-local school witnesses with references. `MIGRATION_GAP`: three legacy lines cannot equal three units; retain at most the eligible source-authored record window, stop rather than infer a missing record break, or explicitly contract a new structural window before implementation. A typed page transition does not itself terminate the education section. |
| Name exclusion and first 14 records | Local contact regex (including whitespace-spanning phone), role exclusions, and anchored Han/Latin names operate on eligible candidates. Preserve preamble then basic-info priority. `MIGRATION_GAP`: opaque unit extents cannot certify legacy full-name lines or a 14-line budget. No cross-unit full-name/phone stitching; contract the source-authored-record budget and candidate eligibility rather than counting units as lines. |
| Work date, duration, school/department combined, project label/dash inputs | Existing local rules can use one eligible fragment; work state can carry separately recognized title/company/date fields across fragments/pages without string concatenation. Split date text (`"2020 -"`, `"2022"`), split label/value (`"Title:"`, `"Engineer"`), and split school/department do not satisfy the original local regex. They require explicit semantic field/continuation evidence if ever supported. `MIGRATION_GAP`: do not complete a regex or infer a delimiter from traversal order. |
| Whole-text warning length and traces | Sum non-whitespace counts of local analysis views without separators; use bounded integer counts. Record-based title/date/duration signals are not legacy line counts unless backed by source breaks. Warning remains warning; no low-text fallback routing. |
| Source-local `・`, pipe, bullet and dash handling | Retain actual local delimiter ranges and predicates. Legacy same-line tail joins before a project skill search require a source-local predicate/witness reformulation, not a generic flattener. Joining distinct input units or pages is never licensed by these local domain delimiters. |

No existing function receives `ResumeSourceUnit[]`, so there is no literal production cross-unit loop to preserve. The risk is the **legacy flattened text contract**: aliases such as `REST API`, phrase/whitespace patterns, local company/title/name/date patterns, and line-index state can succeed only after reconstructed fragments are combined. Some literal alias/phrase predicates span source-internal LF differently (`REST API` uses a literal space; date/name whitespace may use `\s`); keep those exact predicate semantics when evaluating a whole unit, not merely LF-fragment skill searches. Multiple units do not supply equivalent characters. No token-spanning regex is authorized across them.

A whole-unit search reads that original unit's source text (or an explicitly contracted local comparison view) directly. It must not rebuild a unit by joining analysis fragments; raw break context is already present in the unit. This local read is not a document/page flattener and does not expand line-based domain candidate eligibility.

These are representable as structural traversal plus bounded local witnesses and explicit unresolved cases; the architecture is therefore **COMPLETE**, not a claim of legacy output equivalence on ambiguous inputs. No indispensable requirement has been identified that demands fabricating separators. Before implementation, RP-107 must lock conservative behavior at each gap; if it demands a positive cross-unit match with no source/semantic authority, stop with `DOMAIN_RULES_REQUIRE_UNSUPPORTED_FLAT_TEXT_SEMANTICS` rather than conceal it.

## Compatibility, outcome and privacy

Select **DUAL_ENTRY**, not forced DOCX adoption of an analysis model. Existing DOCX normalization/analyzer and legacy PDF entry remain unchanged. Future shared internal local recognition helpers may be extracted only after contracts; do not duplicate entire rule tables indefinitely. A later PDF integration chooses exactly one authoritative pipeline, never a production legacy/structured comparison run.

Return existing `ResumeProfile`, `ResumeEducation`, `WorkExperience`, `ResumeProject` and parse metadata where applicable. Do not add a second profile schema. File name and raw text may be functional data, not diagnostics. Stable codes, source references and counts may be diagnostic; no raw segment, identity/contact/company/school text, parser message, `Error.message`, or filesystem path. Existing optional legacy traces remain untouched; future structured trace projections need their own allowlist.

Distinguish (A) a planned `MIGRATION_GAP` in this design, (B) future domain evidence insufficiency with separately approved validity/routing meaning, and (C) runtime/internal failures. A is not a runtime fallback cause; B cannot be inferred from an empty domain field; C must not be disguised as B. Add **no parser cause now**. `SCANNED_PDF`, `PARSE_FAILED` and low-text thresholds do not directly route the structured analyzer. AI remains outside this deterministic design; no provider, model, partial-profile or page-level merge is designed here.

## Existing test reuse audit

There are no independent production work/education/project function exports or dedicated section-detector test files. Current coverage reaches the private helpers through the analyzer. Preserve the existing tests unchanged; later add structured-input counterparts using the same anonymous local rule cases, not fabricated unit joins.

| Coverage | Existing evidence to reuse |
| --- | --- |
| Section detector | [`resumeParser.test.ts`](../../tests/resumeParser.test.ts): inline English/Chinese headings. [`resumeParserHardening.test.ts`](../../tests/resumeParserHardening.test.ts): education ends at profile aliases, project heading recognized, no work leakage. No repeated-inline overwrite or opaque-unit edge tests today; add those later. |
| Work | [`resumeStructuredExtraction.test.ts`](../../tests/resumeStructuredExtraction.test.ts): three entries, preserved title order, no project leakage. Passing multiple-work and English-layout cases in [`pdfLineReconstruction.test.ts`](../../tests/pdfLineReconstruction.test.ts) are regression references, not structured source builders. |
| Education | Structured extraction: school/department/status, excluded dates/profile headings. Hardening: combined school/department and section isolation. |
| Projects | Structured extraction: names, tech dictionaries, name+skills admission. Hardening: project dates not work, description/skill retention. Passing multiple-project reconstruction case is a regression reference. |
| Skills/profile and analyzer integration | Parser tests: Java versus JavaScript, alias metadata, normalization fixture, PDF and DOCX end-to-end. Structured extraction: name/basic-info, global skills/directions. Hardening: unresolved name and no guess. RP-079/RP-083 keep empty-domain/routing separation. |
| Source admission | RP-104 42 production-backed contracts and RP-105 5 foundation tests; RP-101 52 and RP-098 49 continue to own upstream admission/order/text. Multi-unit future analyzer cases do not expand current Serialization V1 admission. |

### Minimum next sequence

1. **RP-107: Structured Analyzer Input Migration Contracts**. Lock stream/source correspondence, normalization ownership, boundary-sensitive witnesses, section references/compatibility aggregation, line-sensitive gaps, domain-state continuity and legacy DOCX preservation. Test design only; no production integration.
2. After approval, implement the internal analysis stream/local comparison view and structured section detector together with their contracts. A second nested normalized source document is unnecessary; do not create a separate RP solely for a type alias.
3. Adapt analyzer/domain input traversal using existing local rules and profile result shape, gated by anonymous parity cases where boundaries are authoritative and conservative abstention where they are not. Keep legacy entry intact. PDF parser/service routing integration requires a separate later explicit approval and is not bundled into this implementation sequence.

### Anonymous RP-107 corpus (specification only; no tests written)

| Case | Required assertion |
| --- | --- |
| Single page / single unit | Exact raw refs, local comparison, unchanged source, existing profile-rule reuse without a flat field. |
| Multiple pages with no semantic page break | Typed transitions, authoritative traversal, continuous current section/pending domain state; no inserted text or automatic flush. |
| Source-embedded LF / CRLF / CR | Raw spans/break spelling preserved; source-local line candidates differ from unit transitions; consecutive/terminal breaks and empties retained. |
| Multiple units without authored LF | Distinct fragments and unknown adjacency; no synthetic line, whitespace or cross-unit regex witness. |
| Heading unit then content unit | Whole-fragment alias recognition establishes section; following body reference separate; no `unit = line` or joined string. |
| Section crossing page boundary | One semantic section with body refs on both pages; title/date separately supported within that section may carry state without a page flush. |
| Empty / whitespace unit | Complete coverage and provenance; lexical skip is not source deletion, routing or new section evidence. |
| Lexical normalization | Full-width/compatibility input, tabs/spaces, trim-for-comparison; original text unchanged and offsets honest. Control fusion and newline-consuming bullet normalization prohibited. |
| Global legacy regex | Same-unit alias/phrase and source newline context; dictionary-order / longest-alias priority across pages, career predicate folds and count-only warnings. |
| Cross-unit legacy assumption | `REST` / `API`, `Java` / `Script`, `machine` / `learning`, split date/name/label-value: no inferred characters, no false edge delimiter or positive match. |
| Repeated heading / inline / middle dot | Direct-inline replacement versus middle-dot append, empty section presence, detected-key first order, raw subrange provenance; no alias substring repair. |
| Domain window / state limits | Name first-14 and education-three-record cases with explicit source breaks versus opaque unit edges; work pending/trailing rejection, project name+skills/five cap, missing/empty section distinction. |
| Diagnostics / mutation / DOCX | Functional text retained; diagnostics allowlist, frozen inputs and no source mutation; legacy DOCX path and output rules unaffected. |

## Known failure ownership and verification

No upstream reconstruction change is authorized. Two-column and sidebar likely stop at conservative Reading Order before analysis; same-Y separate columns belong to VisualGroup; split CJK belongs to upstream/serialization cohesion; public PDF is a later integration reproducer. These ownership expectations are not new observations from a wired structured pipeline. RP-106 claims to fix **none** of the five failures.

Verification gates: RP-104 42, RP-101 52, RP-098 49; existing parser/hardening/structured-extraction tests; app TypeScript/build; reconstruction 15 passing / the same five failing; full suite with only that set. Source and existing test hashes must remain unchanged. Final run results are reported separately; this ADR does not substitute design claims for executable verification.

Stop after architecture/documentation. Do not start RP-107 contracts, normalization implementation, detector/domain migration, PDF/DOCX integration, AI, OpenRouter, or job-platform work.
