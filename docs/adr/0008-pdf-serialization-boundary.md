# Conservative PDF Serialization and document composition boundary

Status: Accepted architecture (RP-100, 2026-09-27); contracts and implementation deferred. This follows [ADR 0007](0007-pdf-reading-order-v1-and-fallback-boundary.md) and does not extend Reading Order or Spatial V1 evidence. The current PDF parser still uses legacy reconstruction; `NO_PRODUCTION_SHADOW` remains active.

## Contract audit: three different orders

| Layer | Current production guarantee | What it does not guarantee |
| --- | --- | --- |
| Page Reading Order | A runtime-valid [Reading Order V1 result](../../src/parsers/pdfReadingOrder.ts) resolves exactly one canonical VisualGroup ID as `[G1]`. | It does not order the runs inside G1, format text, or order PDF pages. Multi-group pages stop at Reading Order. |
| VisualGroup membership/internal text | A valid [VisualGroup result](../../src/parsers/pdfVisualGroupResult.ts) assigns every canonical run to exactly one group and checks run references and grouping permissions. The current [V1 formation producer](../../src/parsers/pdfVisualGroupFormation.ts) only resolves a one-run group; its multi-run input abstains. A valid resolved *result contract*, however, permits a group with several runs. | `runIds` is a membership set in an array, not an authoritative sequence. Pair permission, `originalIndex`, group ID, graph array order, PDF TextItem order, and `hasEOL` carry no approved intra-group reading order or joining separator. A VisualGroup is not a text line or resume section. |
| Document page order | The [legacy PDF loader](../../src/parsers/pdfResumeParser.ts) requests `getPage(pageNumber)` for integer pages 1 through `document.numPages`; this is the available canonical PDF page index, independent of page geometry. | An arbitrary array of serialized pages is not itself proof that all pages came from one loaded document, appear once, or cover every parsing-critical page. The new pipeline is not wired to the loader. |

Answer to the internal-order audit: **PARTIAL overall**. One-member membership has a unique run without ordering work; a multi-run `RESOLVED` VisualGroup has **NO** authoritative internal run/text order. Array order is **NO** as an ordering authority. [PageLayout construction](../../src/parsers/pdfPageLayoutEvidence.ts) assigns `originalIndex` by enumerating `items`, and the [canonical run](../../src/parsers/pdfTextGeometry.ts) copies `str` to `GeometryRun.text` without trimming it. Neither operation promotes item enumeration to reading order. The [RowEvidenceGraph builder](../../src/parsers/pdfRowEvidenceGraphBuilder.ts) sorts by `originalIndex` for canonical identity, not text sequence. Even a singleton Reading Order result cannot repair missing intra-group order.

## Selected V1 page boundary

Serialization consumes the *same admitted page evidence* and authoritative VisualGroup inventory used by Reading Order, its runtime-valid `RESOLVED` result, and canonical runs addressed by group membership. Before executing, the future stage must use `canSerializeReadingOrder` or equivalent runtime validation, verify exact page/evidence provenance, resolve each referenced group and run to the current canonical inventory, and reject missing, duplicate, stale, or malformed references. `INSUFFICIENT_EVIDENCE` or `FAILED` from Reading Order means Serialization **does not execute**; neither is re-labeled as a Serialization result. No legacy Region result is required.

The selected minimal output is structured, not flat text:

```text
SerializedPage {
  pageNumber,
  orderedUnits: [SerializedTextUnit { groupId, runId, text }]
}
```

`groupId` and `runId` are internal stable provenance references, not source-order signals or display text. In V1, an admitted page can resolve only when the sole ordered group contains exactly one valid canonical run whose `text` is a string. The page then contains exactly one unit with that run's text **unchanged**. This unit is neither a line nor a paragraph. No random ID, inferred separator, or derived text is added. `RESOLVED` here proves only that the page's available textual unit was serialized without inference; it does not prove substantive content, recognized sections, a complete `ResumeProfile`, or document success.

If a valid admitted one-group page contains multiple runs, current contracts supply neither a unique internal sequence nor a separator. Serialization returns `INSUFFICIENT_EVIDENCE` with no authoritative `SerializedPage`, even if `runIds` happen to be sorted, the geometry looks obvious, or `hasEOL` is set. This case is contract-reachable even though today's conservative `formVisualGroups` producer abstains before it: the resolved VisualGroup validator accepts valid multi-run membership, and Reading Order V1 resolves any one-group page. V1 does not concatenate those runs or treat their group as one text line.

A canonical run with `text === ''` or whitespace-only `text` is structurally serializable as an exact, possibly empty unit. It is **not** positive proof of blank/invalid PDF, substantive content, image-only content, or fallback eligibility. Content validity and document completion remain separate; an empty unit cannot by itself satisfy substantive-content proof. A missing run, unavailable text property, non-string text, or broken binding is `FAILED`, not ordinary insufficiency. A thrown extraction operation retains its upstream extraction-failure cause and never becomes successful empty text.

The future Serialization result has three states: `RESOLVED` with one valid page payload; `INSUFFICIENT_EVIDENCE` only for a validly reached, normally operating stage without approved internal order or required separator; and `FAILED` for invalid input/result, identity mismatch, missing run/group, impossible structure, or internal/runtime failure. Both non-resolved states carry no partial ordered text. The result validator must reject a payload on either non-resolved state and must not let a fabricated `RESOLVED` unit pass. A privacy-safe diagnostic may expose page number, group/unit counts, and a stable issue code, never text or an exception message.

## Whitespace and downstream responsibilities

Serialization V1 preserves the canonical single run's `text` exactly as stored in the JavaScript string: no trimming, NFKC, space collapse, newline insertion/removal, gap-derived whitespace, font rule, geometric neighbor rule, or `hasEOL` interpretation. Text order, separator insertion, and domain meaning are separate decisions. There is no V1 run join. There is no V1 group join because Reading Order V1 resolves only singleton groups; a future multi-group version should initially retain separate ordered units and approve any textual separator separately, not silently hardcode `\n`.

The existing [legacy line reconstructor](../../src/parsers/pdfLineReconstructor.ts) trims each item, flushes by y-gap or `hasEOL`, joins fragments with spaces, collapses whitespace, and joins lines with newlines; [legacy PDF parsing](../../src/parsers/pdfResumeParser.ts) joins page strings with `\n\n`. Those are **layout reconstruction** behaviors (B), not inherited Serialization V1 authority. [normalizeResumeText](../../src/parsers/normalizeResumeText.ts) mixes lexical normalization (A: NFKC, line-ending/control/bullet transformations, each requiring adapter review for losslessness) with spacing/boundary rewriting (B: space/tab collapse, line trim, repeated-newline collapse, final trim). Serialization does none of them. [sectionDetector](../../src/analyzers/sectionDetector.ts) splits newline-delimited input, cleans and matches heading aliases, and partitions sections; [resumeAnalyzer](../../src/analyzers/resumeAnalyzer.ts) parses fields and warnings. Those are **domain-semantic** behaviors (C), not Serialization. No heading, company, school, or section repair is permitted here.

## Document composition and adapter gap

The separate selected document representation is:

```text
SerializedDocument { pages: [SerializedPage(page 1), ..., SerializedPage(page N)] }
```

Composition requires a validated manifest from **one** loaded PDF: its canonical `numPages`, one-based page identities accounting for every page from 1 through N without duplicates or gaps, a resolved page result for every parsing-critical page, and ascending PDF page number. V1 conservatively treats every page as critical unless a separate policy positively validates an exclusion and represents it in that manifest. Pages need not arrive in page-number order; source `pages[]` insertion or async completion order is not authority. The loader's `getPage(1..numPages)` usage supplies the intended page-index source, but a future adapter must bind the new page evidence/results to that source and validate completeness. Composition never reads x/y geometry to order pages or combines runs across pages. It retains explicit page boundaries and ordered units; it does not flatten to `page1\npage2`. Any unresolved critical page prevents an authoritative complete `SerializedDocument`.

The current [`ParsedResumeFile`](../../src/parsers/resumeParserTypes.ts) and [resume service](../../src/services/resumeService.ts) require a flat `text: string`, then normalize it and pass it to the newline-oriented section detector/analyzer. A **future, separately reviewed adapter** is required from `SerializedDocument` to that legacy input (or a redesigned downstream input). It must establish any unit/page separator and normalization policy with its own evidence and tests. The legacy need for a string does not authorize premature flattening in Serialization; if the adapter cannot prove its separators, deterministic completion must abstain. `DETERMINISTIC_SUCCESS` still requires downstream analysis and a valid candidate for all parsing-critical pages.

## Cause, routing, and privacy boundary

**New conceptual PDF causes are required for the stage contract:** page-scoped `PDF_SERIALIZATION_INSUFFICIENT` for normal operation on valid admitted input with no approved internal sequence/separator, and distinct `PDF_SERIALIZATION_FAILED` for a verified Serialization contract/runtime failure. The former is not a rebranding of Reading Order insufficiency, low text, or an empty string. The latter is hard (`PARSER_FAILURE` when verified), never AI eligibility. Today's singleton-only VisualGroup *producer* may prevent the multi-run case from reaching this stage, but the broader valid VisualGroup result contract permits it, so the stage cannot collapse this legitimate insufficiency into `FAILED` or an upstream cause. Cause type, validity classifier, and routing changes are **deferred**; no production cause is added here.

Only after independent `CONFIRMED_VALID` FILE, DOCUMENT, target PAGE, and relevant CONTENT claims, normal implementation, and no higher-priority hard failure may `PDF_SERIALIZATION_INSUFFICIENT` classify toward whole-document `FALLBACK_ELIGIBLE / INSUFFICIENT_STRUCTURE`. `UNKNOWN` validity cannot grant fallback; invalid input and internal failure cannot be laundered into it. Preserve `HARD_FAILURE > FALLBACK_ELIGIBLE > DETERMINISTIC_SUCCESS`, no partial `ResumeProfile`, and no page-level AI merge. This ADR does not run a fallback or select a provider.

Serialized text is a **functional private payload**, allowed internally for this stage. Diagnostics, logs, exceptions, and public routing data must not echo raw text, names, contact data, employers, schools, filenames, font names, or paths. The same admitted canonical input must yield the same text and provenance; no mutable input array order, randomness, or geometry tie-break may affect the result. Future code must not mutate Reading Order, VisualGroups, runs, PageLayout evidence, Spatial graph, or source TextItems. Once admission and order are fixed, uniform coordinate scale or translation cannot change serialized text.

## Scope and follow-up

Two-column and sidebar cases normally stop at Reading Order V1; same-Y separate columns may stop earlier at VisualGroup; split CJK heading remains a potential group-internal/Serialization question without a claimed fix; the public PDF is an integration reproducer. The five known reconstruction failures remain unchanged. No new Reading Order, Region, track, graphics, marked-content, content-stream, or PDF metadata research is opened by this decision.

Next, lock test-only executable contracts for the page result, exact text preservation, empty text, multi-run insufficiency, bad-reference failure, privacy, page manifest, and conceptual cause/validity boundary. Production Serialization, parser integration, the legacy adapter, routing, AI, and provider selection each require later approval.
