import { describe, expect, it } from 'vitest'
import { validateRowEvidenceGraph, type RowEvidenceGraph } from '../src/parsers/pdfRowEvidenceGraph'
import {
  anonymousVerticalEvidence,
  decisionRun,
  missingDecision,
  relationDecision,
} from './fixtures/pdfVerticalPairDecisionContract'
import {
  expectedPairUniverse,
  projectRelationDecisions,
  validateDecisionBatchContract,
  type VerticalPairDecision,
} from './helpers/verticalPairDecisionContractHarness'

const completeMissingBatch = (runIds: readonly number[]): readonly VerticalPairDecision[] => {
  const decisions: VerticalPairDecision[] = []
  for (let leftIndex = 0; leftIndex < runIds.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < runIds.length; rightIndex += 1) {
      decisions.push(missingDecision(runIds[leftIndex], runIds[rightIndex]))
    }
  }
  return decisions
}

describe('RP-035 complete VerticalPairDecision batch contract', () => {
  it('accepts an empty batch for an empty safe-run set', () => {
    expect(validateDecisionBatchContract([], [])).toEqual({ valid: true, issues: [], decisions: [] })
  })

  it('accepts an empty batch for one safe run', () => {
    expect(validateDecisionBatchContract([decisionRun(0)], [])).toEqual({ valid: true, issues: [], decisions: [] })
  })

  it('requires exactly one canonical pair for two safe runs', () => {
    const runs = [decisionRun(7), decisionRun(2)]
    expect(expectedPairUniverse(runs)).toEqual([[2, 7]])
    expect(validateDecisionBatchContract(runs, [missingDecision(2, 7)]).valid).toBe(true)
  })

  it('requires six pairs for four safe runs', () => {
    const runs = [decisionRun(0), decisionRun(1), decisionRun(2), decisionRun(3)]
    expect(expectedPairUniverse(runs)).toEqual([[0, 1], [0, 2], [0, 3], [1, 2], [1, 3], [2, 3]])
    expect(validateDecisionBatchContract(runs, completeMissingBatch([0, 1, 2, 3])).valid).toBe(true)
  })

  it('accepts every eligible pair exactly once across mixed outcomes', () => {
    const runs = [decisionRun(0), decisionRun(1), decisionRun(2)]
    const result = validateDecisionBatchContract(runs, [
      relationDecision(0, 1),
      missingDecision(0, 2),
      relationDecision(1, 2, 'DEFERRED'),
    ])
    expect(result).toMatchObject({ valid: true, issues: [] })
    expect(result.decisions).toHaveLength(3)
  })

  it('detects a missing eligible pair', () => {
    const runs = [decisionRun(0), decisionRun(1), decisionRun(2)]
    const result = validateDecisionBatchContract(runs, [missingDecision(0, 1), missingDecision(1, 2)])
    expect(result.issues).toContain('MISSING_PAIR_DECISION')
  })

  it('detects a reversed duplicate pair after canonicalization', () => {
    const runs = [decisionRun(0), decisionRun(1)]
    const result = validateDecisionBatchContract(runs, [missingDecision(0, 1), missingDecision(1, 0)])
    expect(result.issues).toContain('DUPLICATE_PAIR_DECISION')
  })

  it('detects RELATION and MISSING decisions for the same pair as duplicates', () => {
    const runs = [decisionRun(0), decisionRun(1)]
    const result = validateDecisionBatchContract(runs, [relationDecision(0, 1), missingDecision(0, 1)])
    expect(result.issues).toContain('DUPLICATE_PAIR_DECISION')
  })

  it('rejects a self pair', () => {
    const result = validateDecisionBatchContract([decisionRun(0)], [missingDecision(0, 0)])
    expect(result.issues).toContain('SELF_PAIR_DECISION')
  })

  it('rejects an unknown endpoint', () => {
    const result = validateDecisionBatchContract([decisionRun(0), decisionRun(1)], [missingDecision(0, 99)])
    expect(result.issues).toContain('UNKNOWN_RELATION_ENDPOINT')
  })

  it('rejects an unsafe endpoint', () => {
    const runs = [decisionRun(0), decisionRun(1, 100, false)]
    const result = validateDecisionBatchContract(runs, [missingDecision(0, 1)])
    expect(result.issues).toContain('UNSAFE_RELATION_REFERENCE')
  })

  it('rejects an unsupported outcome', () => {
    const malformed = { outcome: 'SKIPPED', leftRunId: 0, rightRunId: 1 }
    const result = validateDecisionBatchContract([decisionRun(0), decisionRun(1)], [malformed])
    expect(result.issues).toContain('UNSUPPORTED_PAIR_DECISION_OUTCOME')
  })

  it('rejects a RELATION decision without a state', () => {
    const malformed = { outcome: 'RELATION', leftRunId: 0, rightRunId: 1, evidence: anonymousVerticalEvidence() }
    const result = validateDecisionBatchContract([decisionRun(0), decisionRun(1)], [malformed])
    expect(result.issues).toContain('INVALID_RELATION_DECISION')
  })

  it('rejects a RELATION decision without evidence', () => {
    const malformed = { outcome: 'RELATION', leftRunId: 0, rightRunId: 1, state: 'SUPPORTED' }
    const result = validateDecisionBatchContract([decisionRun(0), decisionRun(1)], [malformed])
    expect(result.issues).toContain('INVALID_RELATION_DECISION')
  })

  it('rejects a MISSING decision without a reason', () => {
    const malformed = { outcome: 'MISSING', leftRunId: 0, rightRunId: 1 }
    const result = validateDecisionBatchContract([decisionRun(0), decisionRun(1)], [malformed])
    expect(result.issues).toContain('INVALID_MISSING_DECISION')
  })

  it('rejects an unsupported missing reason', () => {
    const malformed = { outcome: 'MISSING', leftRunId: 0, rightRunId: 1, reason: 'TOO_FAR' }
    const result = validateDecisionBatchContract([decisionRun(0), decisionRun(1)], [malformed])
    expect(result.issues).toContain('UNSUPPORTED_MISSING_REASON')
  })

  it('accepts only the two approved MissingRelationReason values', () => {
    const runs = [decisionRun(0), decisionRun(1)]
    expect(validateDecisionBatchContract(runs, [missingDecision(0, 1, 'UNUSABLE_VERTICAL_EVIDENCE')]).valid).toBe(true)
    expect(validateDecisionBatchContract(runs, [missingDecision(0, 1, 'NO_VERTICAL_OVERLAP')]).valid).toBe(true)
  })

  it('normalizes a single reversed endpoint direction to canonical order', () => {
    const result = validateDecisionBatchContract(
      [decisionRun(0), decisionRun(1)],
      [missingDecision(1, 0)],
    )
    expect(result).toMatchObject({ valid: true, decisions: [{ leftRunId: 0, rightRunId: 1 }] })
  })

  it('projects RELATION with canonical endpoints, state, and evidence intact', () => {
    const evidence = anonymousVerticalEvidence()
    expect(projectRelationDecisions([relationDecision(4, 1, 'DEFERRED', evidence)])).toEqual([{
      leftRunId: 1,
      rightRunId: 4,
      state: 'DEFERRED',
      evidence,
    }])
  })

  it('projects MISSING to no RowEvidenceGraph relation edge while retaining its evaluated decision', () => {
    const runs = [decisionRun(0), decisionRun(1)]
    const validation = validateDecisionBatchContract(runs, [missingDecision(0, 1)])
    expect(validation.valid).toBe(true)
    expect(validation.decisions).toHaveLength(1)
    expect(projectRelationDecisions(validation.decisions)).toEqual([])
  })

  it('does not project explicit MISSING as REJECTED', () => {
    expect(projectRelationDecisions([missingDecision(0, 1)]).some((relation) => relation.state === 'REJECTED')).toBe(false)
  })

  it('does not project explicit MISSING as DEFERRED', () => {
    expect(projectRelationDecisions([missingDecision(0, 1)]).some((relation) => relation.state === 'DEFERRED')).toBe(false)
  })

  it('includes same-candidate and cross-candidate pairs in one universe', () => {
    const runs = [decisionRun(0), decisionRun(1), decisionRun(2)]
    const candidates = [{ runIds: [0, 1] }, { runIds: [2] }]
    expect(candidates).toHaveLength(2)
    expect(expectedPairUniverse(runs)).toEqual([[0, 1], [0, 2], [1, 2]])
  })

  it('normalizes decision ordering deterministically', () => {
    const runs = [decisionRun(0), decisionRun(1), decisionRun(2)]
    const forward = [missingDecision(0, 1), relationDecision(0, 2), missingDecision(1, 2)]
    const reversed = [...forward].reverse()
    expect(validateDecisionBatchContract(runs, reversed)).toEqual(validateDecisionBatchContract(runs, forward))
  })

  it('normalizes endpoint direction deterministically for a legal single decision', () => {
    const runs = [decisionRun(0), decisionRun(1)]
    expect(validateDecisionBatchContract(runs, [relationDecision(1, 0)])).toEqual(
      validateDecisionBatchContract(runs, [relationDecision(0, 1)]),
    )
  })

  it('keeps the expected pair universe invariant under safe-run input permutation', () => {
    const runs = [decisionRun(8), decisionRun(2), decisionRun(5), decisionRun(1)]
    expect(expectedPairUniverse(runs)).toEqual(expectedPairUniverse([...runs].reverse()))
  })

  it('keeps zero-run and one-run success distinct from classifier failure', () => {
    expect(validateDecisionBatchContract([], []).issues).toEqual([])
    expect(validateDecisionBatchContract([decisionRun(0)], []).issues).toEqual([])
  })

  it.each(['SUPPORTED', 'REJECTED', 'DEFERRED'] as const)(
    'preserves the existing %s VerticalRelation state',
    (state) => {
      const result = validateDecisionBatchContract(
        [decisionRun(0), decisionRun(1)],
        [relationDecision(0, 1, state)],
      )
      expect(result.valid).toBe(true)
      expect(projectRelationDecisions(result.decisions)[0].state).toBe(state)
    },
  )

  it('keeps MISSING outside the production VerticalRelationState projection', () => {
    const projected = projectRelationDecisions([missingDecision(0, 1)])
    expect(projected).toEqual([])
  })

  it('projects a complete decision batch into the unchanged RowEvidenceGraph model', () => {
    const runs = [decisionRun(0), decisionRun(1), decisionRun(2)]
    const validation = validateDecisionBatchContract(runs, [
      relationDecision(0, 1, 'SUPPORTED'),
      missingDecision(0, 2, 'NO_VERTICAL_OVERLAP'),
      missingDecision(1, 2, 'UNUSABLE_VERTICAL_EVIDENCE'),
    ])
    const graph: RowEvidenceGraph = {
      runs,
      candidates: [
        { id: 'candidate:0.1', runIds: [0, 1], geometryStatus: 'comparable' },
        { id: 'candidate:2', runIds: [2], geometryStatus: 'comparable' },
      ],
      relations: projectRelationDecisions(validation.decisions),
    }

    expect(validation.valid).toBe(true)
    expect(validateRowEvidenceGraph(graph)).toEqual({ valid: true, issues: [] })
    expect(graph.relations).toHaveLength(1)
  })
})

