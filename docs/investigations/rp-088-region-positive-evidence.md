# RP-088: Positive structural evidence for PDF Regions

Status: Investigation complete; no Region policy selected (2026-09-27).

## Scope and method

Twelve anonymous geometry families have two deliberately opposed, author-declared Region ownership intents each. Both intents use the same run geometry, production `PageLayoutEvidence` construction, HLE, and a production-validated, manually supplied `RESOLVED` VisualGroup partition. The production Region admission and result validators accept both structurally complete RegionGraphs. The investigation-only signature includes canonical VisualGroup membership, normalized run geometry, Graph candidates/relations, HLE intervals, slices, gaps, sweep segments, occupancy, and availability. It excludes raw text, font, fixture name, arbitrary IDs, input order, and uniform coordinate scale. It uses exact normalized observations, not an alignment tolerance or resolver rule.

These are **synthetic structural author-intent controls**, not independently verified real-PDF Region labels or evidence of their prevalence. An exact signature match with opposite declared intents demonstrates that the approved evidence cannot distinguish those declared interpretations. It does not certify that both would be accepted as author-intended ground truth by an independent review panel. The existing production `formVisualGroups` still returns `INSUFFICIENT_EVIDENCE` for representative multi-run pages; manual `RESOLVED` results here are a conditional downstream probe, not current end-to-end parser behavior.

## Matched observations

| Pair | Positive intent | Matched opposite | Challenged structural signal | Classification |
| --- | --- | --- | --- | --- |
| `SINGLE_COLUMN_CONTINUATION` | One Region for four stacked groups | Two stacked Regions | Repeated x interval and vertical continuation | `EXACT_REGION_AMBIGUITY` |
| `PARALLEL_TRACKS` | Two long Regions | One multi-track Region | Horizontal gap and repeated tracks | `EXACT_REGION_AMBIGUITY` |
| `NARROW_SIDEBAR` | Narrow-left and main Regions | One mixed-width Region | Narrow side track | `EXACT_REGION_AMBIGUITY` |
| `WIDE_SIDEBAR` | Wide-left and main Regions | One mixed-width Region | Unequal widths | `EXACT_REGION_AMBIGUITY` |
| `FULL_WIDTH_HEADER` | Spanning header above two Regions | One Region with a wide first group | Wide top group plus lower tracks | `EXACT_REGION_AMBIGUITY` |
| `FULL_WIDTH_FOOTER` | Two Regions followed by spanning footer | One Region ending in a wide group | Wide lower group | `EXACT_REGION_AMBIGUITY` |
| `STACKED_FULL_WIDTH` | Two full-width Regions | One continuous Region | Same wide interval in separate vertical bands | `EXACT_REGION_AMBIGUITY` |
| `UNEQUAL_DENSITY` | Two unequal-density Regions | One uneven Region | Unequal row counts with repeated tracks | `EXACT_REGION_AMBIGUITY` |
| `SPARSE_MISSING_SIDE` | Sparse side and main Regions | One Region with sparse side content | Missing side rows | `EXACT_REGION_AMBIGUITY` |
| `SPANNING_BETWEEN_BANDS` | Two continuing Regions plus middle span | One Region through the transition | Wide middle group and tracks above/below | `EXACT_REGION_AMBIGUITY` |
| `IDENTICAL_LOCAL_BOUNDS` | One Region | Two Regions with identical bounds | Exactly coincident group bounds | `EXACT_REGION_AMBIGUITY` |
| `NESTED_SIMILAR_BOUNDS` | One Region with nested observations | Outer and inner Regions | Overlap and nesting | `EXACT_REGION_AMBIGUITY` |

Every pair has a distinct ownership topology but an equal canonical approved-evidence signature. The control is deliberately stronger than matching a single feature: it reproduces all persisted Graph/HLE evidence and VisualGroup membership. The signature cannot include a transient calibration snapshot not retained in `AVAILABLE` PageLayout evidence; the derived candidates, relations, and HLE observations are included. No graphics or marked-content evidence was added.

## Findings by question

**Same-Region cohesion.** Repeated x intervals, vertical adjacency, dense continuation, and identical local bounds are present in both one-Region and multi-Region intents. They describe spatial proximity, not a positive ownership witness. `SINGLE_COLUMN_CONTINUATION`, `STACKED_FULL_WIDTH`, and `IDENTICAL_LOCAL_BOUNDS` block a generalized cohesion rule from those signals alone.

**Different-Region separation.** Persistent gutters, non-overlap, repeated horizontal tracks, sidebar width imbalance, unequal density, and missing rows are likewise reproducible under a one-Region intent. `PARALLEL_TRACKS`, both sidebar widths, `UNEQUAL_DENSITY`, and `SPARSE_MISSING_SIDE` therefore do not ground a generalized separation rule. Separate row candidates or HLE slices do not constitute Region ownership.

**Spanning.** HLE records a wide group above, below, or between narrower tracks, and the RegionGraph can represent it as a single-owner `SPANNING` Region. The same evidence also supports an alternative declaration in which the wide group remains within one larger Region. Width, occupied x coverage, and adjacent vertical context are descriptive, not a proven spanning role. No percentage or pixel cutoff is proposed.

**Vertical transition.** `FULL_WIDTH_HEADER`, `FULL_WIDTH_FOOTER`, and `SPANNING_BETWEEN_BANDS` show that slice/occupancy changes are observable without a global-column model. They do not determine whether ownership changes at the same boundaries. A derived vertical band is therefore not an authoritative Region partition.

**Overlap and robustness.** Nested/overlapping groups are structurally valid and cannot be rejected merely for overlap. A small exactly representable x perturbation changes the exact-alignment observation and canonical signature for the single-column fixture; that observation is `REPRESENTATION_LIMITED`, not a reason to add epsilon. The 24 paired intent fixtures are classified `EXACT_REGION_AMBIGUITY` conditional on the declared synthetic ground truth. No fixture is classified `SUPPORTED_BY_DISTINCT_CONTEXT`; independently adjudicated author intent remains a separate `GROUND_TRUTH_INSUFFICIENT` concern for applying these results to real documents.

## Invariance and viability

The same-Region, separate-Region, and spanning families retain their evidence signatures and ownership topology under uniform scaling. Reversing the canonical run order for those three families likewise preserves the signature and topology. These controls reject input order and absolute pixels as generalized evidence. Exact-coordinate perturbation is recorded separately; no approximate alignment is selected.

| Rule family | Viability for policy design | Reason |
| --- | --- | --- |
| Same-Region cohesion | `NOT_YET_GROUNDED` | Exact matched opposite ownership for stacked/identical geometry. |
| Different-Region separation | `NOT_YET_GROUNDED` | Gap, track, width, and density observations survive the opposite intent. |
| Spanning Region | `NOT_YET_GROUNDED` | Wide-plus-lower context is identical under a non-spanning ownership declaration. |
| Vertical transition | `NOT_YET_GROUNDED` | HLE records the geometry change, not the Region ownership change. |

This does not challenge the trivial, already contracted one-VisualGroup/one-Region case. It blocks proceeding directly to a positive multi-group Region resolver for these families. A useful next investigation would obtain independently adjudicated, anonymous author-intent Region labels and audit whether an approved, non-semantic, format-preserved structural fact distinguishes matched opposites. Graphics and marked content remain separate optional-enrichment tracks; neither is integrated here.

The existing five reconstruction failures were not changed. Two-column and sidebar remain possible Region-separation cases only after upstream VisualGroup resolution; same-Y separation also starts upstream; split CJK heading is not Region-owned; the public PDF reproduction is an integration check. No Region result in this investigation fixes those failures.
