# Observable PDF spatial structure before Reading Order

Status: Accepted architecture, revised by RP-090 (2026-09-27). This supersedes this ADR's RP-085 requirement for a complete, exclusive Region ownership map; it does not change the RP-087 production module or RP-086 tests yet.

RP-088 found twelve identical-evidence pairs with opposite *author-declared* Region ownership. RP-089 reclassified all twelve as author-intent conflicts: its anonymous geometry review found no uniquely observable multi-group partition (ten layouts permit multiple representations; two conceal ownership altogether). That review was a single-reviewer desk audit, not an inter-rater study. It is sufficient to reject hidden author intent as a `MUST_RESOLVE` target, not to establish a new universal layout policy.

## Decision: a SpatialStructureGraph is primary

Choose **Option C**. The required page-stage result and the downstream Reading Order interface will use a `SpatialStructureGraph` of independently observable facts, not a `RegionGraph` of primary owners. A Region may later be derived as an optional convenience view only where an independently adjudicable grouping is established; it is not part of the required spatial result and cannot gate Reading Order. This is a replacement of the required interface, not an extra layer that preserves Region ownership for compatibility.

| Option | Decision | Reason |
| --- | --- | --- |
| A. Keep Region as the required result, resolve only uniquely justified groupings | Reject | Ambiguous multi-group pages would still be blocked before Reading Order even when useful spatial facts are known. |
| B. Make Region optional over a primary relation graph | Reject as the required interface | It retains a second ownership-shaped result with no present independent use case and risks two competing authorities. An optional projection can be designed later. |
| C. Replace required RegionGraph with SpatialStructureGraph | Select | It carries observable facts without inventing group owners and gives Reading Order the relevant evidence directly. |

The three authorities are separate: **VisualGroup membership** is decided upstream; **spatial facts** describe validated page geometry among whole VisualGroups; **Reading Order** later chooses a sequence or abstains. Neither a spatial fact nor a desired order changes group membership or proves a unique Region owner. The spatial module has one small external interface: admit a same-page resolved-group/evidence pair and return validated page spatial observations. It does not expose a Region partition or traversal plan.

## Authoritative structure and facts

Every spatial node refers to exactly one admitted VisualGroup, and every admitted VisualGroup has exactly one node. Nodes are identity references with evidence-bound geometry, **not** new owners or smaller text units. No spatial stage may split, merge, duplicate, or repair a VisualGroup. A one-VisualGroup page therefore needs one grounded node, not a fabricated Region object or a reading-order claim. A zero-group page is not automatic success and must be handled by upstream admission or explicit evidence classification.

The graph contains a sparse set of **positive, evidence-backed spatial facts**. Each fact names its complete group endpoint set, page coordinate context or vertical scope where relevant, and a verifiable witness in the admitted geometry/HLE. The precise fact schema and witness predicates remain a follow-up contract decision; this ADR does not authorize an implementation rule. Candidate fact families are:

- strict vertical separation or precedence of occupied extents, without assigning a reading index;
- horizontal interval equality, overlap, containment, or separation in a stated vertical context;
- contemporaneous occupancy of distinct horizontal tracks, when a track observation is independently supported;
- a wide group's extent covering the observed extents of two contemporaneous tracks above, between, or below them;
- changing horizontal occupancy across observed vertical bands, including one-track to two-track to one-track patterns.

These are geometric propositions, not Region membership, semantic sections, or sequence edges. A “same track” observation never means “same owner”; separate tracks never mean “different owners”; a wide or spanning-looking observation never creates its own owner. A track is an observed horizontal pattern relative to a stated vertical context, not a page-global Column entity. Band observations are derived views, not another membership partition. A long VisualGroup may intersect several bands without being duplicated. `COLUMN_LIKE` and `SPANNING` are retired as **Region roles** in the new required interface; any future track or span fact must be defined by its own geometric witness, not by a guessed Region role.

The only approved inputs remain same-page `RESOLVED` VisualGroups and matching `AVAILABLE` PageLayout evidence, including relevant HLE intervals, slices, sweep provenance, occupancy, and validated member-run geometry. Graph candidates and relations may be examined where accessible, but are not automatic split or grouping permissions. Raw text, headings, resume sections, company or school names, font names, graphics operators, marked content, and AI are not spatial evidence here. No numeric threshold, approximate alignment, or epsilon is selected.

## Open world and partial facts

The graph is **open-world**: absence of a fact means `UNKNOWN`, never false. A downstream relation query for an unrecorded fact must return an explicit `UNKNOWN` assessment; it may not infer the negation, an opposite relation, same ownership, different ownership, or a reading edge. A negation is usable only if separately supported by a positive counter-observation under a future contract. Unknown assessments need not be materialized for every possible group tuple, but the query interface must expose `UNKNOWN` rather than a Boolean false. Provenance and scope must travel with each supported fact so that facts from different bands are not silently combined.

**Partial positive facts are allowed.** A page may safely establish that A is above B while leaving A-versus-C unknown. `RESOLVED` means the node inventory, source pairing, node geometry grounding, and every *published* fact are valid and complete as represented; it does **not** claim closure over every possible pair, a unique Region partition, or a complete Reading Order. The page result remains atomic for node inventory and fact integrity, not for relation closure. An invalid or contradictory published fact cannot be silently ignored. A multi-group result with no supported edge is not a claim of spatial or ordering success: if its nodes are safely grounded, it can be a valid open-world graph with all relation queries `UNKNOWN`, and Reading Order must decide whether it has enough evidence or abstain. No arbitrary minimum fact count is introduced.

The conceptual three-state page result is revised as follows:

- `RESOLVED`: all admitted VisualGroups have grounded nodes; all emitted positive spatial facts are validated; optional relations may remain unknown. This is spatial observation success only.
- `INSUFFICIENT_EVIDENCE`: admitted input exists but a required node's geometry or page-level grounding cannot be represented safely. Unknown ownership or an optional unknown pair relation alone is **not** this state.
- `FAILED`: invalid input/provenance/contract or internal consistency/execution failure. Ordinary geometric ambiguity is not `FAILED`.

No partial node inventory, guessed extent, guessed fact, or provisional order is authoritative in any state. `INSUFFICIENT_EVIDENCE` and `FAILED` do not carry a partial graph. The future contract must specify a privacy-safe reason and validation details without raw page content.

## Reading Order admission

Reading Order **does not require a unique Region partition**. It may start only with (1) the same-page `RESOLVED` VisualGroup result, (2) the bound `AVAILABLE` PageLayout evidence, and (3) a validated `RESOLVED` SpatialStructureGraph whose node IDs cover those groups exactly once and whose facts reference only admitted nodes and evidence. Evidence identity and provenance must be checked at this interface, not reconstructed from matching values or copied DTOs. A spatial `INSUFFICIENT_EVIDENCE` or `FAILED` result stops admission.

Admission permits unknown spatial relations; it does not guarantee that a correct full order can be determined. The Reading Order stage must define its own success, insufficiency, and failure contract and may abstain when its required sequence evidence is unknown. It may use admitted PageLayout geometry alongside supported spatial facts but cannot reinterpret group membership, treat absent facts as false, or turn a track/span/band fact into an ordering edge without its own approved rule. No `readingIndex`, first/next Region, semantic priority, or serialization content belongs in the spatial graph.

For example, a full-width group above two lower tracks can supply a vertical relation and scoped occupancy facts without naming any Region owners. That may help a future Reading Order stage, but this ADR does not assert a complete left-versus-right traversal or implement one.

## Ground truth and invariants

Future positive fixtures must state **observable relations** with a non-semantic rationale and an independently checkable witness: for example, disjoint horizontal intervals in the same observed band, or an extent covering two established tracks. A fixture's hidden author-intended Region partition is not ground truth for this interface. Matched controls must test whether the same observable evidence admits a contrary relation; otherwise the relation remains `UNKNOWN`. The RP-088 opposite intents are underdetermination controls, not two valid opposite ownership truths. A `MUST_RESOLVE` claim requires independent adjudication of the exact spatial fact it asserts.

Canonical node and fact identity must be stable under input permutation and uniform positive coordinate scaling. Facts must not use fixture labels, random IDs, asynchronous arrival, or absolute pixel cutoffs as identity or decision inputs. Overlap, touching, identical, and nested bounds are observations, not automatic invalidity or ownership rules. Unsafe geometry is not estimated. Results and diagnostics must remain privacy-safe: use page identity, stable structural codes, group references, counts, and specifically approved normalized geometry; exclude raw text, filenames, resume fields, PII, fonts, exception messages, and full TextRuns. HLE is evidence context, not a wholesale copied output.

## Existing contract and migration impact

`src/parsers/pdfRegionResolutionResult.ts` is **`FOLLOW_UP_REVISION_REQUIRED`**: unchanged in RP-090, but over-constrained as the future required Reading Order input. Its `RegionGraph` requires exclusive owners, `RESOLVED` means complete ownership, and `canRunReadingOrder` gates on that result. No production parser currently consumes this module, so this decision does not change parser behavior today. A later implementation ticket should introduce the spatial result/interface, retire or explicitly isolate the legacy Region result, and replace the Reading Order admission guard. It must not quietly reinterpret the old `RESOLVED` or `INSUFFICIENT_EVIDENCE` values.

RP-086 principles that remain valid are: same-page and same-evidence admission; upstream `RESOLVED` VisualGroup and `AVAILABLE` PageLayout gates; complete canonical VisualGroup references; malformed contract versus ordinary insufficiency; finite/evidence-backed geometry; no semantic or Reading Order fields; no mutation; privacy-safe diagnostics; permutation and scale invariance; and not rejecting overlap/touching/nesting merely for their shape. Their tests may need new result shapes even where the principle survives.

RP-086 obligations that **do not carry forward** are: exactly one primary Region owner per group; mandatory complete Region partition or Region ID; `COLUMN_LIKE`/`SPANNING` owner roles; Region-level cohesion/separation proof as the page success criterion; prohibition on partial *positive relation facts*; `INSUFFICIENT_EVIDENCE` solely because ownership is non-unique; and Reading Order admission only after a complete Region result. The singleton principle remains but is reframed as one grounded VisualGroup node, not a compulsory Region wrapper. RP-086 tests and the RP-088 investigation harness stay untouched in RP-090 as historical contracts; a follow-up contract ticket must explicitly supersede affected assertions before production migration. No caller adapter or parser integration is implemented here.

The five known reconstruction failures remain unfixed. Two-column and sidebar may require observable spatial facts **and** Reading Order. Same-Y separate columns first requires upstream VisualGroup resolution before spatial admission. Split CJK heading belongs primarily to VisualGroup/Serialization. The public PDF reproduction remains an integration-level check. This ADR does not infer a `RESOLVED` spatial result from any upstream abstention.

## Next gate

Design executable admission, positive-fact, unknown-query, provenance, privacy, permutation, scale, and Reading Order-gate contracts for the new SpatialStructureGraph using anonymous, independently adjudicable observations. Only then migrate the RP-087 production foundation and supersede the affected RP-086 tests. Region resolver implementation, Reading Order implementation, Serialization, parser/routing wiring, and AI integration remain outside this ADR revision.
