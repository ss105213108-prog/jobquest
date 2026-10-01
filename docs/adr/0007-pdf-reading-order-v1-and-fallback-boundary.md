# PDF Reading Order V1 and document fallback boundary

Status: Accepted architecture (RP-097, 2026-09-27); contracts and implementation deferred. This selects a conservative V1 response to the `NO_APPROVED_READING_PRECEDENCE_SIGNAL` blocker recorded in [ADR 0006](0006-pdf-reading-order.md). ADR 0006 remains the evidence record: its counterexample and rejection of `Y_ABOVE` as precedence still hold. RP-097 supersedes only its condition that a general multi-group precedence mapping must be found before *any* V1 Reading Order boundary can be selected.

## Decision and coverage

Reading Order is page-local and consumes only a validly admitted PageLayout `AVAILABLE`, VisualGroup `RESOLVED`, and SpatialStructureGraph `RESOLVED` for the same page and evidence. The existing [admission guard](../../src/parsers/pdfSpatialStructureGraph.ts) validates the complete node inventory and evidence identity; admission permits the stage to run, but does not prove an order. A non-admitted upstream result is not a Reading Order insufficiency.

| Admitted page and stage observation | V1 result | Authoritative sequence |
| --- | --- | --- |
| Exactly one authoritative VisualGroup | `RESOLVED` | `[G1]`, that canonical group exactly once, even with zero spatial facts |
| Multiple authoritative VisualGroups, with no separately approved precedence evidence | `INSUFFICIENT_EVIDENCE` | None |
| Invalid input or contract, broken evidence identity, malformed/incomplete node inventory, or internal/runtime failure | `FAILED` (or rejected before stage admission) | None |

The multiple-group row is the entire currently supported V1 policy, even if `Y_ABOVE` facts form an apparently unique geometric chain. Zero facts are valid spatial evidence but do not turn multiple groups into one sequence. A zero-group page cannot yield `RESOLVED`; its upstream validity and exclusion/blankness must be classified separately. `INSUFFICIENT_EVIDENCE` means valid input and normal implementation with no approved authoritative sequence, not a failed parser or invalid PDF. A future result contract must distinguish the three states and forbid a sequence payload for either non-resolved state. It may expose only stable, privacy-safe page and count diagnostics.

V1 does not assert that future multi-group PDFs can never be deterministic. A V2 extension requires a separate, independently adjudicated precedence signal and approval against ambiguous layouts. For V1, geometry-only Reading Order research is **frozen**: no `Y_ABOVE`-as-precedence, left/right ordering, Region ownership, track/column heuristic, geometry tie-break, stable/node-ID sorting, or input/PDF content-order fallback. `X_DISJOINT` and `X_OVERLAP` carry no precedence either. Semantic ordering is also not a V1 substitute. No further geometry-only investigation is required to implement this limited V1 contract.

## Serialization and document completion

Authoritative Serialization may execute only after Reading Order `RESOLVED`, using its complete canonical sequence. `INSUFFICIENT_EVIDENCE` and `FAILED` stop deterministic Serialization for that page: no partial sequence, unordered list presented as order, concatenated text, or partial `ResumeProfile`. Reading Order does not decide newline, spacing, or resume fields. It does not reorder pages. Later document composition follows the canonical PDF page sequence as a separate concern.

A single-group page is only a local stage success. A document with one or more such pages may become `DETERMINISTIC_SUCCESS` only after every parsing-critical page has a resolved order and Serialization, downstream domain parsing, profile validation, and other required stages complete. This decision does not route every PDF to fallback.

## Preserved cause and classification

Add the conceptual, **page-scoped** PDF parser cause `PDF_READING_ORDER_INSUFFICIENT` in a later contract/implementation item. It is emitted only when a validly reached Reading Order stage, operating normally, returns `INSUFFICIENT_EVIDENCE` because approved evidence cannot establish one authoritative sequence. Retain the actual one-based page scope. Do not infer it from group count before stage admission, legacy `SCANNED_PDF` or `PARSE_FAILED`, sparse text, scanned/image-only speculation, semantic-analysis failure, or an exception. Cause identity must survive the legacy compatibility projection; a projected legacy code must never become classifier input.

This is an evidence-backed integration gap in the RP-083/RP-084 cause foundation and a narrow exception to the RP-084 cause freeze, not a reopening of unrelated PDF or DOCX causes. The current [cause model](../../src/parsers/resumeParserCause.ts) does **not** recognize this code or its Reading Order phase; the [document outcome foundation](../../src/parsers/resumeDocumentOutcome.ts) does **not** allow a `reading-order` diagnostic stage. A later tested adapter must extend the relevant type, validation, stage ordering, classification and privacy allowlists before the cause can route. This ADR does not claim that current runtime emits or classifies it.

The cause is not itself the document outcome. For the intended `FALLBACK_ELIGIBLE / INSUFFICIENT_STRUCTURE` classification, require independent `CONFIRMED_VALID` evidence for the relevant `FILE` admission, `DOCUMENT` container, target `PAGE` structure and evidence, and substantive `CONTENT` predicates under [ADR 0003](0003-parser-cause-and-validity-classification.md), plus normal implementation and completed required preceding stages. No scope's validity may be borrowed from another. `UNKNOWN` on a required claim remains classification-required, not fallback or success. A `CONFIRMED_INVALID` required claim blocks fallback and is handled by its verified invalid-input/hard-failure cause; it must not be relabeled as Reading Order insufficiency. A low-text threshold proves none of these claims. Fallback eligibility is a deterministic classification and does not depend on provider availability or user consent to run AI later.

A Reading Order exception, invalid graph, evidence identity mismatch, malformed result, or other contract/internal failure is a hard parser failure (`HARD_FAILURE / PARSER_FAILURE` when verified), never `PDF_READING_ORDER_INSUFFICIENT` and never an AI escape hatch. The later contract must preserve its stage-accurate operational cause without laundering it through the insufficiency code. This decision does not select an additional failure code or change the existing cleanup-after-success deferral.

## Whole-document boundary

Preserve [ADR 0002](0002-resume-document-parse-outcome.md) precedence: `HARD_FAILURE > FALLBACK_ELIGIBLE > DETERMINISTIC_SUCCESS`. A verified hard failure anywhere required wins. Otherwise, one parsing-critical page with confirmed-valid Reading Order insufficiency makes the **whole document** `FALLBACK_ELIGIBLE / INSUFFICIENT_STRUCTURE`, even if other pages resolved. An unclassified required validity claim gates both fallback and success until classified; it is not a fourth public outcome. No partial deterministic `ResumeProfile` is returned, and no page-level deterministic/AI merge is allowed. For example, a resolved page 1 and insufficient page 2 produce a whole-document fallback candidate, not a mixed profile.

Eligibility permits a future whole-document fallback offer; it does not invoke AI. Future fallback still requires explicit user consent before external resume transmission, a separately enabled path, a server-side secret (never a client-side key), and a fixed `ResumeProfile`-compatible candidate followed by `ResumeReview` and user confirmation. OpenRouter API work and model selection remain deferred. No production parser, Serialization, routing adapter, AI path, or authoritative runtime switch is made here; `NO_PRODUCTION_SHADOW` remains active.

## Existing failures and follow-up

The five known reconstruction failures are not fixed by this decision. Two-column and sidebar may later reach Reading Order insufficiency on valid admitted input; same-Y separate columns may stop earlier at VisualGroup; split CJK heading remains a VisualGroup/Serialization concern; the public PDF reproduction is an end-to-end integration check. None is automatically reclassified by a current legacy failure.

Next work should lock executable V1 Reading Order result, admission, privacy, cause/validity and document-aggregation contracts, then implement the isolated stage and later integrate through separately reviewed tickets. The V1 result contract should prove singleton resolution and multi-group abstention under node/fact permutation, including zero-fact and misleading vertical-chain cases, while malformed evidence stays failure. This ADR authorizes no tests or production changes in RP-097.
