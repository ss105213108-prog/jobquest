import { describe, expect, it } from 'vitest'
import {
  VISUAL_GROUP_STRENGTHENED_AMBIGUITY_SET,
  rp060GroundTruthFixtures,
  visualGroupFixtureById,
  visualGroupGroundTruthFixtures,
} from './fixtures/pdfVisualGroupGroundTruth'
import {
  canonicalExpectedGroups,
  canonicalVisualGroupEvidenceSignature,
  materializeVisualGroupGroundTruth,
  validateMaterializedGroundTruth,
} from './helpers/pdfVisualGroupGroundTruthHarness'

const materializeById = (id: string) => materializeVisualGroupGroundTruth(
  visualGroupFixtureById(id),
)

const evidenceSignature = (id: string) => canonicalVisualGroupEvidenceSignature(
  materializeById(id),
)

const groupContaining = (fixtureId: string, runKey: string) => (
  canonicalExpectedGroups(visualGroupFixtureById(fixtureId).expectedGroups)
    .find((group) => group.includes(runKey))
)

const selectedGeometry = (fixtureId: string, runKeys: readonly string[]) => {
  const fixture = visualGroupFixtureById(fixtureId)
  const itemByKey = new Map(fixture.runs.map(({ key, item }) => [key, item]))
  return runKeys.map((key) => {
    const item = itemByKey.get(key)
    if (!item) throw new Error(`Unknown ${fixtureId} run: ${key}`)
    return {
      x: item.transform[4],
      y: item.transform[5],
      width: item.width,
      height: item.height,
    }
  })
}

const maximumExactEdgeRecurrence = (fixtureId: string) => {
  const evidence = materializeById(fixtureId).result.horizontalEvidence
  const counts = new Map<number, number>()
  for (const interval of evidence.runIntervals) {
    for (const edge of [interval.raw.startX, interval.raw.endX]) {
      counts.set(edge, (counts.get(edge) ?? 0) + 1)
    }
  }
  return Math.max(0, ...counts.values())
}

describe('RP-060 strengthened anonymous VisualGroup ground truth', () => {
  it('adds the complete RP-060 fixture extension without invalid partitions', () => {
    expect(visualGroupGroundTruthFixtures).toHaveLength(87)
    expect(rp060GroundTruthFixtures).toHaveLength(34)

    for (const fixture of rp060GroundTruthFixtures) {
      const materialized = materializeVisualGroupGroundTruth(fixture)
      expect(materialized.result.status).toBe('AVAILABLE')
      expect(validateMaterializedGroundTruth(materialized)).toEqual({ valid: true, issues: [] })
    }
  })

  it('contains every requested strengthened fixture family', () => {
    const ids = new Set(rp060GroundTruthFixtures.map((fixture) => fixture.id))
    for (const required of [
      'SPARSE_INLINE_EXACT',
      'SPARSE_SEPARATE_REGIONS_EXACT',
      'SPARSE_CONTEXT_B0',
      'SPARSE_CONTEXT_B1',
      'SPARSE_CONTEXT_B2',
      'SPARSE_CONTEXT_B3_SPANNING',
      'SPARSE_CONTEXT_B4_MISSING_SIDE',
      'REPEATED_INLINE_NO_SPAN',
      'REPEATED_COLUMNS_NO_SPAN',
      'HEADING_FRAGMENTS_STRONG',
      'COLUMN_FRAGMENTS_STRONG',
      'REPEATED_INLINE_TINY_JITTER',
      'REPEATED_LABEL_VALUE_TINY_JITTER',
      'TWO_COLUMN_MIXED_WIDTH_JITTER',
      'SIDEBAR_ROW_SPECIFIC_JITTER',
      'REPEATED_INLINE_BASELINE_JITTER',
      'CROSS_SLICE_ADJACENT_SAME',
      'CROSS_SLICE_ADJACENT_SEPARATE',
      'CANDIDATE_SPLIT_WITH_CONTEXT',
      'CANDIDATE_REMAIN_WITH_CONTEXT',
      'CJK_STRONG_SAME',
      'CJK_STRONG_SEPARATE',
      'LATIN_STRONG_SAME',
      'LATIN_STRONG_SEPARATE',
    ]) expect(ids.has(required)).toBe(true)
  })
})

describe('RP-060 observationally equivalent opposite ground truths', () => {
  const expectedAmbiguousPairs = VISUAL_GROUP_STRENGTHENED_AMBIGUITY_SET.filter(
    (pair) => pair.evidenceExpectation === 'EXPECTED_AMBIGUOUS',
  )

  it('marks six strengthened opposite pairs as intentionally ambiguous', () => {
    expect(expectedAmbiguousPairs).toHaveLength(6)
  })

  it.each(expectedAmbiguousPairs)(
    '$id has exact canonical Graph + HLE equivalence but opposite expected membership',
    (pair) => {
      expect(evidenceSignature(pair.groupedFixtureId))
        .toEqual(evidenceSignature(pair.splitFixtureId))
      expect(canonicalExpectedGroups(visualGroupFixtureById(pair.groupedFixtureId).expectedGroups))
        .not.toEqual(canonicalExpectedGroups(visualGroupFixtureById(pair.splitFixtureId).expectedGroups))

      const groupedContainer = groupContaining(pair.groupedFixtureId, pair.groupedRunKeys[0])
      expect(pair.groupedRunKeys.every((key) => groupedContainer?.includes(key))).toBe(true)
      const splitContainers = pair.splitRunKeys.map((key) => groupContaining(pair.splitFixtureId, key))
      expect(new Set(splitContainers.map((group) => group?.join('|'))).size).toBeGreaterThan(1)
    },
  )

  it('controls synthetic glyph evidence in every exact opposite pair', () => {
    for (const pair of expectedAmbiguousPairs) {
      const grouped = materializeById(pair.groupedFixtureId).result.horizontalEvidence
      const split = materializeById(pair.splitFixtureId).result.horizontalEvidence
      expect(grouped.runIntervals.map((interval) => interval.estimatedGlyphAdvance))
        .toEqual(split.runIntervals.map((interval) => interval.estimatedGlyphAdvance))
      expect(grouped.sliceGaps.map((gap) => gap.leftGlyphNormalizedGap))
        .toEqual(split.sliceGaps.map((gap) => gap.leftGlyphNormalizedGap))
    }
  })
})

describe('RP-060 sparse context and candidate-boundary evidence', () => {
  it('keeps the sparse target geometry and separate membership stable as context is added', () => {
    const ids = [
      'SPARSE_CONTEXT_B0',
      'SPARSE_CONTEXT_B1',
      'SPARSE_CONTEXT_B2',
      'SPARSE_CONTEXT_B3_SPANNING',
      'SPARSE_CONTEXT_B4_MISSING_SIDE',
    ]
    const targetKeys = ['sparse-opposite-left', 'sparse-opposite-right']
    const reference = selectedGeometry(ids[0], targetKeys)

    for (const id of ids) {
      expect(selectedGeometry(id, targetKeys)).toEqual(reference)
      expect(groupContaining(id, targetKeys[0])).not.toEqual(groupContaining(id, targetKeys[1]))
    }
    expect(ids.map((id) => materializeById(id).result.graph.runs.length))
      .toEqual([2, 4, 6, 5, 5])
  })

  it('models cross-slice adjacency with exact opposite evidence', () => {
    const same = materializeById('CROSS_SLICE_ADJACENT_SAME')
    const separate = materializeById('CROSS_SLICE_ADJACENT_SEPARATE')
    expect(same.result.graph.candidates).toHaveLength(2)
    expect(same.result.graph.relations).toHaveLength(1)
    expect(same.result.graph.relations[0]?.state).toBe('DEFERRED')
    expect(canonicalVisualGroupEvidenceSignature(same))
      .toEqual(canonicalVisualGroupEvidenceSignature(separate))
    expect(same.expectedGroups).not.toEqual(separate.expectedGroups)
  })

  it('keeps matched target-row geometry while surrounding context distinguishes split and remain cases', () => {
    const targetKeys = ['candidate-target-left', 'candidate-target-right']
    expect(selectedGeometry('CANDIDATE_SPLIT_WITH_CONTEXT', targetKeys))
      .toEqual(selectedGeometry('CANDIDATE_REMAIN_WITH_CONTEXT', targetKeys))
    expect(groupContaining('CANDIDATE_SPLIT_WITH_CONTEXT', targetKeys[0]))
      .not.toEqual(groupContaining('CANDIDATE_SPLIT_WITH_CONTEXT', targetKeys[1]))
    expect(groupContaining('CANDIDATE_REMAIN_WITH_CONTEXT', targetKeys[0]))
      .toEqual(groupContaining('CANDIDATE_REMAIN_WITH_CONTEXT', targetKeys[1]))
    expect(evidenceSignature('CANDIDATE_SPLIT_WITH_CONTEXT'))
      .not.toEqual(evidenceSignature('CANDIDATE_REMAIN_WITH_CONTEXT'))
  })
})

describe('RP-060 approximate-alignment and exporter-noise variants', () => {
  it.each([
    ['REPEATED_LABEL_VALUE', 'REPEATED_LABEL_VALUE_TINY_JITTER'],
    ['REPEATED_COLUMNS_NO_SPAN', 'TWO_COLUMN_MIXED_WIDTH_JITTER'],
    ['NARROW_SIDEBAR', 'SIDEBAR_ROW_SPECIFIC_JITTER'],
  ])('%s and %s retain ground truth while exact repeated edge evidence changes', (baseId, jitterId) => {
    expect(canonicalExpectedGroups(visualGroupFixtureById(jitterId).expectedGroups))
      .toEqual(canonicalExpectedGroups(visualGroupFixtureById(baseId).expectedGroups))
    expect(maximumExactEdgeRecurrence(jitterId)).toBeLessThan(maximumExactEdgeRecurrence(baseId))
    expect(evidenceSignature(jitterId)).not.toEqual(evidenceSignature(baseId))
  })

  it('retains inline intent while baseline-only exporter drift changes current vertical evidence', () => {
    const baseId = 'REPEATED_INLINE_NO_SPAN'
    const jitterId = 'REPEATED_INLINE_BASELINE_JITTER'
    expect(canonicalExpectedGroups(visualGroupFixtureById(jitterId).expectedGroups))
      .toEqual(canonicalExpectedGroups(visualGroupFixtureById(baseId).expectedGroups))
    expect(evidenceSignature(jitterId)).not.toEqual(evidenceSignature(baseId))
  })

  it('covers exact, coordinate-drift, mixed-width, and baseline-drift exporter representations', () => {
    const tags = new Set(rp060GroundTruthFixtures.flatMap((fixture) => fixture.tags ?? []))
    for (const required of [
      'exporter-exact',
      'exporter-drift',
      'tiny-deterministic',
      'mixed-width',
      'row-specific',
      'baseline',
    ]) expect(tags.has(required)).toBe(true)
  })
})

describe('RP-060 scale, permutation, and scope boundaries', () => {
  it.each([
    ['SPARSE_INLINE_EXACT', 'SPARSE_INLINE_EXACT_SCALE_2X'],
    ['SPARSE_SEPARATE_REGIONS_EXACT', 'SPARSE_SEPARATE_REGIONS_EXACT_SCALE_2X'],
    ['TWO_COLUMN_MIXED_WIDTH_JITTER', 'TWO_COLUMN_MIXED_WIDTH_JITTER_SCALE_2X'],
    ['CJK_STRONG_SAME', 'CJK_STRONG_SAME_SCALE_HALF'],
    ['CJK_STRONG_SEPARATE', 'CJK_STRONG_SEPARATE_SCALE_HALF'],
  ])('%s has scale-equivalent observations and membership in %s', (baseId, variantId) => {
    expect(canonicalExpectedGroups(visualGroupFixtureById(variantId).expectedGroups))
      .toEqual(canonicalExpectedGroups(visualGroupFixtureById(baseId).expectedGroups))
    expect(evidenceSignature(variantId)).toEqual(evidenceSignature(baseId))
  })

  it.each([
    ['SPARSE_INLINE_EXACT', 'SPARSE_INLINE_EXACT_PERMUTED'],
    ['SPARSE_SEPARATE_REGIONS_EXACT', 'SPARSE_SEPARATE_REGIONS_EXACT_PERMUTED'],
    ['REPEATED_COLUMNS_NO_SPAN', 'REPEATED_COLUMNS_NO_SPAN_PERMUTED'],
    ['CJK_STRONG_SAME', 'CJK_STRONG_SAME_PERMUTED'],
    ['CJK_STRONG_SEPARATE', 'CJK_STRONG_SEPARATE_PERMUTED'],
  ])('%s has permutation-equivalent observations and membership in %s', (baseId, variantId) => {
    expect(canonicalExpectedGroups(visualGroupFixtureById(variantId).expectedGroups))
      .toEqual(canonicalExpectedGroups(visualGroupFixtureById(baseId).expectedGroups))
    expect(evidenceSignature(variantId)).toEqual(evidenceSignature(baseId))
  })

  it('contains only anonymous evidence metadata and no policy vocabulary', () => {
    const serialized = JSON.stringify({
      fixtures: rp060GroundTruthFixtures,
      pairs: VISUAL_GROUP_STRENGTHENED_AMBIGUITY_SET,
    })
    for (const forbidden of [
      'email', 'phone', 'company', 'school', 'confidence', 'score', 'threshold',
      'readingOrder', 'columnOrder', 'regionOrder', 'shouldMerge', 'shouldSplit',
    ]) expect(serialized.toLowerCase()).not.toContain(forbidden.toLowerCase())
  })
})
