import type { GeometryRun } from './pdfTextGeometry'
import {
  validateRowEvidenceGraph,
  type RowEvidenceCandidate,
  type RowEvidenceGraph,
  type RowEvidenceGraphIssue,
  type RunId,
  type VerticalEvidence,
  type VerticalRelation,
  type VerticalRelationState,
} from './pdfRowEvidenceGraph'

export type PolicyResult<T> =
  | { ok: true; value: T }
  | { ok: false; code: string }

export interface RowCandidateProposal {
  readonly runIds: readonly RunId[]
}

export type VerticalCalibrationPolicy<TCalibration> = (
  runs: readonly GeometryRun[],
) => PolicyResult<TCalibration>

export type RowCandidateProposalPolicy<TCalibration> = (
  runs: readonly GeometryRun[],
  calibration: TCalibration,
) => PolicyResult<readonly RowCandidateProposal[]>

export type MissingRelationReason = 'UNUSABLE_VERTICAL_EVIDENCE' | 'NO_VERTICAL_OVERLAP'

export type VerticalPairDecision =
  | {
      readonly outcome: 'RELATION'
      readonly leftRunId: RunId
      readonly rightRunId: RunId
      readonly state: VerticalRelationState
      readonly evidence: VerticalEvidence
    }
  | {
      readonly outcome: 'MISSING'
      readonly leftRunId: RunId
      readonly rightRunId: RunId
      readonly reason: MissingRelationReason
    }

export type VerticalPairDecisionIssueCode =
  | 'MISSING_PAIR_DECISION'
  | 'DUPLICATE_PAIR_DECISION'
  | 'SELF_PAIR_DECISION'
  | 'UNKNOWN_RELATION_ENDPOINT'
  | 'UNSAFE_RELATION_REFERENCE'
  | 'UNSUPPORTED_PAIR_DECISION_OUTCOME'
  | 'INVALID_RELATION_DECISION'
  | 'INVALID_MISSING_DECISION'
  | 'UNSUPPORTED_MISSING_REASON'

export interface VerticalPairDecisionBatchValidation {
  readonly valid: boolean
  readonly issues: readonly VerticalPairDecisionIssueCode[]
  readonly decisions: readonly VerticalPairDecision[]
}

export type VerticalRelationClassifier<TCalibration> = (input: {
  runs: readonly GeometryRun[]
  candidates: readonly RowEvidenceCandidate[]
  calibration: TCalibration
}) => PolicyResult<readonly VerticalPairDecision[]>

export interface RowEvidenceGraphBuilderDependencies<TCalibration> {
  calibrationPolicy: VerticalCalibrationPolicy<TCalibration>
  candidateProposer: RowCandidateProposalPolicy<TCalibration>
  relationClassifier: VerticalRelationClassifier<TCalibration>
}

export type RowEvidenceGraphBuildStage =
  | 'input'
  | 'calibration'
  | 'candidate-proposal'
  | 'relation-classification'
  | 'validation'

export interface RowEvidenceGraphBuildIssue {
  code: string
  runIds?: readonly RunId[]
  candidateIds?: readonly string[]
}

export type BuildRowEvidenceGraphResult =
  | { ok: true; graph: RowEvidenceGraph }
  | {
      ok: false
      stage: RowEvidenceGraphBuildStage
      issues: readonly RowEvidenceGraphBuildIssue[]
    }

const relationStates: readonly VerticalRelationState[] = ['SUPPORTED', 'REJECTED', 'DEFERRED']
const missingRelationReasons: readonly MissingRelationReason[] = [
  'UNUSABLE_VERTICAL_EVIDENCE',
  'NO_VERTICAL_OVERLAP',
]
const relationStateOrder: Record<VerticalRelationState, number> = { SUPPORTED: 0, REJECTED: 1, DEFERRED: 2 }

const sortedRunIds = (runIds: readonly RunId[]) => [...runIds].sort((left, right) => left - right)
const candidateId = (runIds: readonly RunId[]) => `candidate:${sortedRunIds(runIds).join('.')}`
const unsafeCandidateId = (runId: RunId) => `unsafe:${runId}`

const issueKey = (issue: RowEvidenceGraphBuildIssue) => [
  issue.code,
  ...(issue.runIds ?? []),
  ...(issue.candidateIds ?? []),
].join('|')

const normalizedIssue = (issue: RowEvidenceGraphBuildIssue): RowEvidenceGraphBuildIssue => ({
  code: issue.code,
  ...(issue.runIds ? { runIds: sortedRunIds(issue.runIds) } : {}),
  ...(issue.candidateIds ? { candidateIds: [...issue.candidateIds].sort() } : {}),
})

const failure = (
  stage: RowEvidenceGraphBuildStage,
  issues: readonly RowEvidenceGraphBuildIssue[],
): BuildRowEvidenceGraphResult => {
  const uniqueIssues = new Map<string, RowEvidenceGraphBuildIssue>()
  for (const issue of issues.map(normalizedIssue)) uniqueIssues.set(issueKey(issue), issue)
  return {
    ok: false,
    stage,
    issues: [...uniqueIssues.values()].sort((left, right) => issueKey(left).localeCompare(issueKey(right))),
  }
}

const policyFailure = (
  stage: Extract<RowEvidenceGraphBuildStage, 'calibration' | 'candidate-proposal' | 'relation-classification'>,
  code: string,
) => failure(stage, [{ code }])

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null

const isVerticalEvidence = (value: unknown): value is VerticalEvidence => {
  if (!isRecord(value)) return false
  const nullableNumber = (candidate: unknown) => candidate === null || typeof candidate === 'number'
  return nullableNumber(value.baselineDifference)
    && nullableNumber(value.heightRatio)
    && nullableNumber(value.verticalOverlapRatio)
    && typeof value.geometryComparable === 'boolean'
}

const isRelationState = (value: unknown): value is VerticalRelationState => (
  typeof value === 'string' && relationStates.includes(value as VerticalRelationState)
)

const canonicalPair = (leftRunId: RunId, rightRunId: RunId): readonly [RunId, RunId] => (
  leftRunId <= rightRunId ? [leftRunId, rightRunId] : [rightRunId, leftRunId]
)

const pairKey = (leftRunId: RunId, rightRunId: RunId) => canonicalPair(leftRunId, rightRunId).join(':')

export function expectedVerticalPairUniverse(
  runs: readonly GeometryRun[],
): readonly (readonly [RunId, RunId])[] {
  const safeRunIds = runs
    .filter((run) => run.geometryComparable)
    .map((run) => run.originalIndex)
    .sort((left, right) => left - right)
  const pairs: Array<readonly [RunId, RunId]> = []
  for (let leftIndex = 0; leftIndex < safeRunIds.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < safeRunIds.length; rightIndex += 1) {
      pairs.push([safeRunIds[leftIndex], safeRunIds[rightIndex]])
    }
  }
  return pairs
}

export function validateVerticalPairDecisionBatch(
  runs: readonly GeometryRun[],
  inputDecisions: readonly unknown[],
): VerticalPairDecisionBatchValidation {
  const issues = new Set<VerticalPairDecisionIssueCode>()
  const allRunIds = new Set(runs.map((run) => run.originalIndex))
  const safeRunIds = new Set(runs.filter((run) => run.geometryComparable).map((run) => run.originalIndex))
  const unsafeRunIds = new Set(runs.filter((run) => !run.geometryComparable).map((run) => run.originalIndex))
  const observedPairs = new Map<string, number>()
  const decisions: VerticalPairDecision[] = []

  for (const value of inputDecisions) {
    if (!isRecord(value) || (value.outcome !== 'RELATION' && value.outcome !== 'MISSING')) {
      issues.add('UNSUPPORTED_PAIR_DECISION_OUTCOME')
      continue
    }
    if (typeof value.leftRunId !== 'number' || typeof value.rightRunId !== 'number') {
      issues.add(value.outcome === 'RELATION' ? 'INVALID_RELATION_DECISION' : 'INVALID_MISSING_DECISION')
      continue
    }

    const leftRunId = value.leftRunId
    const rightRunId = value.rightRunId
    if (leftRunId === rightRunId) issues.add('SELF_PAIR_DECISION')
    if (!allRunIds.has(leftRunId) || !allRunIds.has(rightRunId)) issues.add('UNKNOWN_RELATION_ENDPOINT')
    if (unsafeRunIds.has(leftRunId) || unsafeRunIds.has(rightRunId)) issues.add('UNSAFE_RELATION_REFERENCE')

    if (leftRunId !== rightRunId && safeRunIds.has(leftRunId) && safeRunIds.has(rightRunId)) {
      const key = pairKey(leftRunId, rightRunId)
      observedPairs.set(key, (observedPairs.get(key) ?? 0) + 1)
    }

    const [canonicalLeft, canonicalRight] = canonicalPair(leftRunId, rightRunId)
    if (value.outcome === 'RELATION') {
      if (!isRelationState(value.state) || !isVerticalEvidence(value.evidence)) {
        issues.add('INVALID_RELATION_DECISION')
        continue
      }
      decisions.push({
        outcome: 'RELATION',
        leftRunId: canonicalLeft,
        rightRunId: canonicalRight,
        state: value.state,
        evidence: value.evidence,
      })
      continue
    }

    if (typeof value.reason !== 'string') {
      issues.add('INVALID_MISSING_DECISION')
      continue
    }
    if (!missingRelationReasons.includes(value.reason as MissingRelationReason)) {
      issues.add('UNSUPPORTED_MISSING_REASON')
      continue
    }
    decisions.push({
      outcome: 'MISSING',
      leftRunId: canonicalLeft,
      rightRunId: canonicalRight,
      reason: value.reason as MissingRelationReason,
    })
  }

  for (const count of observedPairs.values()) {
    if (count > 1) issues.add('DUPLICATE_PAIR_DECISION')
  }
  for (const [leftRunId, rightRunId] of expectedVerticalPairUniverse(runs)) {
    if (!observedPairs.has(pairKey(leftRunId, rightRunId))) issues.add('MISSING_PAIR_DECISION')
  }

  const normalizedDecisions = decisions.sort((left, right) => (
    left.leftRunId - right.leftRunId
    || left.rightRunId - right.rightRunId
    || left.outcome.localeCompare(right.outcome)
  ))
  return { valid: issues.size === 0, issues: [...issues].sort(), decisions: normalizedDecisions }
}

export function projectVerticalRelationDecisions(
  decisions: readonly VerticalPairDecision[],
): readonly VerticalRelation[] {
  return decisions
    .filter((decision): decision is Extract<VerticalPairDecision, { outcome: 'RELATION' }> => (
      decision.outcome === 'RELATION'
    ))
    .map((decision) => {
      const [leftRunId, rightRunId] = canonicalPair(decision.leftRunId, decision.rightRunId)
      return { leftRunId, rightRunId, state: decision.state, evidence: decision.evidence }
    })
    .sort((left, right) => left.leftRunId - right.leftRunId
      || left.rightRunId - right.rightRunId
      || relationStateOrder[left.state] - relationStateOrder[right.state])
}

const formalIssue = (issue: RowEvidenceGraphIssue): RowEvidenceGraphBuildIssue => ({
  code: issue.code,
  ...(issue.runIds ? { runIds: issue.runIds } : {}),
  ...(issue.candidateIds ? { candidateIds: issue.candidateIds } : {}),
})

export function buildRowEvidenceGraph<TCalibration>(
  inputRuns: readonly GeometryRun[],
  dependencies: RowEvidenceGraphBuilderDependencies<TCalibration>,
): BuildRowEvidenceGraphResult {
  const inputRunIds = inputRuns.map((run) => run.originalIndex)
  const seenRunIds = new Set<RunId>()
  const duplicateRunIds = new Set<RunId>()
  for (const runId of inputRunIds) {
    if (seenRunIds.has(runId)) duplicateRunIds.add(runId)
    seenRunIds.add(runId)
  }
  if (duplicateRunIds.size > 0) {
    return failure('input', [...duplicateRunIds].map((runId) => ({
      code: 'INVALID_CANONICAL_IDENTITY',
      runIds: [runId],
    })))
  }

  const runs = [...inputRuns].sort((left, right) => left.originalIndex - right.originalIndex)
  const safeRuns = runs.filter((run) => run.geometryComparable)
  const unsafeRuns = runs.filter((run) => !run.geometryComparable)
  const safeRunIds = new Set(safeRuns.map((run) => run.originalIndex))

  const calibrationResult = dependencies.calibrationPolicy(safeRuns)
  if (!calibrationResult.ok) return policyFailure('calibration', calibrationResult.code)

  const proposalResult = dependencies.candidateProposer(safeRuns, calibrationResult.value)
  if (!proposalResult.ok) return policyFailure('candidate-proposal', proposalResult.code)
  if (!Array.isArray(proposalResult.value)) {
    return failure('candidate-proposal', [{ code: 'INVALID_CANDIDATE_PROPOSAL' }])
  }

  const proposalIssues: RowEvidenceGraphBuildIssue[] = []
  const proposalOccurrences = new Map<RunId, number>()
  for (const proposal of proposalResult.value as readonly unknown[]) {
    if (!isRecord(proposal) || !Array.isArray(proposal.runIds) || proposal.runIds.length === 0) {
      proposalIssues.push({ code: 'INVALID_CANDIDATE_PROPOSAL' })
      continue
    }
    for (const runId of proposal.runIds) {
      if (typeof runId !== 'number') {
        proposalIssues.push({ code: 'INVALID_CANDIDATE_PROPOSAL' })
        continue
      }
      if (!safeRunIds.has(runId)) proposalIssues.push({ code: 'UNKNOWN_PROPOSAL_RUN_ID', runIds: [runId] })
      proposalOccurrences.set(runId, (proposalOccurrences.get(runId) ?? 0) + 1)
    }
  }
  for (const runId of safeRunIds) {
    const occurrenceCount = proposalOccurrences.get(runId) ?? 0
    if (occurrenceCount === 0) proposalIssues.push({ code: 'MISSING_PROPOSAL_MEMBERSHIP', runIds: [runId] })
    if (occurrenceCount > 1) proposalIssues.push({ code: 'DUPLICATE_PROPOSAL_MEMBERSHIP', runIds: [runId] })
  }
  if (proposalIssues.length > 0) return failure('candidate-proposal', proposalIssues)

  const comparableCandidates: RowEvidenceCandidate[] = proposalResult.value
    .map((proposal) => {
      const runIds = sortedRunIds(proposal.runIds)
      return { id: candidateId(runIds), runIds, geometryStatus: 'comparable' as const }
    })
    .sort((left, right) => left.id.localeCompare(right.id))
  const unsafeCandidates: RowEvidenceCandidate[] = unsafeRuns.map((run) => ({
    id: unsafeCandidateId(run.originalIndex),
    runIds: [run.originalIndex],
    geometryStatus: 'isolated-unsafe',
  }))

  const relationResult = dependencies.relationClassifier({
    runs: safeRuns,
    candidates: comparableCandidates,
    calibration: calibrationResult.value,
  })
  if (!relationResult.ok) return policyFailure('relation-classification', relationResult.code)
  if (!Array.isArray(relationResult.value)) {
    return failure('relation-classification', [{ code: 'INVALID_RELATION_OUTPUT' }])
  }

  const decisionValidation = validateVerticalPairDecisionBatch(runs, relationResult.value)
  if (!decisionValidation.valid) {
    return failure('relation-classification', decisionValidation.issues.map((code) => ({ code })))
  }

  const relations = projectVerticalRelationDecisions(decisionValidation.decisions)
  const candidates = [...comparableCandidates, ...unsafeCandidates]
    .sort((left, right) => left.id.localeCompare(right.id))
  const graph: RowEvidenceGraph = { runs, candidates, relations }
  const validation = validateRowEvidenceGraph(graph)
  if (!validation.valid) return failure('validation', validation.issues.map(formalIssue))

  return { ok: true, graph }
}
