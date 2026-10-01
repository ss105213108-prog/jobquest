# Cause-preserving parser classification and validity evidence

Status: Accepted architecture; implementation deferred (RP-082, 2026-09-26). Extends [ADR 0002](0002-resume-document-parse-outcome.md).

The future parser boundary records what happened before it decides what that event means for document routing. PDF and DOCX retain separate, small cause families; scoped validity evidence and implementation-integrity evidence then support or block a routing decision. Legacy `SCANNED_PDF` and `PARSE_FAILED` are compatibility projections, never inputs from which a cause or outcome is reconstructed. This is a design, not a production classifier or parser change.

## Current evidence and decision boundary

RP-081 traced the current path: `validateResumeFile` checks extension, MIME and size; `parsePdfResume` loads a PDF, admits page geometry, extracts text, and uses the legacy line reconstructor; `parseDocxResume` uses Mammoth raw-text conversion. `parseResumeFile` then rejects PDF text under 40 non-whitespace characters as `SCANNED_PDF`, DOCX text under 10 as `PARSE_FAILED`, and wraps other unrecognized parser exceptions as `PARSE_FAILED`. The threshold checks do not inspect images, prove a blank page, verify content completeness, or separate library failure from valid unsupported representation. The original exception may remain as a JavaScript `cause`, but the public error code loses structured stage and cause identity; exception messages are not safe routing data.

The production [document outcome foundation](../../src/parsers/resumeDocumentOutcome.ts) already defines three whole-document states and accepts only already-classified stages. It is not imported by the current parsers. PageLayoutEvidence and VisualGroup are independent production modules, not the authoritative PDF runtime path. No production shadow path is implied by this ADR.

The intended direction is:

```text
observed parser event
  -> format-specific, cause-preserving internal record
  -> scoped validity and implementation-integrity evidence
  -> classified stage meaning (or classification-required gate)
  -> document aggregation and completed-profile boundary
  -> optional legacy result/error projection for existing consumers
```

An unclassified cause is an internal gate, not a fourth public `ResumeParseOutcome`. Until classification is justified, preserve current safe behavior; do not manufacture fallback eligibility or deterministic success. The adapter must consume preserved records, never `ResumeFileError.code`.

## Cause model

The conceptual internal record has a format discriminator and one format-specific cause family, a stage, optional one-based page number, optional safe counts, an allowlisted library category only when a stable typed contract proves it, and an `exceptionPresent` fact. It can carry a classifier/version identifier for reproducibility. It must not carry a raw `Error.message`, filename, path, resume field, text run, page rendering, or arbitrary `details` string as routing data. A local exception object may remain for existing error chaining, but it is not serialized into diagnostics or used through message-pattern heuristics.

PDF cause families are: admission rejection; read failure; document load failure; page load failure; text extraction failure; invalid geometry; unsupported geometry; reconstruction failure; content insufficient or unknown; layout evidence unavailable; layout evidence failed; VisualGroup insufficient; VisualGroup failed; and domain-analysis failure. Cleanup failure is recorded separately as a lifecycle cause pending the decision below. These are family distinctions, not one code per PDF.js exception. A positive, evidence-backed blank or image-only finding would be a future classifier finding attached to the content family, not inferred from `SCANNED_PDF`.

DOCX cause families are independent: admission rejection; read failure; conversion failure; valid but unsupported representation only if future evidence establishes it; content insufficient or unknown; domain-analysis failure; and warning-only conversion. PDF geometry, PageLayout and VisualGroup terms do not appear in DOCX causes. Shared admission policy can be reused without merging the format-specific cause models into a giant enum.

Cause identity and routing meaning remain distinct. A valid document with an internal contract violation is still a hard failure. A suspected unsupported representation with unknown validity is not fallback eligible. A warning or absent optional domain field is not a parser failure.

## Scoped validity evidence

Validity is a set of claims, not one global boolean. Every claim identifies its scope (`FILE`, `DOCUMENT`, `PAGE`, or `CONTENT`), the specific predicate being evaluated, its source facts, and one of `CONFIRMED_VALID`, `CONFIRMED_INVALID`, or `UNKNOWN`. Page claims identify the page. Evidence from one scope cannot silently prove another: a PDF document loading does not validate page 2, and a count of extracted characters does not validate document content or text-layer completeness.

| Scope | `CONFIRMED_VALID` requires | `CONFIRMED_INVALID` requires | `UNKNOWN` includes |
| --- | --- | --- | --- |
| `FILE` | Admission predicate passed and bytes were read under that predicate. This does **not** prove a parseable container. | A specific admission rejection such as unsupported declared format, zero bytes, or size over limit; this is invalid for the supported-input policy, not necessarily proof of corrupt bytes. | Metadata/bytes not checked or a read that did not complete. |
| `DOCUMENT` | Format-aware container/document parsing and required structural checks completed for the claimed predicate. | Positive container corruption or structural invalidity established by a reliable parser contract. | Load failure of unknown category, password/permission condition not reliably classified, or only extension/MIME evidence. |
| `PAGE` | The target page loaded and all geometry/structure required by the proposed route was validated. | Positive page corruption or invalid metadata at that page. | Another page loaded, target `getPage` failed without a classified cause, or admission returned before `page.view` validation. |
| `CONTENT` | The claimed content fact is positively established by a purpose-built check (for example, substantive valid content, proven blankness, or valid visual content with no usable text layer). | Positive evidence that the claimed content condition is false. | Zero/few extracted text items, partial extraction, an uninspected image layer, or no section match. |

`CONFIRMED_VALID` and `CONFIRMED_INVALID` are relative to the stated predicate and scope, never global declarations about every property of the resume. `UNKNOWN` is first-class and cannot be coerced to valid or invalid. Future tests must define the minimum facts for each classifier claim. A fallback decision requires confirmed validity at every scope relevant to that cause, implementation behavior as designed, and an approved path capable of handling the representation. Hard failures can be decided on verified operational/contract failure even when input validity is `CONFIRMED_VALID` or `UNKNOWN`; validity and routing are orthogonal.

## PDF cause-to-routing matrix

`HARD_FAILURE` and `FALLBACK_ELIGIBLE` below mean potential classified stage meaning, not current public parser behavior. When evidence is absent, the route remains classification-required; no fourth document state is emitted. Readiness labels indicate design work, not implementation approval.

| PDF cause | Required validity evidence | Routing if valid / cause verified | If invalid or unknown | Readiness |
| --- | --- | --- | --- | --- |
| Admission rejected (`UNSUPPORTED_FILE`, `EMPTY_FILE`, `FILE_TOO_LARGE`) | Specific admission rule and observed metadata/byte count | `HARD_FAILURE / INPUT_REJECTED`; input content validity is irrelevant | Same rejection; no fallback | `READY_FOR_CONTRACT` |
| Read failure | A typed/located failed byte read, not a text threshold | `HARD_FAILURE / DOCUMENT_UNREADABLE` | Hard failure, with retry class only after transient evidence | `READY_FOR_CONTRACT` |
| PDF document load failed | Typed PDF.js failure or explicit parser phase; do not parse `Error.message` | Classified corruption -> `HARD_FAILURE / DOCUMENT_UNREADABLE`; verified runtime defect -> `PARSER_FAILURE`; password/protection needs its own audited policy | Unknown category stays classification-required for reason/retry, never fallback by default | `NEEDS_CAUSE_SPLIT` |
| Page load failed | Target page and failed operation identified | `HARD_FAILURE / DOCUMENT_UNREADABLE` or `PARSER_FAILURE` by verified cause | Same hard route once operation failure is proved; exact reason needs split | `NEEDS_CAUSE_SPLIT` |
| Text extraction failed | Target page and thrown/rejected extraction operation | `HARD_FAILURE / DOCUMENT_UNREADABLE` or `PARSER_FAILURE` by verified cause | Same hard route; no image-only inference | `NEEDS_CAUSE_SPLIT` |
| Geometry invalid | Actual invalid rotation metadata or `page.view` contract, with page number | `HARD_FAILURE`; input-vs-contract subreason retained | Hard failure, never fallback | `READY_FOR_CONTRACT` |
| Geometry unsupported (`UNSUPPORTED_PAGE_ROTATION`) | Valid container, target page, validated `page.view` and relevant content, plus an approved capable alternate path | `FALLBACK_ELIGIBLE / UNSUPPORTED_VALID_REPRESENTATION` only after all proofs | Invalid structure -> hard; unknown -> classification-required | `NEEDS_VALIDITY_CLASSIFIER` |
| Legacy reconstruction threw | Exact reconstruction phase and failed operation | `HARD_FAILURE / PARSER_FAILURE` | Hard failure; no fallback | `READY_FOR_CONTRACT` |
| Content insufficient or unknown (`<40` legacy signal, including zero text) | Separate document/page/content validity and extraction-completeness evidence | Sparse valid text alone is **not** fallback. Proven blank -> `HARD_FAILURE / INPUT_REJECTED`. Positively established valid visual content with no usable text layer plus approved visual path may be `FALLBACK_ELIGIBLE / NO_USABLE_TEXT`. | Unknown cause -> classification-required; extraction failure -> hard by its own cause | `NEEDS_VALIDITY_CLASSIFIER` |
| PageLayout `UNAVAILABLE / INSUFFICIENT_CALIBRATION` | Valid relevant page/content, completed correct evidence construction, and known nonblank substantive runs | `FALLBACK_ELIGIBLE / INSUFFICIENT_STRUCTURE` if evidence is insufficient despite correct operation | Zero-run/unknown content -> classification-required; invalid context -> hard | `NEEDS_VALIDITY_CLASSIFIER` |
| PageLayout `FAILED` | Verified graph/horizontal contract or operational failure | `HARD_FAILURE / PARSER_FAILURE` | Hard even for valid input; preserve safe stage/code | `READY_FOR_CONTRACT` |
| VisualGroup `INSUFFICIENT_EVIDENCE` | Valid admitted page/layout evidence and relevant content | `FALLBACK_ELIGIBLE / INSUFFICIENT_STRUCTURE` after validity proof | Invalid/unknown input -> classification-required or hard by separate invalid cause | `NEEDS_VALIDITY_CLASSIFIER` |
| VisualGroup `FAILED` | Verified formation/validation failure code | `HARD_FAILURE / PARSER_FAILURE` | Hard even for valid input | `READY_FOR_CONTRACT` |
| PDF domain analysis threw | Exact analyzer phase and unexpected exception presence | `HARD_FAILURE / PARSER_FAILURE` | Hard; do not reinterpret empty fields as a thrown failure | `READY_FOR_CONTRACT` |
| Cleanup failed | Identify primary vs secondary failure and resource/correctness impact | **Deferred**: hard versus diagnostic-only when parse otherwise succeeded | Never replace an existing primary cause; no fallback inference | `NEEDS_FOCUSED_INVESTIGATION` |

An ordinary successful PDF extraction is only a stage success. It is not `DETERMINISTIC_SUCCESS` until all parsing-critical pages, downstream stages, and a valid `ResumeProfile` are complete. The current legacy reconstruction can produce misleading nonempty flat text and an analyzer profile despite the five known reconstruction test failures; those failures are not automatically fallback or hard outcomes.

## DOCX cause-to-routing matrix

| DOCX cause | Required validity evidence | Routing if valid / cause verified | If invalid or unknown | Readiness |
| --- | --- | --- | --- | --- |
| Admission rejected | Specific supported-input policy failure | `HARD_FAILURE / INPUT_REJECTED` | Same rejection; no fallback | `READY_FOR_CONTRACT` |
| Read failure | Failed byte read located before conversion | `HARD_FAILURE / DOCUMENT_UNREADABLE` | Hard; retry needs transient proof | `READY_FOR_CONTRACT` |
| Conversion failed | Container/XML/library phase and reliable typed category, not exception text | Verified corrupt DOCX -> `HARD_FAILURE / DOCUMENT_UNREADABLE`; unexpected library/runtime failure -> `PARSER_FAILURE` | Unknown library rejection needs cause split; not automatically fallback | `NEEDS_CAUSE_SPLIT` |
| Valid but unsupported representation | Container and relevant XML validity, positive content evidence, explicit Mammoth/adapter limitation, approved capable alternate path | `FALLBACK_ELIGIBLE / UNSUPPORTED_VALID_REPRESENTATION` only after these proofs | Invalid -> hard; unknown -> classification-required | `NEEDS_VALIDITY_CLASSIFIER` |
| Content insufficient or unknown (`<10` legacy signal) | DOCX-specific content and conversion-completeness classifier | Proven blank -> `HARD_FAILURE / INPUT_REJECTED`; a future positively proven valid unsupported content representation may be fallback eligible | Unknown -> classification-required; conversion failure -> hard by its own cause | `NEEDS_VALIDITY_CLASSIFIER` |
| Domain analysis threw | Exact analyzer phase and exception presence | `HARD_FAILURE / PARSER_FAILURE` | Hard; missing optional fields are not this cause | `READY_FOR_CONTRACT` |
| Conversion warning only (`parserMessages`) | Conversion completed and warning identity audited separately | Non-fatal stage success by default; no routing change | Unknown warning meaning does not grant fallback | `NEEDS_FOCUSED_INVESTIGATION` only if a warning is proposed for routing |

There is currently no proven DOCX fallback-eligible cause in the runtime. A successful conversion with empty name, education, work, projects, or skills remains a domain extraction result, not evidence of invalid input or of a fallback route. The analyzer's `DOCX_PARSER_WARNING` is not a substitute for a typed warning contract.

## Proof boundaries

The existing `<40` PDF and `<10` DOCX thresholds have **no routing or validity role**. They may remain in the temporary legacy projection, but cannot prove corruption, image-only input, unsupported layout, or AI eligibility.

`PROVEN_BLANK` requires a validated container and all parsing-critical pages, successful relevant extraction/inspection, and positive evidence that no substantive resume text or visual content exists; absence of extracted text alone is not proof. `LOW_TEXT_UNKNOWN` retains unknown content validity. `EXTRACTION_FAILED` is a distinct operational cause even when its partial output is empty. A future image-only PDF claim requires a valid PDF and pages, positive page visual/image content, positive evidence that no usable text layer exists, and an approved visual-capable fallback. This ADR specifies proof obligations, not an image detector or OCR path.

Nonzero PDF rotation is detected before `page.view` validation and text extraction today. The rotation is an observed unsupported representation, not proof that the PDF/page/content is otherwise valid. PageLayout `UNAVAILABLE` likewise preserves `INSUFFICIENT_CALIBRATION` but cannot route on the word `UNAVAILABLE`; zero-run or unknown-content cases need a validity classifier. VisualGroup `RESOLVED` is a stage success, `INSUFFICIENT_EVIDENCE` is conditional on validity, and `FAILED` is a hard stage failure. None is currently wired into `parsePdfResume`.

## Multiple causes, cleanup, and privacy

Retain all independently observed, privacy-safe causes for a document; do not let a later stage success erase an earlier failure. After classification, whole-document precedence remains `HARD_FAILURE > FALLBACK_ELIGIBLE > SUCCESS`. A verified hard failure can win immediately; otherwise, any unclassified cause on a parsing-critical page/stage gates both fallback and success until resolved. Never omit the unknown cause merely to satisfy the three-state result. Select one primary routing cause deterministically: severity first, then one-based page number ascending (document-level cause before pages), then an explicit format-specific phase order, then stable cause code. PDF phase order is admission, read, document load, page load, geometry, extraction, layout, VisualGroup, reconstruction, domain analysis, cleanup. DOCX order is admission, read, conversion, domain analysis, cleanup. These are canonical sorting keys, not a claim about current execution order. The same key orders safe diagnostic projections. Do not use completion or async arrival order. The choice of primary cause must not discard other safe diagnostics or expose a partial profile.

During parsing, record the primary parse cause before running cleanup. A secondary page cleanup or PDF loading-task destroy failure cannot replace it; append only a safe lifecycle fact. If parsing otherwise succeeded but cleanup fails, the hard-failure-versus-diagnostic-only decision is **deferred** pending a focused audit of PDF.js resource and correctness guarantees. No deterministic success or fallback route is authorized from that unresolved situation by this ADR; preserve existing public behavior until decided.

Only format, an allowlisted stage, stable internal code, page number, and approved nonnegative counts may cross into `ResumeParseOutcome.safeDiagnostics`. The current foundation has a narrower stage/code/count allowlist than this conceptual cause record. A future adapter must project only semantically accurate allowlisted fields; any new diagnostic stage or code requires separate contract review and tests. Raw library errors, names, contact data, employer/school, filenames, paths, full geometry, text and rendered pages stay out. `exceptionPresent` is a fact, not permission to serialize an exception.

## Legacy compatibility and migration gate

Keep existing `ParsedResumeFile` and `ResumeFileError` outputs for present UI/service compatibility during migration. A future authoritative path creates the cause-preserved internal result before any legacy projection. It may produce an outcome through a separately tested routing adapter, while existing consumers receive a deliberate legacy projection from the same preserved event. The `SCANNED_PDF` label can temporarily represent the current low-text UX case; it cannot be reverse-mapped to image-only or fallback. `PARSE_FAILED` can remain a catch-all compatibility code; the preserved cause and validity evidence, not that code, decide any future route. No behavior changes are approved by this ADR.

The gated sequence is: (1) executable contracts for format-specific cause records and privacy projection, then cause-preserving internal results; (2) PDF and DOCX validity classifiers with positive/negative/unknown controls; (3) routing adapter consuming only those records and scoped evidence; (4) tested legacy compatibility projection; (5) authoritative parser wiring with atomic document behavior. Each step needs its own review and tests before the next. The first contract tests should cover admission rejection, read/extraction/internal failures, invalid geometry, warning-only results, precedence and primary-cause order, and legacy-code non-equivalence. Low-text, rotation, image-only, DOCX valid-unsupported, and PageLayout `UNAVAILABLE` need validity classifiers first. PDF.js load categories, Mammoth conversion categories, and cleanup semantics need focused cause/contract audits. No Region/Column, Reading Order, Serialization algorithm, provider, AI consent flow, UI, or parser integration is designed or implemented here.
