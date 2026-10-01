import { describe, expect, it } from 'vitest'
import { calibrationCaseById } from './fixtures/pdfRowCandidateCalibration'
import { contractCaseById, rowEvidenceContractCases } from './fixtures/pdfRowEvidenceGraphContract'
import {
  laterStagePreservesFinalPartition,
  normalizeVisualGroupMembership,
  validateProposedVisualGroups,
  validateRowEvidenceGraph,
  type ProposedVisualGroups,
  type TestRowEvidenceGraph,
} from './helpers/rowEvidenceGraphContractHarness'

describe('RP-022 RowEvidenceGraph architecture contract', () => {
  it('uses one canonical GeometryRun identity and ID-only candidate references', () => {
    for (const contractCase of rowEvidenceContractCases) {
      expect(validateRowEvidenceGraph(contractCase.graph), contractCase.id).toEqual({ valid: true, violations: [] })
      expect(contractCase.graph.candidates.every((candidate) => candidate.runIds.every((id) => typeof id === 'number'))).toBe(true)
    }
  })

  it('requires every final VisualGroup proposal to be an exact run partition', () => {
    const graph = contractCaseById('same-y-separate-columns').graph
    expect(validateProposedVisualGroups(graph, [[0], [1]]).valid).toBe(true)
    expect(validateProposedVisualGroups(graph, [[0]]).violations).toContain('MISSING_FINAL_RUN')
    expect(validateProposedVisualGroups(graph, [[0], [1], [1]]).violations).toContain('DUPLICATE_FINAL_RUN')
  })

  it('allows one provisional row candidate to split into same-Y column groups', () => {
    const contractCase = contractCaseById('same-y-separate-columns')
    expect(validateProposedVisualGroups(contractCase.graph, contractCase.allowed[0]).valid).toBe(true)
  })

  it('allows DEFERRED cross-candidate recovery for split CJK heading fragments', () => {
    const contractCase = contractCaseById('split-cjk-heading')
    expect(validateProposedVisualGroups(contractCase.graph, contractCase.allowed[0]).valid).toBe(true)
  })

  it('allows DEFERRED cross-candidate recovery for Latin fragments', () => {
    const contractCase = contractCaseById('split-latin-fragments')
    expect(validateProposedVisualGroups(contractCase.graph, [[0, 1]]).valid).toBe(true)
  })

  it('treats REJECTED as a hard constraint inside a provisional candidate', () => {
    const contractCase = contractCaseById('rejected-same-candidate')
    expect(validateProposedVisualGroups(contractCase.graph, contractCase.allowed[0]).valid).toBe(true)
    expect(validateProposedVisualGroups(contractCase.graph, contractCase.forbidden[0]).violations).toContain('REJECTED_RELATION_MERGED')
  })

  it('does not permit pairwise chaining to bypass an endpoint REJECTED relation', () => {
    const contractCase = contractCaseById('pairwise-chaining')
    for (const proposal of contractCase.allowed) expect(validateProposedVisualGroups(contractCase.graph, proposal).valid).toBe(true)
    expect(validateProposedVisualGroups(contractCase.graph, contractCase.forbidden[0]).violations).toContain('REJECTED_RELATION_MERGED')
  })

  it('treats DEFERRED as permission rather than a merge command', () => {
    const contractCase = contractCaseById('split-latin-fragments')
    expect(validateProposedVisualGroups(contractCase.graph, [[0, 1]]).valid).toBe(true)
    expect(validateProposedVisualGroups(contractCase.graph, [[0], [1]]).valid).toBe(true)
  })

  it('treats SUPPORTED as cross-candidate permission rather than final membership', () => {
    const contractCase = contractCaseById('supported-cross-candidate')
    expect(validateProposedVisualGroups(contractCase.graph, [[0, 1]]).valid).toBe(true)
    expect(validateProposedVisualGroups(contractCase.graph, [[0], [1]]).valid).toBe(true)
  })

  it('does not infer cross-candidate permission from a missing relation', () => {
    const contractCase = contractCaseById('missing-cross-candidate-relation')
    expect(validateProposedVisualGroups(contractCase.graph, [[0], [1]]).valid).toBe(true)
    expect(validateProposedVisualGroups(contractCase.graph, [[0, 1]]).violations).toContain('CROSS_CANDIDATE_MERGE_WITHOUT_PERMISSION')
  })

  it('keeps unsafe geometry isolated and present exactly once', () => {
    const contractCase = contractCaseById('unsafe-isolation')
    expect(validateProposedVisualGroups(contractCase.graph, [[0], [1]]).valid).toBe(true)
    expect(validateProposedVisualGroups(contractCase.graph, [[0, 1]]).violations).toContain('UNSAFE_RUN_MERGED')
  })

  it('normalizes final membership independently of run, candidate, relation, and group ordering', () => {
    const source = contractCaseById('pairwise-chaining')
    const permutedGraph: TestRowEvidenceGraph = {
      runs: [...source.graph.runs].reverse(),
      candidates: [...source.graph.candidates].reverse(),
      relations: [...source.graph.relations].reverse().map((relation) => ({
        ...relation,
        leftRunId: relation.rightRunId,
        rightRunId: relation.leftRunId,
      })),
    }
    const originalGroups: ProposedVisualGroups = [[0, 1], [2]]
    const permutedGroups: ProposedVisualGroups = [[2], [1, 0]]

    expect(validateProposedVisualGroups(permutedGraph, permutedGroups).valid).toBe(true)
    expect(normalizeVisualGroupMembership(permutedGroups)).toEqual(normalizeVisualGroupMembership(originalGroups))
  })

  it('keeps architecture-level admissibility invariant under uniform geometry scaling', () => {
    const base = calibrationCaseById('same-baseline-same-height-base')
    const scaled = calibrationCaseById('same-baseline-same-height-scaled')
    const graph = (runs: typeof base.runs): TestRowEvidenceGraph => ({
      runs,
      candidates: [
        { id: 'row-0', runIds: [0], geometryStatus: 'comparable' },
        { id: 'row-1', runIds: [1], geometryStatus: 'comparable' },
      ],
      relations: [{
        leftRunId: 0,
        rightRunId: 1,
        state: 'SUPPORTED',
        evidence: {
          baselineDifference: 0,
          heightRatio: 1,
          verticalOverlapRatio: 1,
          geometryComparable: true,
        },
      }],
    })

    expect(validateProposedVisualGroups(graph(base.runs), [[0, 1]]).valid).toBe(true)
    expect(validateProposedVisualGroups(graph(scaled.runs), [[0, 1]]).valid).toBe(true)
  })

  it('prevents Region and Serialization stages from changing final membership', () => {
    const finalVisualGroups: ProposedVisualGroups = [[0, 1], [2]]
    expect(laterStagePreservesFinalPartition(finalVisualGroups, [[2], [1, 0]])).toBe(true)
    expect(laterStagePreservesFinalPartition(finalVisualGroups, [[0, 1, 2]])).toBe(false)
    expect(laterStagePreservesFinalPartition(finalVisualGroups, [[0], [1], [2]])).toBe(false)
  })
})
