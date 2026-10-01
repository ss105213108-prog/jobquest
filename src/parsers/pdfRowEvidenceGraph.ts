import type { GeometryRun } from './pdfTextGeometry'

export type RunId = GeometryRun['originalIndex']
export type VerticalRelationState = 'SUPPORTED' | 'REJECTED' | 'DEFERRED'
export type RowEvidenceCandidateGeometryStatus = 'comparable' | 'isolated-unsafe'

export interface VerticalEvidence {
  baselineDifference: number | null
  heightRatio: number | null
  verticalOverlapRatio: number | null
  geometryComparable: boolean
}

export interface RowEvidenceCandidate {
  id: string
  runIds: readonly RunId[]
  geometryStatus: RowEvidenceCandidateGeometryStatus
}

export interface VerticalRelation {
  leftRunId: RunId
  rightRunId: RunId
  state: VerticalRelationState
  evidence: VerticalEvidence
}

export interface RowEvidenceGraph {
  runs: readonly GeometryRun[]
  candidates: readonly RowEvidenceCandidate[]
  relations: readonly VerticalRelation[]
}

export type RowEvidenceGraphIssueCode =
  | 'DUPLICATE_CANONICAL_RUN_ID'
  | 'DUPLICATE_CANDIDATE_ID'
  | 'DUPLICATE_CANDIDATE_RUN_REFERENCE'
  | 'UNKNOWN_CANDIDATE_RUN_ID'
  | 'RUN_WITHOUT_PRIMARY_CANDIDATE'
  | 'RUN_WITH_MULTIPLE_PRIMARY_CANDIDATES'
  | 'UNSAFE_CANDIDATE_NOT_SINGLETON'
  | 'UNSAFE_RUN_NOT_ISOLATED'
  | 'UNKNOWN_RELATION_ENDPOINT'
  | 'SELF_RELATION'
  | 'DUPLICATE_RELATION'
  | 'CONFLICTING_RELATION_STATES'
  | 'UNSAFE_MERGE_CAPABLE_RELATION'

export interface RowEvidenceGraphIssue {
  code: RowEvidenceGraphIssueCode
  runIds?: readonly RunId[]
  candidateIds?: readonly string[]
}

export interface RowEvidenceGraphValidationResult {
  valid: boolean
  issues: readonly RowEvidenceGraphIssue[]
}

const canonicalPair = (leftRunId: RunId, rightRunId: RunId): readonly [RunId, RunId] => (
  leftRunId <= rightRunId ? [leftRunId, rightRunId] : [rightRunId, leftRunId]
)

const pairKey = (leftRunId: RunId, rightRunId: RunId) => canonicalPair(leftRunId, rightRunId).join(':')

const issueSortKey = (issue: RowEvidenceGraphIssue) => [
  issue.code,
  ...(issue.runIds ?? []),
  ...(issue.candidateIds ?? []),
].join('|')

const normalizeIssue = (issue: RowEvidenceGraphIssue): RowEvidenceGraphIssue => ({
  code: issue.code,
  ...(issue.runIds ? { runIds: [...issue.runIds].sort((left, right) => left - right) } : {}),
  ...(issue.candidateIds ? { candidateIds: [...issue.candidateIds].sort() } : {}),
})

export function validateRowEvidenceGraph(graph: RowEvidenceGraph): RowEvidenceGraphValidationResult {
  const issues: RowEvidenceGraphIssue[] = []
  const addIssue = (issue: RowEvidenceGraphIssue) => issues.push(normalizeIssue(issue))

  const runsById = new Map<RunId, GeometryRun>()
  const duplicateRunIds = new Set<RunId>()
  for (const run of graph.runs) {
    if (runsById.has(run.originalIndex)) duplicateRunIds.add(run.originalIndex)
    else runsById.set(run.originalIndex, run)
  }
  for (const runId of duplicateRunIds) addIssue({ code: 'DUPLICATE_CANONICAL_RUN_ID', runIds: [runId] })

  const candidateIds = new Set<string>()
  const duplicateCandidateIds = new Set<string>()
  const candidateOwnersByRunId = new Map<RunId, RowEvidenceCandidate[]>()
  for (const candidate of graph.candidates) {
    if (candidateIds.has(candidate.id)) duplicateCandidateIds.add(candidate.id)
    candidateIds.add(candidate.id)

    const uniqueCandidateRunIds = new Set<RunId>()
    const duplicateCandidateRunIds = new Set<RunId>()
    for (const runId of candidate.runIds) {
      if (uniqueCandidateRunIds.has(runId)) duplicateCandidateRunIds.add(runId)
      uniqueCandidateRunIds.add(runId)
    }
    for (const runId of duplicateCandidateRunIds) {
      addIssue({ code: 'DUPLICATE_CANDIDATE_RUN_REFERENCE', runIds: [runId], candidateIds: [candidate.id] })
    }

    for (const runId of uniqueCandidateRunIds) {
      if (!runsById.has(runId)) {
        addIssue({ code: 'UNKNOWN_CANDIDATE_RUN_ID', runIds: [runId], candidateIds: [candidate.id] })
        continue
      }
      const owners = candidateOwnersByRunId.get(runId) ?? []
      owners.push(candidate)
      candidateOwnersByRunId.set(runId, owners)
    }

    if (candidate.geometryStatus === 'isolated-unsafe' && candidate.runIds.length !== 1) {
      addIssue({
        code: 'UNSAFE_CANDIDATE_NOT_SINGLETON',
        runIds: candidate.runIds,
        candidateIds: [candidate.id],
      })
    }
  }
  for (const candidateId of duplicateCandidateIds) {
    addIssue({ code: 'DUPLICATE_CANDIDATE_ID', candidateIds: [candidateId] })
  }

  for (const [runId, run] of runsById) {
    const owners = candidateOwnersByRunId.get(runId) ?? []
    if (owners.length === 0) addIssue({ code: 'RUN_WITHOUT_PRIMARY_CANDIDATE', runIds: [runId] })
    if (owners.length > 1) {
      addIssue({
        code: 'RUN_WITH_MULTIPLE_PRIMARY_CANDIDATES',
        runIds: [runId],
        candidateIds: owners.map((candidate) => candidate.id),
      })
    }
    if (!run.geometryComparable) {
      const safelyIsolated = owners.length === 1
        && owners[0].geometryStatus === 'isolated-unsafe'
        && owners[0].runIds.length === 1
      if (!safelyIsolated) {
        addIssue({
          code: 'UNSAFE_RUN_NOT_ISOLATED',
          runIds: [runId],
          candidateIds: owners.map((candidate) => candidate.id),
        })
      }
    }
  }

  const relationStatesByPair = new Map<string, Set<VerticalRelationState>>()
  for (const relation of graph.relations) {
    const endpointsExist = runsById.has(relation.leftRunId) && runsById.has(relation.rightRunId)
    if (!endpointsExist) {
      addIssue({
        code: 'UNKNOWN_RELATION_ENDPOINT',
        runIds: [relation.leftRunId, relation.rightRunId],
      })
    }
    if (relation.leftRunId === relation.rightRunId) {
      addIssue({ code: 'SELF_RELATION', runIds: [relation.leftRunId] })
    }

    const key = pairKey(relation.leftRunId, relation.rightRunId)
    const existingStates = relationStatesByPair.get(key) ?? new Set<VerticalRelationState>()
    if (existingStates.has(relation.state)) {
      addIssue({ code: 'DUPLICATE_RELATION', runIds: canonicalPair(relation.leftRunId, relation.rightRunId) })
    } else if (existingStates.size > 0) {
      addIssue({
        code: 'CONFLICTING_RELATION_STATES',
        runIds: canonicalPair(relation.leftRunId, relation.rightRunId),
      })
    }
    existingStates.add(relation.state)
    relationStatesByPair.set(key, existingStates)

    if (relation.state !== 'REJECTED' && endpointsExist) {
      const leftRun = runsById.get(relation.leftRunId)
      const rightRun = runsById.get(relation.rightRunId)
      const leftOwners = candidateOwnersByRunId.get(relation.leftRunId) ?? []
      const rightOwners = candidateOwnersByRunId.get(relation.rightRunId) ?? []
      const unsafeEndpoint = leftRun?.geometryComparable === false
        || rightRun?.geometryComparable === false
        || leftOwners.some((candidate) => candidate.geometryStatus === 'isolated-unsafe')
        || rightOwners.some((candidate) => candidate.geometryStatus === 'isolated-unsafe')
      if (unsafeEndpoint) {
        addIssue({
          code: 'UNSAFE_MERGE_CAPABLE_RELATION',
          runIds: canonicalPair(relation.leftRunId, relation.rightRunId),
        })
      }
    }
  }

  const uniqueIssues = new Map<string, RowEvidenceGraphIssue>()
  for (const issue of issues) uniqueIssues.set(issueSortKey(issue), issue)
  const normalizedIssues = [...uniqueIssues.values()].sort((left, right) => (
    issueSortKey(left).localeCompare(issueSortKey(right))
  ))

  return { valid: normalizedIssues.length === 0, issues: normalizedIssues }
}
