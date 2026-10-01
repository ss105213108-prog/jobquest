import { describe, expect, it } from 'vitest'
import { validateRowEvidenceGraph, type VerticalRelationState } from '../src/parsers/pdfRowEvidenceGraph'
import { buildRowEvidenceGraph as buildRowEvidenceGraphContract } from '../src/parsers/pdfRowEvidenceGraphBuilder'
import {
  anonymousGeometryRun,
  anonymousMissingDecision,
  anonymousRelation,
  anonymousVerticalEvidence,
  nonFiniteGeometryRun,
  rotatedGeometryRun,
} from './fixtures/pdfRowEvidenceGraphBuilderContract'
import {
  fakeBuilderDependencies,
  type BuilderContractResult,
  type TestCandidateProposal,
  type TestRelationProposal,
} from './helpers/rowEvidenceGraphBuilderContractHarness'

const expectFailure = (
  result: BuilderContractResult,
  stage: Exclude<BuilderContractResult, { ok: true }>['stage'],
  issue: string,
) => {
  expect(result.ok).toBe(false)
  if (result.ok) throw new Error('Expected builder contract failure')
  expect(result.stage).toBe(stage)
  expect(result.issues.map((candidate) => candidate.code)).toContain(issue)
  expect(result).not.toHaveProperty('graph')
}

const expectSuccess = (result: BuilderContractResult) => {
  expect(result.ok).toBe(true)
  if (!result.ok) throw new Error(`Expected builder contract success: ${result.issues.join(', ')}`)
  return result.graph
}

describe('RP-025 RowEvidenceGraph builder orchestration contract', () => {
  it('assembles a valid graph containing every canonical run exactly once', () => {
    const runs = [anonymousGeometryRun(0), anonymousGeometryRun(1)]
    const { dependencies, record } = fakeBuilderDependencies()
    const graph = expectSuccess(buildRowEvidenceGraphContract(runs, dependencies))

    expect(validateRowEvidenceGraph(graph)).toEqual({ valid: true, issues: [] })
    expect(graph.runs.map((run) => run.originalIndex)).toEqual([0, 1])
    expect(graph.candidates.flatMap((candidate) => candidate.runIds).sort()).toEqual([0, 1])
    expect(record.callOrder).toEqual(['calibration', 'candidate-proposal', 'relation-classification'])
  })

  it('passes canonically ordered safe runs to every policy stage', () => {
    const { dependencies, record } = fakeBuilderDependencies()
    expectSuccess(buildRowEvidenceGraphContract([
      anonymousGeometryRun(8),
      anonymousGeometryRun(2),
      anonymousGeometryRun(5),
    ], dependencies))

    expect(record.calibrationRunIds).toEqual([[2, 5, 8]])
    expect(record.candidateRunIds).toEqual([[2, 5, 8]])
    expect(record.classifierRunIds).toEqual([[2, 5, 8]])
  })

  it('rejects duplicate canonical identity before calling a dependency', () => {
    const { dependencies, record } = fakeBuilderDependencies()
    const result = buildRowEvidenceGraphContract([
      anonymousGeometryRun(1),
      anonymousGeometryRun(1, { str: 'different anonymous text' }),
    ], dependencies)

    expectFailure(result, 'input', 'INVALID_CANONICAL_IDENTITY')
    expect(record.callOrder).toEqual([])
  })

  it('keeps rotated and non-finite runs out of all speculative policy stages', () => {
    const { dependencies, record } = fakeBuilderDependencies()
    expectSuccess(buildRowEvidenceGraphContract([
      rotatedGeometryRun(2),
      anonymousGeometryRun(0),
      nonFiniteGeometryRun(3),
      anonymousGeometryRun(1),
    ], dependencies))

    expect(record.calibrationRunIds).toEqual([[0, 1]])
    expect(record.candidateRunIds).toEqual([[0, 1]])
    expect(record.classifierRunIds).toEqual([[0, 1]])
  })

  it('gives every unsafe run one builder-owned isolated singleton candidate', () => {
    const { dependencies } = fakeBuilderDependencies()
    const graph = expectSuccess(buildRowEvidenceGraphContract([
      anonymousGeometryRun(0),
      rotatedGeometryRun(2),
      nonFiniteGeometryRun(3),
    ], dependencies))

    expect(graph.candidates.filter((candidate) => candidate.geometryStatus === 'isolated-unsafe')).toEqual([
      { id: 'unsafe:2', runIds: [2], geometryStatus: 'isolated-unsafe' },
      { id: 'unsafe:3', runIds: [3], geometryStatus: 'isolated-unsafe' },
    ])
    expect(graph.relations).toEqual([])
  })

  it('rejects a fake relation that guesses an unsafe run ID instead of silently filtering it', () => {
    const { dependencies } = fakeBuilderDependencies({
      relationResult: { ok: true, value: [anonymousRelation(0, 2, 'DEFERRED')] },
    })
    const result = buildRowEvidenceGraphContract([
      anonymousGeometryRun(0),
      rotatedGeometryRun(2),
    ], dependencies)

    expectFailure(result, 'relation-classification', 'UNSAFE_RELATION_REFERENCE')
  })

  it('rejects a candidate proposal that misses a safe run', () => {
    const { dependencies } = fakeBuilderDependencies({
      candidateResult: { ok: true, value: [{ runIds: [0] }] },
    })
    const result = buildRowEvidenceGraphContract([anonymousGeometryRun(0), anonymousGeometryRun(1)], dependencies)
    expectFailure(result, 'candidate-proposal', 'MISSING_PROPOSAL_MEMBERSHIP')
  })

  it('rejects a candidate proposal that owns one safe run twice', () => {
    const proposals: readonly TestCandidateProposal[] = [{ runIds: [0] }, { runIds: [0, 1] }]
    const { dependencies } = fakeBuilderDependencies({ candidateResult: { ok: true, value: proposals } })
    const result = buildRowEvidenceGraphContract([anonymousGeometryRun(0), anonymousGeometryRun(1)], dependencies)
    expectFailure(result, 'candidate-proposal', 'DUPLICATE_PROPOSAL_MEMBERSHIP')
  })

  it('rejects a candidate proposal containing an unknown run ID', () => {
    const { dependencies } = fakeBuilderDependencies({
      candidateResult: { ok: true, value: [{ runIds: [0, 99] }] },
    })
    const result = buildRowEvidenceGraphContract([anonymousGeometryRun(0)], dependencies)
    expectFailure(result, 'candidate-proposal', 'UNKNOWN_PROPOSAL_RUN_ID')
  })

  it('derives candidate IDs from canonical membership rather than proposal order or text', () => {
    const firstRuns = [anonymousGeometryRun(0), anonymousGeometryRun(1), anonymousGeometryRun(2)]
    const secondRuns = firstRuns.map((run) => ({ ...run, text: `changed-${run.originalIndex}` })).reverse()
    const first = fakeBuilderDependencies({
      candidateResult: { ok: true, value: [{ runIds: [2, 1] }, { runIds: [0] }] },
    })
    const second = fakeBuilderDependencies({
      candidateResult: { ok: true, value: [{ runIds: [0] }, { runIds: [1, 2] }] },
    })

    const firstGraph = expectSuccess(buildRowEvidenceGraphContract(firstRuns, first.dependencies))
    const secondGraph = expectSuccess(buildRowEvidenceGraphContract(secondRuns, second.dependencies))
    expect(firstGraph.candidates).toEqual(secondGraph.candidates)
  })

  it('preserves an explicitly classified DEFERRED relation unchanged', () => {
    const { dependencies } = fakeBuilderDependencies({
      relationResult: { ok: true, value: [anonymousRelation(0, 1, 'DEFERRED')] },
    })
    const graph = expectSuccess(buildRowEvidenceGraphContract([
      anonymousGeometryRun(0),
      anonymousGeometryRun(1),
    ], dependencies))

    expect(graph.relations).toEqual([{
      leftRunId: 0,
      rightRunId: 1,
      state: 'DEFERRED',
      evidence: anonymousVerticalEvidence,
    }])
  })

  it('projects an explicit MISSING decision without synthesizing any state', () => {
    const { dependencies } = fakeBuilderDependencies({
      relationResult: { ok: true, value: [anonymousMissingDecision(0, 1)] },
    })
    const graph = expectSuccess(buildRowEvidenceGraphContract([
      anonymousGeometryRun(0),
      anonymousGeometryRun(1),
    ], dependencies))
    expect(graph.relations).toEqual([])
  })

  it('normalizes relation endpoints to unordered canonical identity', () => {
    const { dependencies } = fakeBuilderDependencies({
      relationResult: { ok: true, value: [anonymousRelation(7, 2, 'SUPPORTED')] },
    })
    const graph = expectSuccess(buildRowEvidenceGraphContract([
      anonymousGeometryRun(7),
      anonymousGeometryRun(2),
    ], dependencies))
    expect(graph.relations[0]).toEqual({
      leftRunId: 2,
      rightRunId: 7,
      state: 'SUPPORTED',
      evidence: anonymousVerticalEvidence,
    })
  })

  it('does not silently deduplicate reversed duplicate relations', () => {
    const { dependencies } = fakeBuilderDependencies({
      relationResult: {
        ok: true,
        value: [anonymousRelation(0, 1, 'SUPPORTED'), anonymousRelation(1, 0, 'SUPPORTED')],
      },
    })
    const result = buildRowEvidenceGraphContract([anonymousGeometryRun(0), anonymousGeometryRun(1)], dependencies)
    expectFailure(result, 'relation-classification', 'DUPLICATE_PAIR_DECISION')
  })

  it('does not choose a winner for conflicting relation states', () => {
    const { dependencies } = fakeBuilderDependencies({
      relationResult: {
        ok: true,
        value: [anonymousRelation(0, 1, 'SUPPORTED'), anonymousRelation(1, 0, 'REJECTED')],
      },
    })
    const result = buildRowEvidenceGraphContract([anonymousGeometryRun(0), anonymousGeometryRun(1)], dependencies)
    expectFailure(result, 'relation-classification', 'DUPLICATE_PAIR_DECISION')
  })

  it('rejects a self pair during decision-batch validation', () => {
    const { dependencies } = fakeBuilderDependencies({
      relationResult: { ok: true, value: [anonymousRelation(0, 0, 'SUPPORTED')] },
    })
    const result = buildRowEvidenceGraphContract([anonymousGeometryRun(0)], dependencies)
    expectFailure(result, 'relation-classification', 'SELF_PAIR_DECISION')
  })

  it('rejects an unsupported runtime relation state without returning a partial graph', () => {
    const malformed = {
      ...anonymousRelation(0, 1, 'SUPPORTED'),
      state: 'UNKNOWN' as VerticalRelationState,
    }
    const { dependencies } = fakeBuilderDependencies({
      relationResult: { ok: true, value: [malformed] },
    })
    const result = buildRowEvidenceGraphContract([anonymousGeometryRun(0), anonymousGeometryRun(1)], dependencies)
    expectFailure(result, 'relation-classification', 'INVALID_RELATION_DECISION')
  })

  it('stops after calibration failure with no partial graph', () => {
    const { dependencies, record } = fakeBuilderDependencies({
      calibrationResult: { ok: false, code: 'CALIBRATION_FAILED' },
    })
    const result = buildRowEvidenceGraphContract([anonymousGeometryRun(0)], dependencies)

    expectFailure(result, 'calibration', 'CALIBRATION_FAILED')
    expect(record.callOrder).toEqual(['calibration'])
  })

  it('does not create a singleton guessing fallback for insufficient calibration', () => {
    const { dependencies, record } = fakeBuilderDependencies({
      calibrationResult: { ok: false, code: 'INSUFFICIENT_CALIBRATION' },
    })
    const result = buildRowEvidenceGraphContract([anonymousGeometryRun(0), anonymousGeometryRun(1)], dependencies)

    expectFailure(result, 'calibration', 'INSUFFICIENT_CALIBRATION')
    expect(record.callOrder).toEqual(['calibration'])
  })

  it('stops after candidate proposer failure without calling the classifier', () => {
    const { dependencies, record } = fakeBuilderDependencies({
      candidateResult: { ok: false, code: 'CANDIDATE_POLICY_FAILED' },
    })
    const result = buildRowEvidenceGraphContract([anonymousGeometryRun(0)], dependencies)

    expectFailure(result, 'candidate-proposal', 'CANDIDATE_POLICY_FAILED')
    expect(record.callOrder).toEqual(['calibration', 'candidate-proposal'])
  })

  it('returns relation classifier failure without partial success', () => {
    const { dependencies, record } = fakeBuilderDependencies({
      relationResult: { ok: false, code: 'RELATION_POLICY_FAILED' },
    })
    const result = buildRowEvidenceGraphContract([anonymousGeometryRun(0)], dependencies)

    expectFailure(result, 'relation-classification', 'RELATION_POLICY_FAILED')
    expect(record.callOrder).toEqual(['calibration', 'candidate-proposal', 'relation-classification'])
  })

  it('rejects duplicate pair decisions rather than repairing invalid assembly', () => {
    const relations: readonly TestRelationProposal[] = [
      anonymousRelation(0, 1, 'DEFERRED'),
      anonymousRelation(1, 0, 'DEFERRED'),
    ]
    const { dependencies } = fakeBuilderDependencies({ relationResult: { ok: true, value: relations } })
    const result = buildRowEvidenceGraphContract([anonymousGeometryRun(0), anonymousGeometryRun(1)], dependencies)
    expectFailure(result, 'relation-classification', 'DUPLICATE_PAIR_DECISION')
  })

  it('does not mutate runs or any dependency output', () => {
    const runs = [anonymousGeometryRun(1), anonymousGeometryRun(0)]
    const calibration = { status: 'READY' as const, marker: 'immutable-calibration' }
    const proposals: readonly TestCandidateProposal[] = [{ runIds: [1, 0] }]
    const relations: readonly TestRelationProposal[] = [anonymousRelation(1, 0, 'DEFERRED')]
    const snapshot = structuredClone({ runs, calibration, proposals, relations })
    const { dependencies } = fakeBuilderDependencies({
      calibrationResult: { ok: true, value: calibration },
      candidateResult: { ok: true, value: proposals },
      relationResult: { ok: true, value: relations },
    })

    expectSuccess(buildRowEvidenceGraphContract(runs, dependencies))
    expect({ runs, calibration, proposals, relations }).toEqual(snapshot)
  })

  it('produces a deep-equal graph for semantically equivalent input permutations', () => {
    const canonicalRuns = [anonymousGeometryRun(0), anonymousGeometryRun(1), anonymousGeometryRun(2)]
    const first = fakeBuilderDependencies({
      candidateResult: { ok: true, value: [{ runIds: [2, 1] }, { runIds: [0] }] },
      relationResult: {
        ok: true,
        value: [
          anonymousRelation(2, 1, 'DEFERRED'),
          anonymousRelation(0, 1, 'SUPPORTED'),
          anonymousMissingDecision(0, 2),
        ],
      },
    })
    const second = fakeBuilderDependencies({
      candidateResult: { ok: true, value: [{ runIds: [0] }, { runIds: [1, 2] }] },
      relationResult: {
        ok: true,
        value: [
          anonymousRelation(1, 0, 'SUPPORTED'),
          anonymousRelation(1, 2, 'DEFERRED'),
          anonymousMissingDecision(2, 0),
        ],
      },
    })

    const firstGraph = expectSuccess(buildRowEvidenceGraphContract([...canonicalRuns].reverse(), first.dependencies))
    const secondGraph = expectSuccess(buildRowEvidenceGraphContract(canonicalRuns, second.dependencies))
    expect(firstGraph).toEqual(secondGraph)
  })

  it('produces a deep-equal failure for conflicting relation permutations', () => {
    const runs = [anonymousGeometryRun(0), anonymousGeometryRun(1)]
    const first = fakeBuilderDependencies({
      relationResult: {
        ok: true,
        value: [anonymousRelation(0, 1, 'SUPPORTED'), anonymousRelation(1, 0, 'REJECTED')],
      },
    })
    const second = fakeBuilderDependencies({
      relationResult: {
        ok: true,
        value: [anonymousRelation(0, 1, 'REJECTED'), anonymousRelation(1, 0, 'SUPPORTED')],
      },
    })

    expect(buildRowEvidenceGraphContract(runs, first.dependencies)).toEqual(
      buildRowEvidenceGraphContract([...runs].reverse(), second.dependencies),
    )
  })

  it('does not derive membership from text, horizontal geometry, hasEOL, columns, or serialization concerns', () => {
    const firstRuns = [anonymousGeometryRun(0), anonymousGeometryRun(1)]
    const changedRuns = [
      anonymousGeometryRun(0, { str: 'unrelated words', transform: [1, 0, 0, 1, 900, 120], hasEOL: true }),
      anonymousGeometryRun(1, { str: '不同文字', transform: [1, 0, 0, 1, 20, 120], width: 200 }),
    ]
    const proposals: readonly TestCandidateProposal[] = [{ runIds: [1, 0] }]
    const first = fakeBuilderDependencies({ candidateResult: { ok: true, value: proposals } })
    const second = fakeBuilderDependencies({ candidateResult: { ok: true, value: proposals } })

    const firstGraph = expectSuccess(buildRowEvidenceGraphContract(firstRuns, first.dependencies))
    const changedGraph = expectSuccess(buildRowEvidenceGraphContract(changedRuns, second.dependencies))
    expect(changedGraph.candidates).toEqual(firstGraph.candidates)
    expect(changedGraph.relations).toEqual(firstGraph.relations)
    expect(changedGraph.runs.map((run) => run.text)).toEqual(['unrelated words', '不同文字'])
  })
})
