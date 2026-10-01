import { describe, expect, it } from 'vitest'
import type { GeometryRun } from '../src/parsers/pdfTextGeometry'
import type { PolicyResult, RowCandidateProposal } from '../src/parsers/pdfRowEvidenceGraphBuilder'
import type { RowEvidenceGraph, VerticalRelationState } from '../src/parsers/pdfRowEvidenceGraph'
import { proposeRowCandidates } from '../src/parsers/pdfRowCandidateProposal'
import {
  calibrateVerticalEvidence,
  type VerticalCalibrationSnapshot,
} from '../src/parsers/pdfVerticalCalibration'
import {
  candidateRun,
  exactBaselineRuns,
  farApartExactBaselineRuns,
  mixedHeightRuns,
  scaleRuns,
  splitCjkRuns,
  splitLatinRuns,
  tinyJitterRuns,
} from './fixtures/pdfRowCandidateProposalContract'
import {
  proposalMembership,
} from './helpers/rowCandidateProposalContractHarness'
import { validateProposedVisualGroups } from './helpers/rowEvidenceGraphContractHarness'

const calibrationFor = (runs: readonly GeometryRun[]): VerticalCalibrationSnapshot => {
  const result = calibrateVerticalEvidence(runs)
  expect(result.ok).toBe(true)
  if (!result.ok) throw new Error(`Expected calibration success, received ${result.code}`)
  return result.value
}

const propose = (
  runs: readonly GeometryRun[],
  calibration = calibrationFor(runs),
): readonly RowCandidateProposal[] => {
  const result = proposeRowCandidates(runs, calibration)
  expect(result.ok).toBe(true)
  if (!result.ok) throw new Error(`Expected proposal success, received ${result.code}`)
  return result.value
}

const expectFailure = (
  result: PolicyResult<readonly RowCandidateProposal[]>,
  code: string,
) => {
  expect(result).toMatchObject({ ok: false, code })
  expect(result).not.toHaveProperty('value')
}

const graphFrom = (
  runs: readonly GeometryRun[],
  proposals: readonly RowCandidateProposal[],
  relationState?: VerticalRelationState,
): RowEvidenceGraph => ({
  runs,
  candidates: proposals.map((proposal, index) => ({
    id: `candidate-${index}`,
    runIds: proposal.runIds,
    geometryStatus: 'comparable',
  })),
  relations: relationState ? [{
    leftRunId: 0,
    rightRunId: 1,
    state: relationState,
    evidence: {
      baselineDifference: Math.abs(runs[0].baseline - runs[1].baseline),
      heightRatio: 1,
      verticalOverlapRatio: 1,
      geometryComparable: true,
    },
  }] : [],
})

describe('RP-031 RowCandidateProposalPolicy contract', () => {
  it('groups exact same-baseline runs into one proposal', () => {
    expect(proposalMembership(propose(exactBaselineRuns()))).toEqual([[0, 1]])
  })

  it('groups exact same-baseline runs despite far-apart X positions', () => {
    expect(proposalMembership(propose(farApartExactBaselineRuns()))).toEqual([[0, 1]])
  })

  it('keeps a tiny nonzero baseline difference as singleton proposals', () => {
    expect(proposalMembership(propose(tinyJitterRuns()))).toEqual([[0], [1]])
  })

  it('keeps a larger nonzero baseline difference as separate proposals', () => {
    const runs = [candidateRun(0, 100), candidateRun(1, 104)]
    expect(proposalMembership(propose(runs))).toEqual([[0], [1]])
  })

  it('preserves membership semantics under uniform scaling', () => {
    const runs = [candidateRun(0, 100), candidateRun(1, 100), candidateRun(2, 114)]
    expect(proposalMembership(propose(scaleRuns(runs, 7)))).toEqual(proposalMembership(propose(runs)))
  })

  it('returns deep-equal normalized proposals for input permutations', () => {
    const runs = [candidateRun(8, 120), candidateRun(2, 100), candidateRun(5, 100)]
    expect(propose([runs[1], runs[2], runs[0]])).toEqual(propose([runs[0], runs[2], runs[1]]))
  })

  it('does not use text for membership', () => {
    const runs = exactBaselineRuns()
    const changed = runs.map((run) => ({ ...run, text: `anonymous-${run.originalIndex}` }))
    expect(propose(changed)).toEqual(propose(runs))
  })

  it('does not use font metadata for membership', () => {
    const runs = exactBaselineRuns()
    const changed = runs.map((run) => ({ ...run, fontName: `Font-${run.originalIndex}` }))
    expect(propose(changed)).toEqual(propose(runs))
  })

  it('does not use X, width, or endX for membership', () => {
    const runs = exactBaselineRuns()
    const changed = runs.map((run, index) => ({ ...run, x: 800 - index * 500, width: 200, endX: 1000 - index * 500 }))
    expect(propose(changed)).toEqual(propose(runs))
  })

  it('does not use hasEOL for membership', () => {
    const runs = exactBaselineRuns()
    const changed = runs.map((run) => ({ ...run, hasEOL: !run.hasEOL }))
    expect(propose(changed)).toEqual(propose(runs))
  })

  it('groups mixed-height runs with an exact shared baseline', () => {
    expect(proposalMembership(propose(mixedHeightRuns()))).toEqual([[0, 1]])
  })

  it('keeps mixed-height runs with offset baselines as singletons', () => {
    expect(proposalMembership(propose(mixedHeightRuns(0.01)))).toEqual([[0], [1]])
  })

  it('keeps a zero-height run singleton even beside an exact-baseline usable run', () => {
    const runs = [candidateRun(0, 100, { height: 0 }), candidateRun(1, 100, { height: 10 })]
    expect(proposalMembership(propose(runs))).toEqual([[0], [1]])
  })

  it('keeps a superscript-like offset singleton', () => {
    const runs = [candidateRun(0, 100, { height: 12 }), candidateRun(1, 103, { height: 6 })]
    expect(proposalMembership(propose(runs))).toEqual([[0], [1]])
  })

  it('groups split CJK fragments with exact baselines', () => {
    expect(proposalMembership(propose(splitCjkRuns()))).toEqual([[0, 1, 2, 3]])
  })

  it('keeps the nonzero-jitter CJK fragment outside the exact-baseline proposal', () => {
    expect(proposalMembership(propose(splitCjkRuns(1e-9)))).toEqual([[0, 2, 3], [1]])
  })

  it('groups split Latin fragments with exact baselines', () => {
    expect(proposalMembership(propose(splitLatinRuns()))).toEqual([[0, 1]])
  })

  it('keeps adjacent real vertical rows separate', () => {
    const runs = [candidateRun(0, 100, { text: 'Software Engineer' }), candidateRun(1, 86, { text: '2023 - Present' })]
    expect(proposalMembership(propose(runs))).toEqual([[0], [1]])
  })

  it('does not form a fuzzy connected component from a nonzero chaining fixture', () => {
    const runs = [candidateRun(0, 100), candidateRun(1, 100.000001), candidateRun(2, 100.000002)]
    expect(proposalMembership(propose(runs))).toEqual([[0], [1], [2]])
  })

  it('partitions every safe run exactly once', () => {
    const runs = [candidateRun(4, 100), candidateRun(9, 100), candidateRun(2, 80)]
    const ids = propose(runs).flatMap((proposal) => proposal.runIds)
    expect([...ids].sort((left, right) => left - right)).toEqual([2, 4, 9])
    expect(new Set(ids).size).toBe(runs.length)
  })

  it('never returns an empty proposal', () => {
    const proposals = propose([candidateRun(0, 100), candidateRun(1, 110)])
    expect(proposals.every((proposal) => proposal.runIds.length > 0)).toBe(true)
  })

  it('orders member IDs canonically', () => {
    const runs = [candidateRun(9, 100), candidateRun(2, 100), candidateRun(5, 100)]
    expect(proposalMembership(propose(runs))).toEqual([[2, 5, 9]])
  })

  it('orders proposals deterministically by canonical membership', () => {
    const runs = [candidateRun(9, 70), candidateRun(2, 100), candidateRun(5, 100), candidateRun(1, 80)]
    expect(proposalMembership(propose(runs))).toEqual([[1], [2, 5], [9]])
  })

  it('returns structured failure for a snapshot/run ID mismatch', () => {
    const runs = exactBaselineRuns()
    const calibration = calibrationFor(runs)
    const mismatched = { ...calibration, runs: [{ runId: 0, heightToRepresentativeRatio: 1 }, { runId: 7, heightToRepresentativeRatio: 1 }] }
    expectFailure(proposeRowCandidates(runs, mismatched), 'CALIBRATION_RUN_SET_MISMATCH')
  })

  it('returns structured failure when snapshot run evidence is missing', () => {
    const runs = exactBaselineRuns()
    const calibration = calibrationFor(runs)
    expectFailure(proposeRowCandidates(runs, { ...calibration, runs: calibration.runs.slice(0, 1) }), 'CALIBRATION_RUN_SET_MISMATCH')
  })

  it('returns structured failure when snapshot has unknown run evidence', () => {
    const runs = exactBaselineRuns()
    const calibration = calibrationFor(runs)
    const unknown = { ...calibration, runs: [...calibration.runs, { runId: 99, heightToRepresentativeRatio: 1 }] }
    expectFailure(proposeRowCandidates(runs, unknown), 'CALIBRATION_RUN_SET_MISMATCH')
  })

  it('returns structured failure for duplicate snapshot run evidence', () => {
    const runs = exactBaselineRuns()
    const calibration = calibrationFor(runs)
    const duplicate = { ...calibration, runs: [...calibration.runs, calibration.runs[0]] }
    expectFailure(proposeRowCandidates(runs, duplicate), 'DUPLICATE_CALIBRATION_RUN_EVIDENCE')
  })

  it('returns structured failure for an invalid representative height', () => {
    const runs = exactBaselineRuns()
    const calibration = calibrationFor(runs)
    const invalid = { ...calibration, normalization: { ...calibration.normalization, representativeHeight: 0 } }
    expectFailure(proposeRowCandidates(runs, invalid), 'INVALID_CALIBRATION_SNAPSHOT')
  })

  it('returns policy-context failure for unsafe GeometryRun input', () => {
    const safeRuns = exactBaselineRuns()
    const unsafeRuns = [{ ...safeRuns[0], geometryComparable: false }, safeRuns[1]]
    expectFailure(proposeRowCandidates(unsafeRuns, calibrationFor(safeRuns)), 'UNSAFE_CANDIDATE_INPUT')
  })

  it('returns structured failure for duplicate canonical input identity', () => {
    const runs = [candidateRun(0, 100), candidateRun(0, 100)]
    const calibration = calibrationFor([candidateRun(0, 100)])
    expectFailure(proposeRowCandidates(runs, calibration), 'DUPLICATE_CANONICAL_RUN_ID')
  })

  it('does not mutate input runs', () => {
    const runs = exactBaselineRuns()
    const before = structuredClone(runs)
    propose(runs)
    expect(runs).toEqual(before)
  })

  it('does not mutate the calibration snapshot', () => {
    const runs = exactBaselineRuns()
    const calibration = calibrationFor(runs)
    const before = structuredClone(calibration)
    propose(runs, calibration)
    expect(calibration).toEqual(before)
  })

  it('returns only runIds in each proposal schema', () => {
    for (const proposal of propose(exactBaselineRuns())) expect(Object.keys(proposal)).toEqual(['runIds'])
  })

  it('keeps relation, evidence, candidate, column, row-band, and logical-line fields out of output', () => {
    const serialized = JSON.stringify(propose(exactBaselineRuns()))
    for (const field of ['text', 'state', 'evidence', 'candidateId', 'column', 'rowBand', 'logicalLine']) {
      expect(serialized).not.toContain(field)
    }
  })

  it('allows later fake DEFERRED relation recovery across singleton proposals', () => {
    const runs = tinyJitterRuns()
    const proposals = propose(runs)
    expect(validateProposedVisualGroups(graphFrom(runs, proposals, 'DEFERRED'), [[0, 1]]).valid).toBe(true)
  })

  it('allows later fake SUPPORTED relation recovery across singleton proposals', () => {
    const runs = tinyJitterRuns()
    const proposals = propose(runs)
    expect(validateProposedVisualGroups(graphFrom(runs, proposals, 'SUPPORTED'), [[0, 1]]).valid).toBe(true)
  })

  it('does not automatically create REJECTED for different proposals', () => {
    const runs = tinyJitterRuns()
    const graph = graphFrom(runs, propose(runs))
    expect(graph.relations).toEqual([])
    expect(graph.relations.some((relation) => relation.state === 'REJECTED')).toBe(false)
  })

  it('does not automatically create SUPPORTED for members of the same proposal', () => {
    const runs = exactBaselineRuns()
    const graph = graphFrom(runs, propose(runs))
    expect(graph.relations).toEqual([])
    expect(validateProposedVisualGroups(graph, [[0, 1]]).valid).toBe(true)
  })

  it('does not authorize cross-candidate recovery when a relation is missing', () => {
    const runs = tinyJitterRuns()
    const result = validateProposedVisualGroups(graphFrom(runs, propose(runs)), [[0, 1]])
    expect(result.violations).toContain('CROSS_CANDIDATE_MERGE_WITHOUT_PERMISSION')
  })
})
