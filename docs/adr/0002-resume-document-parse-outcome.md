# Document-level resume parse outcome and provenance

Status: Accepted architecture; implementation deferred (RP-078, 2026-09-26). Extends [ADR 0001](0001-deterministic-resume-scope-and-ai-fallback.md).

A future document router returns one outcome for the whole resume. It absorbs PDF/DOCX parser details and never asks the UI or a future fallback layer to interpret VisualGroup, calibration, PDF.js, or DOCX conversion internals. This is a design contract, not a new TypeScript type or current application behavior: today `parseResumeFile` still returns flat text or throws `ResumeFileError`, and PDF reconstruction still uses the legacy path.

## Conceptual contract

```text
ResumeParseOutcome =
  DETERMINISTIC_SUCCESS {
    candidate: ResumeProfile, candidateProvenance: DETERMINISTIC,
    parserVersion, safeDiagnostics?
  }
  | FALLBACK_ELIGIBLE {
    reason, deterministicAttemptProvenance, safeDiagnostics?
  }
  | HARD_FAILURE {
    reason, retryClass, deterministicAttemptProvenance, safeDiagnostics?
  }
```

This is a conceptual discriminated union, not a production enum or duplicate domain model. Exactly one branch is returned. `DETERMINISTIC_SUCCESS` requires a valid candidate suitable for `ResumeReview`, after extraction, layout reconstruction, serialization, domain-field parsing, and validation have all completed for every parsing-critical page. A page-level VisualGroup `RESOLVED` satisfies only one local contract. Missing optional resume fields, represented as empty values under the existing schema, do not alone invalidate a structurally sound candidate.

`FALLBACK_ELIGIBLE` means valid input and a correctly operating deterministic implementation, but insufficient evidence or an explicitly supported valid representation that the path cannot process. It carries **no candidate or partial `ResumeProfile`**. `HARD_FAILURE` includes rejected/unreadable input, a broken contract, unexpected runtime failure, or invalid internal state. It also carries no candidate, and it must never invoke AI to conceal the failure. A deterministic attempt may have extracted fields before either non-success outcome; those fields are discarded as a public result. Only privacy-safe diagnostic facts may remain.

## Reasons and diagnostics

The routing layer owns a small, format-neutral, user-safe reason vocabulary; Layer 3 owns localized copy. Proposed reason families, subject to naming review at implementation:

| Branch | Safe reason | Meaning |
| --- | --- | --- |
| Fallback eligible | `INSUFFICIENT_STRUCTURE` | Valid content has unresolved layout/grouping evidence. |
| Fallback eligible | `UNSUPPORTED_VALID_REPRESENTATION` | Valid content uses a representation unsupported by this deterministic path. |
| Fallback eligible | `NO_USABLE_TEXT` | A valid document is positively established to have no usable text layer and a suitable visual fallback exists. |
| Hard failure | `INPUT_REJECTED` | File type, size, empty/blank input, or another validated admission rule rejects it. |
| Hard failure | `DOCUMENT_UNREADABLE` | File/read/decode failure or corrupt document prevents safe processing. |
| Hard failure | `PARSER_FAILURE` | Unexpected execution, contract, or internal-state failure. |

Reasons are **not** UI sentences and do not reveal implementation codes. A separately protected, allowlisted diagnostic can retain only `format`, `stage`, `internalCode`, `pageNumber` when applicable, and safe numeric counts. It must not carry raw resume text, field values, names, contact data, filenames, font names, full geometry, rendered pages, or exception messages that may contain document content. For example, `INSUFFICIENT_STRUCTURE` can retain page 2 plus VisualGroup `INSUFFICIENT_EVIDENCE` as an engineering cause without exposing either to the UI. Internal codes do not expand the routing taxonomy.

## Aggregation and precedence

For V1, every page containing possible resume content is parsing-critical; do not rank pages by position or invent an importance threshold. A page is excluded as blank/irrelevant only with a separately validated reason. An uncertain page remains critical.

1. Any critical page or required downstream stage with a verified hard failure makes the **whole document `HARD_FAILURE`**, regardless of successes or insufficiency elsewhere.
2. Otherwise, any critical page or required stage with validated insufficient evidence or approved unsupported representation makes the **whole document `FALLBACK_ELIGIBLE`**.
3. Only when all critical pages and all required stages complete with valid contracts may the document be `DETERMINISTIC_SUCCESS`.

This precedence is independent of page order: a later success cannot erase an earlier failure. The future fallback unit remains the whole document, not a page/field-level merge. No partial deterministic candidate is sent to Review or merged with AI fields. A valid, positively identified blank document is rejected as lacking resume content, not labeled image-only. An unclassified zero-run page must first be distinguished from a valid image-only page and broken extraction; it is not automatically eligible.

## Layer 1 to Layer 2 mapping

| Internal observation | Routing interpretation |
| --- | --- |
| PageLayoutEvidence `AVAILABLE` and VisualGroup `RESOLVED` | Continue downstream; **not** document success yet. |
| VisualGroup `INSUFFICIENT_EVIDENCE` on valid input | `FALLBACK_ELIGIBLE / INSUFFICIENT_STRUCTURE`. |
| PageLayoutEvidence `UNAVAILABLE / INSUFFICIENT_CALIBRATION` on validated, substantive content | `FALLBACK_ELIGIBLE / INSUFFICIENT_STRUCTURE`. The `UNAVAILABLE` word alone is insufficient. |
| Valid text-bearing PDF with a separately validated unsupported layout | `FALLBACK_ELIGIBLE / UNSUPPORTED_VALID_REPRESENTATION`. |
| Valid PDF with positively established no usable text layer | Potential `FALLBACK_ELIGIBLE / NO_USABLE_TEXT`, only when a visual-capable path is approved; otherwise remain safely unsupported. |
| PageLayoutEvidence or VisualGroup `FAILED`, invariant or Graph/HLE mismatch | `HARD_FAILURE / PARSER_FAILURE`; preserve safe internal stage/code. |
| Extraction/runtime failure or corrupt file | `HARD_FAILURE / DOCUMENT_UNREADABLE` or `PARSER_FAILURE` by verified cause; never infer fallback eligibility from an exception alone. |

`ROUTING_REQUIRES_FUTURE_CLASSIFICATION` is a **design gate, not a fourth outcome**. Where today's signal does not establish a row above, the future router must first classify the cause. Until then, preserve the current safe error behavior and do not emit an AI-eligible result merely to fill the contract.

### Existing coarse errors

| Current signal | Future mapping requirement |
| --- | --- |
| `UNSUPPORTED_FILE`, `FILE_TOO_LARGE`, `EMPTY_FILE` | Validated admission rejection -> `HARD_FAILURE / INPUT_REJECTED`; no AI. |
| `PDF_PAGE_GEOMETRY_INVALID` | Invalid page metadata -> hard failure after cause validation; no AI. |
| `PDF_PAGE_GEOMETRY_UNSUPPORTED` | Currently represents unsupported rotation, but the adapter returns before fully validating `page.view`; verify PDF/page validity and fallback capability before considering `UNSUPPORTED_VALID_REPRESENTATION`. Not automatically eligible. |
| `SCANNED_PDF` | Current threshold is fewer than 40 non-whitespace extracted characters, **not** proof of an image-only PDF. `ROUTING_REQUIRES_FUTURE_CLASSIFICATION`; sparse text, true image-only, and extraction failure must be separated. |
| `PARSE_FAILED` | Covers both too little text and wrapped unexpected exceptions. `ROUTING_REQUIRES_FUTURE_CLASSIFICATION`; never map the code wholesale to fallback. |
| `DOCX_PARSER_WARNING` | A warning on a candidate, not a document routing outcome. Investigate its specific content only if a future DOCX contract requires it. |

The outcome shape is format-neutral; cause classification is not. PDF-specific layout ambiguity must not be projected onto DOCX. A valid DOCX limitation needs its own evidence and mapping; corrupt DOCX or unexpected conversion failure is hard. The image-only PDF route remains conditional on a reliable classifier and approved visual fallback, not on the current `SCANNED_PDF` label.

## Candidate provenance and consent

Keep routing and provenance **outside** `ResumeProfile`. A final review candidate is wrapped with `source: DETERMINISTIC | AI_FALLBACK` and parser-path/version metadata. A deterministic success produces a `DETERMINISTIC` candidate. A future AI result, if invoked, produces a separate `AI_FALLBACK` candidate; it does not rewrite the original `FALLBACK_ELIGIBLE` routing outcome into deterministic success. Provider/model details, if ever retained, belong only in restricted implementation metadata, not required resume-domain fields.

The existing `ResumeProfile.parseMetadata` is legacy compatibility data; it is not permission to add new routing status, AI provider, or model fields to the profile. Any future reconciliation of that field is separate work. The user remains the final confirmer in `ResumeReview`; neither path silently saves a candidate.

`FALLBACK_ELIGIBLE` is permission to **offer**, not invoke, fallback. A future invocation requires feature/policy enablement and explicit user consent before document data leaves the browser. Declined or unavailable fallback leaves a clear manual/correction path. `HARD_FAILURE` has no AI edge, with or without consent.

## Retry and version semantics

`retryClass` is conceptual: `TRANSIENT`, `NOT_RETRYABLE`, or `UNCLASSIFIED`; it is not a retry mechanism. Only a verified transient read/runtime condition warrants offering retry. Contract violations and invalid files are not fixed by automatic retry; `FALLBACK_ELIGIBLE` is not fixed by rerunning identical deterministic evidence. Unknown cause does not authorize retry or AI.

For the same document, parser version, configuration, and deterministic evidence, the routing outcome and safe reason must be stable. Provider availability or randomness must not affect deterministic classification. A later parser version may legitimately turn `FALLBACK_ELIGIBLE` into `DETERMINISTIC_SUCCESS`; do not persist routing status as permanent user truth without versioned provenance. Do not log a raw-document fingerprint by default.

## Follow-up gate

Next work should design and test cause-level classification for the current coarse errors and the document-level contract with anonymous PDF/DOCX controls before wiring routing. No parser, UI, Region / Column, Reading Order, Serialization, provider, prompt, Edge Function, or persistence implementation is authorized by RP-078.
