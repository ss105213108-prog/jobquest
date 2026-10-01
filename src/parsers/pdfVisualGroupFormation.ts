import {
  isAvailablePageLayoutEvidence,
  validateVisualGroupFormationResult,
  type AvailablePageLayoutEvidence,
  type VisualGroupFormationResult,
} from './pdfVisualGroupResult'

const failure = (
  evidence: AvailablePageLayoutEvidence,
  code: 'INVALID_INPUT_STRUCTURE' | 'INTERNAL_FORMATION_CONSISTENCY_FAILURE',
  issueCodes: readonly string[],
): VisualGroupFormationResult => ({
  status: 'FAILED',
  pageNumber: typeof evidence?.pageNumber === 'number' && Number.isFinite(evidence.pageNumber)
    ? evidence.pageNumber
    : 0,
  code,
  issues: [...new Set(issueCodes)].sort().map((issueCode) => ({ code: issueCode })),
})

const insufficient = (evidence: AvailablePageLayoutEvidence): VisualGroupFormationResult => ({
  status: 'INSUFFICIENT_EVIDENCE',
  pageNumber: evidence.pageNumber,
  diagnostic: {
    reasonCode: 'AMBIGUOUS_STRUCTURAL_EVIDENCE',
    counts: { runCount: evidence.graph.runs.length },
  },
})

const validationIssueCodes = (
  evidence: AvailablePageLayoutEvidence,
  result: VisualGroupFormationResult,
): readonly string[] => validateVisualGroupFormationResult({ evidence, result })
  .issues.map((issue) => issue.code)

const finalize = (
  evidence: AvailablePageLayoutEvidence,
  proposed: VisualGroupFormationResult,
): VisualGroupFormationResult => {
  const issueCodes = validationIssueCodes(evidence, proposed)
  return issueCodes.length === 0
    ? proposed
    : failure(evidence, 'INTERNAL_FORMATION_CONSISTENCY_FAILURE', issueCodes)
}

export function formVisualGroups(
  evidence: AvailablePageLayoutEvidence,
): VisualGroupFormationResult {
  let admitted = false
  try {
    admitted = isAvailablePageLayoutEvidence(evidence)
  } catch {
    return failure(evidence, 'INVALID_INPUT_STRUCTURE', ['INVALID_INPUT_STRUCTURE'])
  }

  if (!admitted) {
    let issueCodes: readonly string[]
    try {
      issueCodes = validationIssueCodes(evidence, insufficient(evidence))
    } catch {
      issueCodes = ['INVALID_INPUT_STRUCTURE']
    }
    return failure(
      evidence,
      'INVALID_INPUT_STRUCTURE',
      issueCodes,
    )
  }

  if (evidence.graph.runs.length > 1) return finalize(evidence, insufficient(evidence))

  const runId = evidence.graph.runs[0].originalIndex
  return finalize(evidence, {
    status: 'RESOLVED',
    pageNumber: evidence.pageNumber,
    groups: [{ groupId: `visual:singleton:${runId}`, runIds: [runId] }],
  })
}
