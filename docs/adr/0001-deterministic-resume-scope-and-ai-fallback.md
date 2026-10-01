# Deterministic resume scope and optional AI fallback

Status: Accepted architecture; implementation deferred (RP-077, 2026-09-26).

The deterministic parser remains the primary, local, zero-marginal-API-cost path. When valid input has genuinely insufficient structural evidence, it must abstain instead of guessing; an optional, separately consented AI parser may later handle the whole document. Invalid inputs and implementation failures remain hard failures, never silent AI successes. This choice favors correctness, privacy, cost control, and clear failure attribution over apparent parsing coverage.

## Evidence and current state

RP-073 found 12/12 Graph + HLE exact-equivalent matched opposites. RP-075 found graphics to be new but negative-reproducible evidence. RP-076 found that non-semantic marked structure can also be copied across opposite ground truth. None grounds a new VisualGroup split policy.

This is a **target architecture**, not a description of the current end-to-end path. `VisualGroupFormationResult` already has `RESOLVED`, `INSUFFICIENT_EVIDENCE`, and `FAILED`, but `parsePdfResume` currently calls the legacy `reconstructPdfPage` and does not consume that result. `parseResumeFile` currently exposes file errors and a flat `ParsedResumeFile`, not the document-level classification below. No behavior changes are approved by this ADR.

## Decision boundary

| Future document outcome | Meaning | Next action |
| --- | --- | --- |
| `DETERMINISTIC_SUCCESS` | Every parsing-critical page and every required downstream stage has approved evidence and valid contracts. | Use the deterministic structured extraction candidate; send it to user review, not AI by default. |
| `FALLBACK_ELIGIBLE` | The file is valid and the deterministic implementation worked, but an explicitly classified limitation prevents a safe complete interpretation. | If enabled and consented, try the separate fallback parser; otherwise offer a clear unsupported/needs-manual-review path. Never publish a guessed deterministic result. |
| `HARD_FAILURE` | Validation, extraction, runtime, contract, or internal consistency failed. | Report a user-safe error and retain privacy-safe diagnostics for engineering. Do not call AI to mask it. |

`RESOLVED` at VisualGroup level certifies only that page grouping contract. The deterministic document path still needs future Region / Column, Reading Order, Serialization, and resume-field extraction before it may claim document success. Missing optional fields in an otherwise sound document are not by themselves structural insufficiency.

`INSUFFICIENT_EVIDENCE` means ambiguity in valid evidence, including two-column, sidebar, and same-Y opposite layouts. Preserve the state and reason; do not turn it into `FAILED`, a forced merge/split, or a successful flat-text parse. `FAILED` means a broken invariant or implementation failure and has no automatic fallback edge. Semantic AI reasoning must not be fed back into deterministic VisualGroup formation to relabel it `RESOLVED`.

## Classify unavailable and rejected inputs

Classification is by **validated cause**, not by the spelling of a current error code. An upstream PageLayoutEvidence `UNAVAILABLE / INSUFFICIENT_CALIBRATION` on otherwise valid content is potentially fallback-eligible. PageLayoutEvidence `FAILED` and VisualGroup `FAILED` are hard failures. A valid PDF page with an unsupported rotation is a future fallback candidate only if the selected fallback can process that orientation; invalid page geometry metadata is not. Corrupt PDF data, extraction/runtime exceptions, unsupported file type, empty file, and file-size rejection are not automatic AI routes.

The current `SCANNED_PDF` error is triggered by a low extracted-character count, not proof that the PDF is image-only. A future `FALLBACK_ELIGIBLE_VISUAL` classification requires separately confirming a valid PDF with no usable text layer and a visual-capable fallback. A sparse but valid text resume must not be silently reclassified as scanned. The current generic `PARSE_FAILED` also requires cause-level triage before any fallback decision.

DOCX is classified separately. PDF candidate-split ambiguity does not imply DOCX ambiguity. A DOCX conversion warning alone is not fallback eligibility; valid but genuinely unsupported content can be evaluated in a DOCX-specific decision, while corrupt files and unexpected conversion failures remain errors. No DOCX fallback is approved here.

## Granularity and fallback inputs

Choose `WHOLE_DOCUMENT` for a future fallback: if any parsing-critical page is insufficient, do not merge deterministic fields from other pages with AI fields. Whole-document handling avoids ambiguous provenance, duplicate suppression, and cross-page chronology. Blank pages may be excluded only with positive evidence; uncertain pages stay critical. Any hard failure on any page blocks automatic fallback rather than being diluted by another insufficient page.

The future input choice remains provider-neutral. Flattened raw text is smallest but can discard the layout needed to resolve candidate splits; structured page text runs preserve coordinates but may still miss visual organization; rendered pages can expose layout but increase data transfer and processing; a direct document upload depends on provider capability and terms. Evaluate visual-capable page input or direct-file input for PDF ambiguity before selecting a provider, with data minimization and anonymous matched-case evaluation. Do not assume raw-text-only fallback solves the known ambiguity. No rendering, OCR, prompt, or provider integration is authorized here.

## Structured output and human authority

A future fallback must return a validated, fixed extraction candidate using the existing resume-domain types: `name`, `skills`, `workExperiences`, `education`, `projects`, and `careerDirections` from `ResumeProfile`, `WorkExperience`, `ResumeEducation`, and `ResumeProject`. Do not invent a second production profile model. The orchestrating application, not the model, owns `id`, timestamps, parser provenance/metadata, and derived display or matching values such as `level` and `abilities`.

Unknown values use the current schema's empty representation: `name: ''`, empty arrays for collections, empty education strings, and omission of optional work/project properties. Omit an entry when a required `title` or project `name` cannot be supported; do not invent employer, date, degree, skill, or career direction. No numeric confidence score or threshold is authorized. Any future explicit present/missing/uncertain field state requires a separate schema decision.

Both deterministic and AI candidates go through the existing editable `ResumeReview` confirmation flow. An AI candidate is never authoritative, never silently saved, and an unknown name remains blank for the user to supply. Fallback disabled, declined, unavailable, or unsuccessful must leave a clear manual/correction path rather than an apparently complete profile.

## Security, privacy, and cost

The existing UI promises that raw resume files stay in the browser. External fallback would change that promise: before enabling it, disclose exactly what data leaves the device, obtain explicit user consent, and update the UI copy. Resume names, contact details, employment, and education are sensitive. Send only the minimum approved input, use transport protection, define retention/deletion and provider privacy terms, and keep raw files, full text, rendered pages, prompts, responses, and filenames out of diagnostics by default. Privacy-safe reason codes and counts may be retained for engineering.

An external AI credential must never be in React, the Vite bundle, `VITE_*`, a browser extension, or browser storage. If a provider is later selected, requests cross an approved server-side secret boundary (a Supabase Edge Function secret is only one possible option). OpenRouter is a candidate, not an approved provider. Before any provider implementation, verify key authorization, credits/limits, model availability, price, retention and privacy terms, and expected cost. Do not use a teacher-provided key by assumption.

Preserve the near-zero-cost preference: deterministic first; call a paid fallback only for classified eligible documents when the feature is enabled and the user has consented. No AI call is made for ordinary deterministic success or to hide a hard failure.

## Consequences and follow-up gate

The architecture deliberately leaves some valid resumes unresolved. That is preferable to ungrounded parsing. Future work should first design a document-level outcome/provenance contract and privacy-safe triage for current coarse errors, then validate fallback inputs and user consent with anonymous PDFs and DOCX cases. It must not implement a VisualGroup heuristic, provider adapter, Edge Function, Region / Column, Reading Order, or serialization as part of RP-077.
