# RP-091: SpatialStructureGraph contract design

Status: Production-backed foundation (RP-092, 2026-09-27). The [50 executable contracts](../../tests/pdfSpatialStructureGraphContract.test.ts) now call [the production SpatialStructureGraph module](../../src/parsers/pdfSpatialStructureGraph.ts). The [test helper](../../tests/helpers/pdfSpatialStructureGraphContractHarness.ts) retains fixtures and normalized comparison snapshots, with no parallel policy validator. The legacy Region module and its RP-086 contracts remain unchanged; no parser call site has switched. Fact detection, Region resolution, Reading Order, Serialization, and parser integration remain out of scope.

The sections below preserve the RP-091 design rationale and its pre-production verification baseline. References to a test-only oracle or future production foundation describe that earlier design stage, not the current implementation status.

## Contract surface

The oracle's binder accepts a production-valid `RESOLVED` VisualGroup result and the exact same-page `AVAILABLE` PageLayout evidence instance, including its original RowEvidenceGraph and HLE references. Upstream `INSUFFICIENT_EVIDENCE`/`FAILED` and PageLayout `UNAVAILABLE`/`FAILED` are rejected before spatial execution, not translated into spatial insufficiency. A producer must bind the VisualGroup result to the evidence it actually used; the current upstream result has no independent provenance token, so structural equality cannot establish its origin after the fact.

`RESOLVED` means a complete, canonical node inventory for all admitted VisualGroups, grounded node geometry, and support for every emitted fact. It does not mean all possible facts are known or that Reading Order can be solved. Missing, duplicate, unknown, fabricated, or stale nodes fail. A production-valid multi-run VisualGroup remains one node; the graph cannot split it into run nodes or merge it with another group. A singleton is one node without a Region wrapper. Zero upstream groups are not an automatic success.

Facts are deliberately sparse and positive. The test-only vocabulary covers exact `X_DISJOINT`, exact `X_OVERLAP`, `Y_ABOVE`, local `BAND_OCCUPANCY`, and `X_SPANS` context. Each declared fact carries only canonical group endpoints, a same-page y scope, and canonical witness run IDs bound to the admitted graph/HLE; the oracle checks geometry support but never searches for facts. `BAND_OCCUPANCY` is complete **within its declared local band** against the complete node inventory; this local observation is not a page-global Column partition. `X_SPANS` describes horizontal extent relative to two contemporaneous observations, not a Region role. The only locked direct contradiction is `X_DISJOINT` versus `X_OVERLAP` for the same pair and exact scope. No additional relation taxonomy, approximate alignment, count cutoff, or pixel threshold is selected.

The relation graph is open-world. An absent fact returns explicit `UNKNOWN`, never false, rejected, an inverse fact, or an ownership/order conclusion. A valid four-node graph may publish only A-B and C-D facts while other queries remain unknown. A graph with **zero positive facts is valid** when its nodes are fully grounded and the admitted spatial-stage contract completes normally; Reading Order admission then remains possible, but correct ordering is not guaranteed. This follows the explicit RP-090 ADR state definition, not a new success heuristic.

`INSUFFICIENT_EVIDENCE` is restricted here to admitted input whose required node geometry cannot be grounded safely, including an upstream-valid unsafe singleton run. Unknown optional pair relations and non-unique Region ownership are not spatial insufficiency. `FAILED` is reserved for invalid input, malformed graph, impossible references/geometry, or internal consistency failure. No partial node inventory or authoritative graph accompanies insufficiency/failure.

Reading Order's test-only admission gate requires the bound `RESOLVED` VisualGroups, `AVAILABLE` PageLayout, validated `RESOLVED` SpatialStructureGraph, exact page/evidence identity, and complete node inventory. It does **not** ask for a Region result. Unknown relations are admissible; a future Reading Order stage must make its own success/insufficiency decision. The graph rejects Region/Column owner fields, raw or semantic text, and reading-rank/sequence fields.

## RP-086 supersession map

| RP-086 principle | RP-091 disposition |
| --- | --- |
| Same-page, same-evidence Graph/HLE admission; upstream stage gates | Retained, with a new spatial result interface. |
| Canonical VisualGroup/run references and complete inventory | Retained for nodes; no Region ownership implied. |
| Finite evidence-backed geometry; overlap/touching/nesting not automatically invalid | Retained. Exact facts require their own witnesses. |
| Privacy, no mutation, permutation and uniform-scale invariance | Retained. |
| Invalid contract versus ordinary insufficiency | Retained; unknown relations are normal open-world knowledge. |
| Exactly one primary Region owner per group and complete Region partition | Superseded by exactly one node per group plus sparse positive facts. |
| `COLUMN_LIKE`/`SPANNING` Region roles and Region IDs | Superseded by scoped observable facts; no owner role or Region ID. |
| No partial authoritative Region map | Retained only for complete node inventory; partial positive relation knowledge is valid. |
| Reading Order only after Region `RESOLVED` | Superseded by validated SpatialStructureGraph `RESOLVED`; ordering solvability remains separate. |

The existing RP-086 tests and `src/parsers/pdfRegionResolutionResult.ts` remain unchanged and green as historical contracts. RP-092 added a separate production SpatialStructureGraph module and did not alter the old result's meaning or wire either gate into the parser.

## Verification and limits

RP-091 contracts: `50/50 PASS`; independent test TypeScript, app TypeScript, and production build: `PASS`. RP-086: `30/30 PASS`; RP-083: `64/64 PASS`; RP-079: `32/32 PASS`; VisualGroup/PageLayout/HLE contracts: `350/350 PASS`. Full suite: `967 PASS / 5 known FAIL`; reconstruction alone: `15 PASS / 5 known FAIL`. The unchanged failures are two-column, sidebar, same-Y separate columns, split CJK heading, and public PDF reproduction. They are not fixed by a test-only spatial oracle.

RP-092 implemented the production SpatialStructureGraph result/admission foundation, open-world query, Reading Order admission guard, runtime validation, and privacy-safe diagnostic projection. Fact discovery, Reading Order, Serialization, parser/routing wiring, and AI integration remain separate later work.
