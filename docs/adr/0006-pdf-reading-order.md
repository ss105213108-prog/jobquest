# PDF Reading Order: precedence evidence gate

Status: **Blocked** (RP-096, 2026-09-27). No V1 multi-group Reading Order mapping is accepted. The required direct precedence signal is not established by the currently approved Spatial V1 facts. This records the counterexample and the conditional result contract without implementing a resolver, tests, Serialization, or parser wiring.

## Evidence decision

The admitted [SpatialStructureGraph](../../src/parsers/pdfSpatialStructureGraph.ts) is page-local, has a complete VisualGroup node inventory, and carries sparse positive facts. [V1 formation](../../src/parsers/pdfSpatialFactFormation.ts) emits only `X_DISJOINT`, `X_OVERLAP`, and `Y_ABOVE`. ADR 0005 defines `Y_ABOVE` as strict separation of **group envelopes**, explicitly not a reading edge. `X_DISJOINT` and `X_OVERLAP` are horizontal envelope observations, not left-first, right-first, same-stream, or Column evidence. An absent fact remains `UNKNOWN`.

The proposed `Y_ABOVE(A,B) -> A PRECEDES B` mapping is **not approved**. Strict vertical separation proves where two envelopes lie, but not that they belong to one reading stream or that the upper stream is read before the lower stream. The current graph has no approved track, spanning, Region-owner, semantic, content-stream, or other precedence witness that could scope the mapping. Combining `Y_ABOVE` with `X_OVERLAP` or a horizontal gap would not cure this: those facts likewise do not prove stream identity or reading priority.

### Minimal counterexample

Consider two valid, separately resolved VisualGroups on one page: A at upper right and B at lower left, with strictly separated y envelopes. Spatial V1 correctly emits `Y_ABOVE(A,B)` and no scoped horizontal fact because their y intervals do not intersect. The same approved observations are compatible with both a top-first sequence `A, B` and a left-stream-first sequence `B, A` in a staggered layout. Neither sequence is established by the graph. Mapping the spatial fact directly to `A -> B` would give a two-node DAG exactly one topological order, but that apparent uniqueness would be created by an **unsupported edge**. The unique-order criterion cannot repair unsound edge admission.

The repository's two-column reconstruction fixture expects a column-major sequence while V1 formation would produce vertical facts across sufficiently separated rows, including cross-column pairs. That fixture is an example of the risk, not ground truth for a spatial or Reading Order rule. A particular author's intended sequence is not encoded in the V1 fact vocabulary. This is the `NO_APPROVED_READING_PRECEDENCE_SIGNAL` blocker specified by RP-096, not a reason to invent a column heuristic.

## Conditional Reading Order model

These are constraints for a future design **if** an independently justified precedence mapping is approved. They do not authorize deriving edges from present V1 facts.

- The page-local precedence graph would contain every admitted VisualGroup exactly once. A directed edge `A -> B` would require evidence whose semantics directly establish that A must precede B. Missing edges would mean unknown precedence, not equivalence or the inverse.
- `RESOLVED` would require an admitted, acyclic graph with exactly one valid linear extension, returning each canonical VisualGroup identity exactly once. A unique topological ordering is necessary **after** edge soundness, not sufficient to establish it.
- An admitted, acyclic graph with multiple valid linear extensions would yield `INSUFFICIENT_EVIDENCE` and no authoritative sequence. Node ID, array position, x coordinate, width, gap, or stable sorting could not break ties.
- A cycle or malformed/fabricated node, invalid spatial result, evidence mismatch, or other contract/internal inconsistency would yield `FAILED`, not ordinary insufficiency. Upstream non-resolved states would fail the existing [Reading Order admission guard](../../src/parsers/pdfSpatialStructureGraph.ts) before this stage runs.
- Logical transitivity of **approved precedence edges** would be allowed for order reasoning, without writing a new `Y_ABOVE` fact or rerunning geometry. It does not make a spatial observation into a precedence edge.

A single admitted VisualGroup has the trivially unique sequence `[G1]` even with zero facts. A zero-fact graph with multiple nodes has multiple possible sequences and would abstain. Same-band horizontally separated groups, multiple independent vertical chains, two-column, sidebar, and full-width-plus-columns cases likewise must not gain a tie-break from current V1 facts. Even a candidate vertical chain cannot be declared authoritative until the premise that supplies each precedence edge is approved.

The current [RP-092 guard](../../src/parsers/pdfSpatialStructureGraph.ts) checks that PageLayout is `AVAILABLE`, VisualGroups and SpatialStructureGraph are `RESOLVED`, the complete nodes and graph validate, and page/evidence identities match. It means only that a downstream stage **may execute**. It does not prove that ordering is solvable. The legacy Region result is neither required nor consulted by this design.

## Downstream boundary and invariants

Serialization may accept only a future Reading Order `RESOLVED` sequence. On `INSUFFICIENT_EVIDENCE` or `FAILED`, it must not create authoritative ordered text. Newline, spacing, group concatenation, and section formatting remain Serialization decisions. Reading Order itself is page-local; cross-page composition is a separate document-level concern.

Any future implementation must be invariant to node/fact permutation and to uniform scale or translation of geometry because ordering would consume approved fact meaning, not pixels or array order. Diagnostics may include only page number, node/edge counts, and stable ambiguity or cycle codes (for example `MULTIPLE_VALID_LINEARIZATIONS`); raw text, resume fields, font names, paths, and exception messages are excluded. A valid page with future Reading Order insufficiency could inform document-level fallback classification only after that routing is separately designed and wired; this ADR adds no routing or AI integration.

The five known reconstruction failures remain untouched. Two-column and sidebar pages would still lack justified cross-stream precedence; same-Y separate columns may be blocked earlier by VisualGroup admission; split CJK heading belongs upstream or to Serialization; public PDF reproduction remains an integration check. No failure is claimed fixed.

## Reopening condition

Before Reading Order contracts or implementation, a separate work item must identify an independently adjudicable, page-local precedence signal or justify a narrowly scoped top-to-bottom mapping against counterexamples with identical approved evidence. It must specify what the signal means, how it is witnessed and admitted, and when it abstains. The current `Y_ABOVE` envelope fact alone does not meet that bar. Until then, no multi-group V1 Reading Order architecture is selected.
