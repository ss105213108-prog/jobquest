# Conservative PDF spatial fact formation

Status: Accepted architecture (RP-093, 2026-09-27), implemented as an unwired [production V1 builder](../../src/parsers/pdfSpatialFactFormation.ts) by RP-095. This selects a V1 formation policy for the [RP-092 SpatialStructureGraph foundation](../../src/parsers/pdfSpatialStructureGraph.ts) under [ADR 0004](0004-pdf-region-column-resolution.md). No parser integration is authorized here.

## Decision and interface

V1 forms only `X_DISJOINT`, `X_OVERLAP`, and `Y_ABOVE` from exact, grounded bounds of admitted whole VisualGroups. These facts describe **group bounding extents**, not glyph ink, common ownership, tracks, semantic sections, or reading priority. `BAND_OCCUPANCY` and `X_SPANS` remain valid result vocabulary for already-declared and validated facts, but V1 does not discover or emit them. The node inventory is complete; the fact set is sparse and positive. Missing facts are `UNKNOWN`, not negative claims. A fully grounded graph with zero facts is a valid `RESOLVED` spatial result.

The formation module's interface takes an evidence-bound Spatial input already admitted by `spatialInputIssues`: same-page `RESOLVED` VisualGroups, `AVAILABLE` PageLayout evidence, the exact RowEvidenceGraph and HLE instances, and valid canonical run references. It yields the RP-092 result shape, not a Region map or order. Upstream non-resolved/unavailable states do not run this module and are not translated into spatial insufficiency. Formation neither changes VisualGroup membership nor creates missing nodes. The module is implemented but remains unwired to the parser.

Each VisualGroup node uses the RP-092 exact envelope of all its canonical member runs: `minX = min(run.x)`, `maxX = max(run.endX)`, `minY = min(run.y)`, and `maxY = max(run.y + run.height)`. All coordinates must be finite and each member run geometry-comparable with positive height. A multi-run envelope can cover blank space; an envelope fact therefore must never be paraphrased as a glyph-level intersection or as continuously occupied text. The V1 witness is the exact sorted union of endpoint groups' canonical run IDs, all represented by the admitted HLE run intervals, as required by RP-092. No new witness field or vocabulary is introduced.

## Fact-family decisions

| Approved family | V1 classification | Positive witness and exact meaning | Abstain when |
| --- | --- | --- | --- |
| `X_DISJOINT` | `DIRECT_GEOMETRIC` | Two grounded group envelopes have a strictly positive common vertical interval and either `A.maxX < B.minX` or `B.maxX < A.minX`. The x extents are strictly separated **in the stated local y context**. | No positive y intersection, x intervals touch or overlap, unsafe geometry, missing canonical witness, or invalid admission. A gap's size never acts as a cutoff. |
| `X_OVERLAP` | `DIRECT_GEOMETRIC` | Two grounded group envelopes have a strictly positive common vertical interval and `min(A.maxX, B.maxX) > max(A.minX, B.minX)`. This asserts positive **envelope** overlap, not shared glyph ink or ownership. | No positive y intersection, zero-width x intersection, unsafe geometry, missing witness, or invalid admission. Identical or nested positive-width envelopes are not exceptional. |
| `Y_ABOVE` | `DIRECT_GEOMETRIC` | In the current page coordinates, whose y axis increases upward, grounded envelope A is strictly above B when `A.minY > B.maxY`. This is occupied-extent separation only, not a reading edge. | y extents touch or overlap, unsafe geometry, missing witness, or invalid admission. No baseline or row-candidate relation substitutes for the strict bound comparison. |
| `BAND_OCCUPANCY` | `NOT_FORMABLE_IN_V1` | The result contract can validate complete group occupancy within a declared local band. Current evidence does not approve a canonical band partition or stable group-level track identity for formation. HLE slices are row-candidate contexts, not tracks. | Always in V1; do not choose bands to imply a column or derive tracks from similar x positions. |
| `X_SPANS` | `NOT_FORMABLE_IN_V1` | The result contract can validate a declared envelope-covering relation to two separated peers. Neither a wide bound nor the current HLE's page-wide horizontal sweep independently proves a structural spanning context or established tracks. | Always in V1; no page-width percentage, width cutoff, or inferred track pair. |

None of the five families is `DERIVED_BUT_PROVEN` in V1. A future derived fact requires an independently approved upstream construct and its own contract; the existence of a validator predicate alone is not formation authority.

## Canonical scope and exact boundaries

For either horizontal fact, require `max(A.minY, B.minY) < min(A.maxY, B.maxY)`. The scope is exactly that maximal common envelope interval: `minY = max(A.minY, B.minY)`, `maxY = min(A.maxY, B.maxY)`, with the admitted page number. This is a coordinate-derived local scope, not a threshold-selected band. It is never widened to the page or copied to another vertical interval. No horizontal fact is formed for groups that merely share an x relationship at disjoint y extents.

For `Y_ABOVE(A, B)`, the canonical scope is the smallest envelope hull containing both groups: `minY = B.minY`, `maxY = A.maxY`, with the admitted page number. This records where the comparison was made; it is not a reading-order window. These exact scope choices satisfy RP-092's current structural validator and avoid arbitrary alternative scope variants. V1 does not emit the same proposition repeatedly under multiple larger or smaller scopes.

Boundary equality is deliberately undecided as a positive relation: `A.maxX == B.minX` is neither strict `X_DISJOINT` nor positive `X_OVERLAP`; `A.minY == B.maxY` is not `Y_ABOVE`; y-scope endpoints that meet without positive interval produce no horizontal fact. No epsilon, tolerance, or minimum gap is used. Identical positive-width bounds support `X_OVERLAP` in their common positive-height scope, while identical zero-width bounds do not. Nested positive-width bounds likewise may support envelope overlap, never containment ownership. Strict x separation and strict x overlap cannot both hold for the same pair and exact scope, so V1 cannot emit RP-092's locked contradiction.

## Evidence roles and abstention

The RowEvidenceGraph supplies the canonical runs and their geometry for the already-resolved VisualGroups. Its candidate IDs and `SUPPORTED`/`DEFERRED`/`REJECTED` pair relations govern upstream grouping permission, not same track, same Region, reading sequence, or the V1 spatial fact predicates. V1 does not reuse those relation states as fact evidence.

HLE supplies the admitted instance pairing and safe run-interval provenance required for fact witnesses. Its raw intervals can corroborate member-run x extents, but its slice gaps and horizontal sweep are run/candidate observations. They carry no independently approved group-level track, local vertical band partition, or spanning declaration. V1 horizontal and vertical decisions are geometry-only over canonical group envelopes; HLE is provenance and validation context, not a hidden ownership classifier.

If an optional relation cannot be proven, emit no fact and leave its query `UNKNOWN`. Do not create `FALSE`, `NOT_OVERLAPPING`, `NOT_SPANNING`, an inverse fact, or a stored table of unknown pairs. If required node geometry cannot be grounded after valid admission, the RP-092 `NODE_GEOMETRY_UNAVAILABLE` spatial insufficiency remains available; a mere absence of optional facts never causes insufficiency. Invalid source identity, malformed structure, contradictory emitted facts, or internal consistency failure are contract failures, not ordinary ambiguity. A successful, complete node inventory with no facts is `RESOLVED`.

Formation examines unordered group pairs independently of input order. Symmetric endpoint serialization is canonical by member-run identity; `Y_ABOVE` keeps its geometric direction. Group IDs are output references, not evidence or tie-breakers for deciding a relation. Exact scopes and witness run sets are deterministic, duplicate facts are suppressed, and inputs are not mutated. Uniform positive coordinate scaling preserves strict inequalities, scope construction, admission, and emitted fact semantics; no absolute-pixel rule appears.

Diagnostics remain privacy-safe under RP-092's allowlist. Formation may report page identity, counts, and stable structural codes, never raw text, font names, filenames, resume fields, exception messages, or full TextRuns.

## Limits and next gate

V1 does not solve columns, sidebar/main classification, or Reading Order. Two-column and sidebar cases could eventually gain direct facts only after valid upstream VisualGroups and a separate formation implementation. Same-Y separate columns may still be blocked by unresolved VisualGroups; split CJK heading is not owned here; the public PDF reproduction is an integration check. This design fixes none of the five known reconstruction failures.

RP-094 added executable formation contracts for exact witness, scope, touching, unknowns, zero-fact success, permutation, scale, and mutation safety; RP-095 made those contracts production-backed. Multi-run envelope tests remain a possible focused extension. This ADR authorizes no numeric threshold, approximate alignment, Region ownership, Reading Order rule, Serialization, parser integration, routing, or AI integration.
