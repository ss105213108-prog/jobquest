# RP-089: Region ownership adjudicability

Status: Investigation complete (2026-09-27). No Region policy or production change.

## Method and limits

The [blind review sheet](./rp-089-blinded-layouts.html) presents the twelve RP-088 geometries in a different order as `B01`-`B12`. It displays only anonymous four-character group codes, their occupied boxes, and optional canonical coordinates. It contains no fixture family names, intended Region memberships, semantic text, expected output, or Region role labels. The two author-intent members of each RP-088 pair use exactly the same run geometry, so there is one rendered stimulus per pair, not two allegedly different visual ground truths.

This is a geometry-only desk adjudication against ADR 0004's definition of a Region. No second human reviewer or inter-rater study was available. The blind sheet enables independent re-adjudication, but this report does **not** claim that an independent panel confirmed its classifications. The negative finding is narrower and logical: a unique partition cannot be justified when the current Region definition permits competing ownership maps and the observable page supplies no criterion that excludes one. Production result validation confirms structural well-formedness, not positive evidence that either map is the correct page truth.

The review keeps three questions separate. **Author intent** is the RP-088 fixture writer's declared partition. **Observable spatial structure** is the anonymous visible geometry, including tracks, gaps, overlap, and vertical occupancy. **Reading Order requirement** is the sequence a later serializer would need. Neither an intended partition nor a desired sequence is evidence of Region ownership.

## Geometry-only adjudication

`MULTIPLE_VALID_PARTITIONS` here means multiple ownership representations remain compatible with the visible geometry and the current ADR definition; it does not mean either has met a future positive-evidence resolver policy. `REGION_OWNERSHIP_UNOBSERVABLE` means even the local grouping distinction is not visible in the rendered marks, despite the geometry table exposing the underlying groups. No threshold or approximate alignment was used.

| Blind layout | Classification | Spatial rationale and non-excluded alternative |
| --- | --- | --- |
| `B01` | `MULTIPLE_VALID_PARTITIONS` | A wide upper mark and two lower tracks are visible. A separate top owner and a larger owner including it both fit; width does not prove ownership. |
| `B02` | `MULTIPLE_VALID_PARTITIONS` | Four vertically aligned marks permit one continuing Region or several stacked Regions. Alignment proves neither. |
| `B03` | `REGION_OWNERSHIP_UNOBSERVABLE` | Inner marks overlap outer marks at the same y values. The rendering has no independent owner boundary or layer identity. |
| `B04` | `MULTIPLE_VALID_PARTITIONS` | Tracks with unequal observation counts permit two owners or one uneven spatial owner. Missing counterparts do not decide. |
| `B05` | `MULTIPLE_VALID_PARTITIONS` | A wide lower mark follows two upper tracks; a separate lower owner and a combined owner remain compatible. |
| `B06` | `MULTIPLE_VALID_PARTITIONS` | A narrow left track and wide right track are visible, but their width difference does not exclude one mixed-width owner. |
| `B07` | `MULTIPLE_VALID_PARTITIONS` | Two vertically separated full-width bands may be one continuing Region or two Regions. The gap alone is not a boundary witness. |
| `B08` | `MULTIPLE_VALID_PARTITIONS` | Two-track occupancy changes to one wide mark and back. The band transition is visible; a middle owner is not uniquely determined. |
| `B09` | `REGION_OWNERSHIP_UNOBSERVABLE` | Coincident boxes overprint each other. The rendering cannot reveal whether repeated groups share or split ownership. |
| `B10` | `MULTIPLE_VALID_PARTITIONS` | Persistent parallel tracks support a possible split but do not rule out one Region containing both tracks. |
| `B11` | `MULTIPLE_VALID_PARTITIONS` | A single sparse-side mark beside repeated opposite marks may be a separate owner or part of one spatial owner. |
| `B12` | `MULTIPLE_VALID_PARTITIONS` | Unequal-width parallel tracks do not by themselves determine one-versus-two owners. |

Count: `UNIQUE_OBSERVABLE_PARTITION` **0**; `MULTIPLE_VALID_PARTITIONS` **10**; `REGION_OWNERSHIP_UNOBSERVABLE` **2**; `INSUFFICIENT_RENDERING_INFORMATION` **0**. The geometry table makes the observation count and coordinates available even for overlapping cases; the missing fact is ownership, not a low-resolution screenshot. A one-VisualGroup page remains the separately contracted trivial one-Region case, outside this multi-group corpus.

## Reclassification of RP-088 controls

| Blind stimulus | RP-088 family | Pair disposition |
| --- | --- | --- |
| `B01` | `FULL_WIDTH_HEADER` | `AUTHOR_INTENT_CONFLICT` |
| `B02` | `SINGLE_COLUMN_CONTINUATION` | `AUTHOR_INTENT_CONFLICT` |
| `B03` | `NESTED_SIMILAR_BOUNDS` | `AUTHOR_INTENT_CONFLICT` |
| `B04` | `UNEQUAL_DENSITY` | `AUTHOR_INTENT_CONFLICT` |
| `B05` | `FULL_WIDTH_FOOTER` | `AUTHOR_INTENT_CONFLICT` |
| `B06` | `NARROW_SIDEBAR` | `AUTHOR_INTENT_CONFLICT` |
| `B07` | `STACKED_FULL_WIDTH` | `AUTHOR_INTENT_CONFLICT` |
| `B08` | `SPANNING_BETWEEN_BANDS` | `AUTHOR_INTENT_CONFLICT` |
| `B09` | `IDENTICAL_LOCAL_BOUNDS` | `AUTHOR_INTENT_CONFLICT` |
| `B10` | `PARALLEL_TRACKS` | `AUTHOR_INTENT_CONFLICT` |
| `B11` | `SPARSE_MISSING_SIDE` | `AUTHOR_INTENT_CONFLICT` |
| `B12` | `WIDE_SIDEBAR` | `AUTHOR_INTENT_CONFLICT` |

All twelve pairs are identical observable layouts assigned opposite author-declared partitions. They remain useful underdetermination controls, but **none is two independently validated opposite Region truths**. The RP-088 `EXACT_REGION_AMBIGUITY` label must not be promoted to policy ground truth without an independently justified, observable ownership distinction. No RP-088 fixture qualifies as `MUST_RESOLVE` ground truth under the ticket's validity criteria; all twelve require abstention for complete ownership with current approved evidence.

## Architectural consequence

- **Single column:** one Region is plausible, not proven. Neither repeated bounds nor continuity excludes a stacked partition.
- **Two columns and sidebars:** tracks are observable; the number of primary owners is not uniquely specified by tracks, gutter, or width.
- **Spanning:** a wide upper, middle, or lower mark is observable. Calling its owner `SPANNING` presupposes neighboring Region owners, so it cannot independently establish their partition.
- **Vertical transition:** HLE can describe changes in occupancy without converting band boundaries into Region ownership boundaries.
- **Reading Order:** `PARTIAL`. Some geometric precedence, such as a non-overlapping top mark before lower marks, can be stated without a unique Region map. A complete *correct* order, particularly across parallel tracks, is not guaranteed from geometry alone. Reading Order should specify its own evidence and abstention contract, not borrow an author-intended Region partition. No ordering rule is implemented here.

The target is **`PARTIALLY_ADJUDICABLE`**: canonical groups, their geometry, observable occupancy, and the trivial singleton owner are authoritative, but exact multi-group primary ownership is not adjudicable for this corpus under the present definition. Candidate clusters and `COLUMN_LIKE`/`SPANNING` roles may be optional convenience descriptions only when independently supported; they must not be manufactured to make an ambiguous page `RESOLVED`. Complete ambiguous ownership remains an `INSUFFICIENT_EVIDENCE` case. An ADR 0004 follow-up revision is required to say explicitly that author intent is not observable ground truth, that multiple compatible partitions are legitimate abstention evidence, and that ordering needs are separate from ownership. This report does not edit the ADR.

Recommended next work item: architecture clarification of the observable Region target and independent adjudication protocol, followed by a truly blinded multi-reviewer corpus if a positive `MUST_RESOLVE` family is still desired. Do not proceed directly to a Region resolver or policy from these controls.

## Verification and boundary

The blind stimulus integrity tests pass `2/2`; their independent TypeScript compile passes. The rendered sheet was inspected in the local browser. The full suite reports `917 PASS / 5 known reconstruction FAIL`; the reconstruction suite alone reports `15 PASS / 5 known FAIL`. The failure set remains two-column, sidebar, same-Y separate columns, split CJK heading, and public PDF reproduction. The production build passes. No numeric threshold, approximate alignment, Region resolver, Reading Order implementation, production source change, or parser behavior change was introduced.
