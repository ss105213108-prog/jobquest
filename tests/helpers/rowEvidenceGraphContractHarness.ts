import {
  validateRowEvidenceGraph as validateProductionRowEvidenceGraph,
  type RowEvidenceCandidate,
  type RowEvidenceGraph,
  type RunId as ProductionRunId,
  type VerticalRelation,
  type VerticalRelationState,
} from '../../src/parsers/pdfRowEvidenceGraph'

export type RunId = ProductionRunId
export type RowRelationState = VerticalRelationState
export type TestRowCandidate = RowEvidenceCandidate
export type TestRowRelation = VerticalRelation
export type TestRowEvidenceGraph = RowEvidenceGraph

export type ProposedVisualGroups = readonly (readonly RunId[])[]

export interface ContractValidation {
  valid: boolean
  violations: string[]
}

const pairKey = (left: RunId, right: RunId) => [left, right].sort((a, b) => a - b).join(':')

const graphIndexes = (graph: TestRowEvidenceGraph) => {
  const runs = new Map(graph.runs.map((run) => [run.originalIndex, run]))
  const candidateByRun = new Map<RunId, TestRowCandidate>()
  for (const candidate of graph.candidates) {
    for (const runId of candidate.runIds) {
      if (!candidateByRun.has(runId)) candidateByRun.set(runId, candidate)
    }
  }
  const relations = new Map(graph.relations.map((relation) => [
    pairKey(relation.leftRunId, relation.rightRunId),
    relation,
  ]))
  return { runs, candidateByRun, relations }
}

export function validateRowEvidenceGraph(graph: TestRowEvidenceGraph): ContractValidation {
  const result = validateProductionRowEvidenceGraph(graph)
  return { valid: result.valid, violations: result.issues.map((issue) => issue.code) }
}

export function validateProposedVisualGroups(
  graph: TestRowEvidenceGraph,
  groups: ProposedVisualGroups,
): ContractValidation {
  const violations = [...validateRowEvidenceGraph(graph).violations]
  const { runs, candidateByRun, relations } = graphIndexes(graph)
  const occurrences = new Map<RunId, number>()

  for (const group of groups) {
    const uniqueGroupIds = new Set(group)
    if (uniqueGroupIds.size !== group.length) violations.push('DUPLICATE_RUN_WITHIN_VISUAL_GROUP')
    for (const runId of group) {
      if (!runs.has(runId)) violations.push('UNKNOWN_VISUAL_GROUP_RUN')
      occurrences.set(runId, (occurrences.get(runId) ?? 0) + 1)
    }

    for (let leftIndex = 0; leftIndex < group.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < group.length; rightIndex += 1) {
        const leftRunId = group[leftIndex]
        const rightRunId = group[rightIndex]
        const relation = relations.get(pairKey(leftRunId, rightRunId))
        const leftCandidate = candidateByRun.get(leftRunId)
        const rightCandidate = candidateByRun.get(rightRunId)

        if (relation?.state === 'REJECTED') violations.push('REJECTED_RELATION_MERGED')
        if (leftCandidate?.geometryStatus === 'isolated-unsafe' || rightCandidate?.geometryStatus === 'isolated-unsafe') {
          violations.push('UNSAFE_RUN_MERGED')
        }
        if (leftCandidate?.id !== rightCandidate?.id && relation?.state !== 'SUPPORTED' && relation?.state !== 'DEFERRED') {
          violations.push('CROSS_CANDIDATE_MERGE_WITHOUT_PERMISSION')
        }
      }
    }
  }

  for (const runId of runs.keys()) {
    const count = occurrences.get(runId) ?? 0
    if (count === 0) violations.push('MISSING_FINAL_RUN')
    if (count > 1) violations.push('DUPLICATE_FINAL_RUN')
  }

  return { valid: violations.length === 0, violations }
}

export function normalizeVisualGroupMembership(groups: ProposedVisualGroups): string[] {
  return groups
    .map((group) => [...group].sort((a, b) => a - b).join(':'))
    .sort((left, right) => left.localeCompare(right))
}

export function laterStagePreservesFinalPartition(
  visualGroups: ProposedVisualGroups,
  laterStageGroups: ProposedVisualGroups,
): boolean {
  return JSON.stringify(normalizeVisualGroupMembership(visualGroups))
    === JSON.stringify(normalizeVisualGroupMembership(laterStageGroups))
}
