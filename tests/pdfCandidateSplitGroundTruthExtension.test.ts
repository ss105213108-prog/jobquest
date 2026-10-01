import { describe, expect, it } from 'vitest'
import {
  RP073_CANDIDATE_SPLIT_PAIRS,
  visualGroupFixtureById,
  visualGroupGroundTruthFixtures,
} from './fixtures/pdfVisualGroupGroundTruth'
import {
  canonicalVisualGroupEvidenceSignature,
  materializeVisualGroupGroundTruth,
  validateMaterializedGroundTruth,
} from './helpers/pdfVisualGroupGroundTruthHarness'

const materialize = (id: string) => materializeVisualGroupGroundTruth(visualGroupFixtureById(id))
const signature = (id: string) => canonicalVisualGroupEvidenceSignature(materialize(id))

const targetGeometry = (id: string, keys: readonly string[]) => {
  const fixture = visualGroupFixtureById(id)
  return keys.map((key) => {
    const item = fixture.runs.find((run) => run.key === key)?.item
    if (!item) throw new Error(`Unknown anonymous target: ${key}`)
    return {
      x: item.transform[4],
      baseline: item.transform[5],
      width: item.width,
      height: item.height,
    }
  })
}

const targetObservation = (id: string, keys: readonly string[]) => {
  const evidence = materialize(id)
  const runIds = keys.map((key) => evidence.runIdByKey.get(key))
  if (runIds.some((runId) => runId === undefined)) throw new Error('Unknown anonymous target')
  const [leftId, rightId] = runIds as number[]
  const relation = evidence.result.graph.relations.find((candidate) => (
    candidate.leftRunId === Math.min(leftId, rightId)
    && candidate.rightRunId === Math.max(leftId, rightId)
  ))
  return {
    sameCandidate: evidence.result.graph.candidates.some((candidate) => (
      candidate.runIds.includes(leftId) && candidate.runIds.includes(rightId)
    )),
    relationState: relation?.state ?? 'MISSING',
  }
}

const targetMembershipIsTogether = (id: string, keys: readonly string[]) => {
  const groups = materialize(id).expectedGroups
  return groups.some((group) => keys.every((key) => group.includes(key)))
}

describe('RP-073 matched candidate-split ground truth', () => {
  it('adds twelve matched pairs and twenty-two fixtures without changing RP-060 membership', () => {
    expect(RP073_CANDIDATE_SPLIT_PAIRS).toHaveLength(12)
    expect(visualGroupGroundTruthFixtures.filter((fixture) => fixture.tags?.includes('rp073')))
      .toHaveLength(22)
    expect(RP073_CANDIDATE_SPLIT_PAIRS.map((pair) => pair.id)).toEqual([
      'INDEPENDENT_CONTINUATION',
      'ASYMMETRIC_DENSITY',
      'INTERLEAVED_CONTINUATION',
      'SPANNING_CONTEXT',
      'NESTED_FRAGMENTS',
      'CROSS_CANDIDATE_CONTROL',
      'TWO_COLUMN_50_50_MATCHED',
      'TWO_COLUMN_30_70_MATCHED',
      'TWO_COLUMN_UNEQUAL_DENSITY_MATCHED',
      'NARROW_SIDEBAR_MATCHED',
      'WIDE_SIDEBAR_MATCHED',
      'SPARSE_SIDEBAR_MATCHED',
    ])
  })

  it.each(RP073_CANDIDATE_SPLIT_PAIRS)(
    '$id keeps target geometry and Graph/HLE evidence matched despite opposite membership',
    (pair) => {
      const separated = materialize(pair.separatedFixtureId)
      const inline = materialize(pair.inlineFixtureId)
      expect(validateMaterializedGroundTruth(separated)).toEqual({ valid: true, issues: [] })
      expect(validateMaterializedGroundTruth(inline)).toEqual({ valid: true, issues: [] })
      expect(targetGeometry(pair.separatedFixtureId, pair.separatedTargetRunKeys))
        .toEqual(targetGeometry(pair.inlineFixtureId, pair.inlineTargetRunKeys))
      expect(targetObservation(pair.separatedFixtureId, pair.separatedTargetRunKeys))
        .toEqual(targetObservation(pair.inlineFixtureId, pair.inlineTargetRunKeys))
      expect(targetMembershipIsTogether(pair.separatedFixtureId, pair.separatedTargetRunKeys))
        .toBe(false)
      expect(targetMembershipIsTogether(pair.inlineFixtureId, pair.inlineTargetRunKeys))
        .toBe(true)
      expect(pair.evidenceExpectation).toBe('EXACT_EVIDENCE_EQUIVALENT')
      expect(canonicalVisualGroupEvidenceSignature(separated))
        .toEqual(canonicalVisualGroupEvidenceSignature(inline))
      expect(separated.result.horizontalEvidence.runIntervals.map((interval) => interval.estimatedGlyphAdvance))
        .toEqual(inline.result.horizontalEvidence.runIntervals.map((interval) => interval.estimatedGlyphAdvance))
    },
  )

  it('keeps the first five families on one provisional target candidate', () => {
    for (const pair of RP073_CANDIDATE_SPLIT_PAIRS.slice(0, 5)) {
      expect(targetObservation(pair.separatedFixtureId, pair.separatedTargetRunKeys))
        .toEqual({ sameCandidate: true, relationState: 'SUPPORTED' })
    }
  })

  it('keeps the cross-candidate control in separate candidates with direct permission', () => {
    const pair = RP073_CANDIDATE_SPLIT_PAIRS.find((candidate) => candidate.id === 'CROSS_CANDIDATE_CONTROL')
    if (!pair) throw new Error('Missing cross-candidate control')
    expect(targetObservation(pair.separatedFixtureId, pair.separatedTargetRunKeys))
      .toEqual({ sameCandidate: false, relationState: 'DEFERRED' })
  })

  it('records continuation, density, interleaving, spanning, and nested context without a policy result', () => {
    const summary = (id: string) => {
      const { graph, horizontalEvidence } = materialize(id).result
      return {
        runs: graph.runs.length,
        slices: horizontalEvidence.slices.length,
        multiRunSlices: horizontalEvidence.slices.filter((slice) => slice.runIds.length > 1).length,
        singleRunSlices: horizontalEvidence.slices.filter((slice) => slice.runIds.length === 1).length,
      }
    }
    expect(summary('TRUE_SEPARATED_CONTINUATION'))
      .toEqual({ runs: 8, slices: 5, multiRunSlices: 3, singleRunSlices: 2 })
    expect(summary('TRUE_COLUMNS_ASYMMETRIC'))
      .toEqual({ runs: 7, slices: 5, multiRunSlices: 2, singleRunSlices: 3 })
    expect(summary('SEPARATED_INTERLEAVED'))
      .toEqual({ runs: 6, slices: 4, multiRunSlices: 2, singleRunSlices: 2 })
    expect(summary('SEPARATED_WITH_SPANNING_CONTEXT'))
      .toEqual({ runs: 5, slices: 3, multiRunSlices: 2, singleRunSlices: 1 })
    expect(summary('TRUE_COLUMNS_NESTED'))
      .toEqual({ runs: 6, slices: 2, multiRunSlices: 2, singleRunSlices: 0 })
  })

  it('keeps exact evidence relationships under uniform scale and input permutation', () => {
    for (const [base, scaled, permuted] of [
      [
        'TRUE_SEPARATED_CONTINUATION',
        'TRUE_SEPARATED_CONTINUATION_SCALE_2X',
        'TRUE_SEPARATED_CONTINUATION_PERMUTED',
      ],
      [
        'INLINE_CONTINUATION_MATCHED',
        'INLINE_CONTINUATION_MATCHED_SCALE_2X',
        'INLINE_CONTINUATION_MATCHED_PERMUTED',
      ],
    ]) {
      expect(signature(scaled)).toEqual(signature(base))
      expect(signature(permuted)).toEqual(signature(base))
    }
    expect(signature('TRUE_SEPARATED_CONTINUATION_SCALE_2X'))
      .toEqual(signature('INLINE_CONTINUATION_MATCHED_SCALE_2X'))
    expect(signature('TRUE_SEPARATED_CONTINUATION_PERMUTED'))
      .toEqual(signature('INLINE_CONTINUATION_MATCHED_PERMUTED'))
  })

  it('excludes fixture labels, original run identities, font names, and same-length token spelling', () => {
    const source = visualGroupFixtureById('TRUE_SEPARATED_CONTINUATION')
    const relabeled = {
      ...source,
      id: 'ANONYMOUS_RELABELED',
      runs: source.runs.map(({ item }, index) => ({
        key: `anonymous-${index}`,
        item: { ...item, str: 'X'.repeat(item.str.length), fontName: 'OtherSynthetic' },
      })),
    }
    expect(canonicalVisualGroupEvidenceSignature(materializeVisualGroupGroundTruth(relabeled)))
      .toEqual(signature(source.id))
  })
})
