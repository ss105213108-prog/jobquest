import type { InternalPageLayoutEvidenceResult } from './pdfPageLayoutEvidence'
import {
  validateRowEvidenceGraph,
  type RowEvidenceGraph,
  type RunId,
  type VerticalRelationState,
} from './pdfRowEvidenceGraph'

export interface VisualGroup {
  readonly groupId: string
  readonly runIds: readonly RunId[]
}

export type VisualGroupInsufficientReason =
  | 'INSUFFICIENT_CONTEXT'
  | 'AMBIGUOUS_STRUCTURAL_EVIDENCE'

export interface VisualGroupInsufficientDiagnostic {
  readonly reasonCode: VisualGroupInsufficientReason
  readonly runIds?: readonly RunId[]
  readonly candidateIds?: readonly string[]
  readonly counts?: Readonly<Record<string, number>>
  readonly numericEvidence?: Readonly<Record<string, number | null>>
}

export type VisualGroupFailureCode =
  | 'INVALID_GRAPH_HLE_PAIRING'
  | 'RUN_IDENTITY_MISMATCH'
  | 'UNKNOWN_RUN_REFERENCE'
  | 'DUPLICATE_CANONICAL_IDENTITY'
  | 'PERMISSION_INVARIANT_VIOLATION'
  | 'INVALID_INPUT_STRUCTURE'
  | 'INTERNAL_FORMATION_CONSISTENCY_FAILURE'

export interface VisualGroupFailureIssue {
  readonly code: string
  readonly runIds?: readonly RunId[]
  readonly candidateIds?: readonly string[]
  readonly count?: number
}

export type VisualGroupFormationResult =
  | {
      readonly status: 'RESOLVED'
      readonly pageNumber: number
      readonly groups: readonly VisualGroup[]
    }
  | {
      readonly status: 'INSUFFICIENT_EVIDENCE'
      readonly pageNumber: number
      readonly diagnostic?: VisualGroupInsufficientDiagnostic
    }
  | {
      readonly status: 'FAILED'
      readonly pageNumber: number
      readonly code: VisualGroupFailureCode
      readonly issues: readonly VisualGroupFailureIssue[]
    }

export type AvailablePageLayoutEvidence = Extract<
  InternalPageLayoutEvidenceResult,
  { readonly status: 'AVAILABLE' }
>

export interface VisualGroupContractIssue {
  readonly code: string
  readonly runIds?: readonly RunId[]
  readonly groupIds?: readonly string[]
}

export interface VisualGroupContractValidation {
  readonly valid: boolean
  readonly issues: readonly VisualGroupContractIssue[]
}

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
)

const sortedUniqueNumbers = (values: readonly number[]) => [...new Set(values)].sort((left, right) => left - right)
const sortedUniqueStrings = (values: readonly string[]) => [...new Set(values)].sort()
const sameNumbers = (left: readonly number[], right: readonly number[]) => (
  left.length === right.length && left.every((value, index) => value === right[index])
)

const issueKey = (issue: VisualGroupContractIssue) => [
  issue.code,
  ...(issue.runIds ?? []),
  ...(issue.groupIds ?? []),
].join('|')

const normalizedIssues = (
  issues: readonly VisualGroupContractIssue[],
): readonly VisualGroupContractIssue[] => {
  const unique = new Map<string, VisualGroupContractIssue>()
  for (const issue of issues) {
    const normalized = {
      code: issue.code,
      ...(issue.runIds ? { runIds: sortedUniqueNumbers(issue.runIds) } : {}),
      ...(issue.groupIds ? { groupIds: sortedUniqueStrings(issue.groupIds) } : {}),
    }
    unique.set(issueKey(normalized), normalized)
  }
  return [...unique.values()].sort((left, right) => issueKey(left).localeCompare(issueKey(right)))
}

const allHleRunReferences = (evidence: AvailablePageLayoutEvidence): readonly RunId[] => {
  const hle = evidence.horizontalEvidence
  return [
    ...hle.runIntervals.map((interval) => interval.runId),
    ...hle.slices.flatMap((slice) => slice.runIds),
    ...hle.sliceGaps.flatMap((gap) => [gap.leftRunId, gap.rightRunId]),
    ...hle.segments.flatMap((segment) => segment.occupiedByRunIds),
    ...hle.availability.excludedUnsafeRunIds,
  ]
}

const inputContractIssues = (
  evidence: AvailablePageLayoutEvidence,
): readonly VisualGroupContractIssue[] => {
  const issues: VisualGroupContractIssue[] = validateRowEvidenceGraph(evidence.graph).issues.map((issue) => ({
    code: `INVALID_GRAPH_${issue.code}`,
    ...(issue.runIds ? { runIds: issue.runIds } : {}),
  }))
  const graphRunIds = evidence.graph.runs.map((run) => run.originalIndex)
  const graphRunIdSet = new Set(graphRunIds)
  const hleReferences = allHleRunReferences(evidence)
  const unknownHleRunIds = hleReferences.filter((runId) => !graphRunIdSet.has(runId))
  if (unknownHleRunIds.length > 0) {
    issues.push({ code: 'HLE_UNKNOWN_RUN_REFERENCE', runIds: unknownHleRunIds })
  }

  const intervalRunIds = evidence.horizontalEvidence.runIntervals.map((interval) => interval.runId)
  if (new Set(intervalRunIds).size !== intervalRunIds.length) {
    issues.push({ code: 'DUPLICATE_HLE_RUN_INTERVAL', runIds: intervalRunIds })
  }
  const representedRunIds = sortedUniqueNumbers([
    ...intervalRunIds,
    ...evidence.horizontalEvidence.availability.excludedUnsafeRunIds,
  ])
  const canonicalGraphRunIds = sortedUniqueNumbers(graphRunIds)
  if (!sameNumbers(representedRunIds, canonicalGraphRunIds)) {
    issues.push({ code: 'GRAPH_HLE_RUN_SET_MISMATCH', runIds: [
      ...representedRunIds,
      ...canonicalGraphRunIds,
    ] })
  }

  const candidateIds = new Set(evidence.graph.candidates.map((candidate) => candidate.id))
  const unknownSliceCandidates = evidence.horizontalEvidence.slices
    .flatMap((slice) => [slice.sliceId, slice.sourceCandidateId])
    .filter((candidateId) => !candidateIds.has(candidateId))
  if (unknownSliceCandidates.length > 0) {
    issues.push({ code: 'HLE_UNKNOWN_CANDIDATE_REFERENCE' })
  }
  return normalizedIssues(issues)
}

const visualGroupAdmissionIssues = (
  evidence: InternalPageLayoutEvidenceResult,
): readonly VisualGroupContractIssue[] => {
  if (evidence.status !== 'AVAILABLE') {
    return [{ code: 'PAGE_LAYOUT_EVIDENCE_NOT_AVAILABLE' }]
  }
  return normalizedIssues([
    ...(evidence.graph.runs.length === 0
      ? [{ code: 'ZERO_RUN_AVAILABLE_NOT_ADMISSIBLE' }]
      : []),
    ...inputContractIssues(evidence),
  ])
}

const relationStateByPair = (graph: RowEvidenceGraph): ReadonlyMap<string, VerticalRelationState> => {
  const key = (left: RunId, right: RunId) => (
    left < right ? `${left}:${right}` : `${right}:${left}`
  )
  return new Map(graph.relations.map((relation) => [
    key(relation.leftRunId, relation.rightRunId),
    relation.state,
  ]))
}

const resolvedResultIssues = (
  evidence: AvailablePageLayoutEvidence,
  result: Record<string, unknown>,
): readonly VisualGroupContractIssue[] => {
  const issues: VisualGroupContractIssue[] = []
  const allowedKeys = new Set(['status', 'pageNumber', 'groups'])
  if (Object.keys(result).some((key) => !allowedKeys.has(key))) {
    issues.push({ code: 'RESOLVED_SCHEMA_CONFLICT' })
  }
  if (!Array.isArray(result.groups)) return [{ code: 'RESOLVED_GROUPS_REQUIRED' }, ...issues]

  const graphRuns = new Map(evidence.graph.runs.map((run) => [run.originalIndex, run]))
  const membershipCounts = new Map<RunId, number>()
  const seenGroupIds = new Set<string>()
  const relationStates = relationStateByPair(evidence.graph)
  const pairKey = (left: RunId, right: RunId) => (
    left < right ? `${left}:${right}` : `${right}:${left}`
  )

  for (const value of result.groups) {
    if (!isRecord(value)
      || typeof value.groupId !== 'string'
      || !Array.isArray(value.runIds)
      || value.runIds.some((runId) => typeof runId !== 'number')) {
      issues.push({ code: 'INVALID_VISUAL_GROUP_STRUCTURE' })
      continue
    }
    const groupId = value.groupId
    const runIds = value.runIds as number[]
    if (Object.keys(value).some((key) => key !== 'groupId' && key !== 'runIds')) {
      issues.push({ code: 'INVALID_VISUAL_GROUP_STRUCTURE', groupIds: [groupId] })
    }
    if (runIds.length === 0) issues.push({ code: 'EMPTY_VISUAL_GROUP', groupIds: [groupId] })
    if (seenGroupIds.has(groupId)) issues.push({ code: 'DUPLICATE_VISUAL_GROUP_ID', groupIds: [groupId] })
    seenGroupIds.add(groupId)
    if (new Set(runIds).size !== runIds.length) {
      issues.push({ code: 'DUPLICATE_GROUP_RUN_REFERENCE', runIds, groupIds: [groupId] })
    }
    for (const runId of runIds) {
      if (!graphRuns.has(runId)) issues.push({ code: 'UNKNOWN_GROUP_RUN_ID', runIds: [runId], groupIds: [groupId] })
      membershipCounts.set(runId, (membershipCounts.get(runId) ?? 0) + 1)
    }
    const knownRunIds = runIds.filter((runId) => graphRuns.has(runId))
    if (knownRunIds.length > 1 && knownRunIds.some((runId) => !graphRuns.get(runId)?.geometryComparable)) {
      issues.push({ code: 'UNSAFE_RUN_NOT_SINGLETON', runIds: knownRunIds, groupIds: [groupId] })
    }
    for (let leftIndex = 0; leftIndex < knownRunIds.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < knownRunIds.length; rightIndex += 1) {
        const state = relationStates.get(pairKey(knownRunIds[leftIndex], knownRunIds[rightIndex]))
        if (state !== 'SUPPORTED' && state !== 'DEFERRED') {
          issues.push({
            code: 'DIRECT_PAIR_PERMISSION_REQUIRED',
            runIds: [knownRunIds[leftIndex], knownRunIds[rightIndex]],
            groupIds: [groupId],
          })
        }
      }
    }
  }

  for (const runId of graphRuns.keys()) {
    const count = membershipCounts.get(runId) ?? 0
    if (count === 0) issues.push({ code: 'MISSING_FINAL_MEMBERSHIP', runIds: [runId] })
    if (count > 1) issues.push({ code: 'DUPLICATE_FINAL_MEMBERSHIP', runIds: [runId] })
  }
  return normalizedIssues(issues)
}

const validInsufficientReasons = new Set<VisualGroupInsufficientReason>([
  'INSUFFICIENT_CONTEXT',
  'AMBIGUOUS_STRUCTURAL_EVIDENCE',
])

const insufficientResultIssues = (
  evidence: AvailablePageLayoutEvidence,
  result: Record<string, unknown>,
): readonly VisualGroupContractIssue[] => {
  const issues: VisualGroupContractIssue[] = []
  const allowedKeys = new Set(['status', 'pageNumber', 'diagnostic'])
  if (Object.keys(result).some((key) => !allowedKeys.has(key))) {
    issues.push({ code: 'INSUFFICIENT_SCHEMA_CONFLICT' })
  }
  if (result.diagnostic === undefined) return normalizedIssues(issues)
  if (!isRecord(result.diagnostic)) return [{ code: 'INVALID_INSUFFICIENT_DIAGNOSTIC' }, ...issues]

  const allowedDiagnosticKeys = new Set([
    'reasonCode', 'runIds', 'candidateIds', 'counts', 'numericEvidence',
  ])
  if (Object.keys(result.diagnostic).some((key) => !allowedDiagnosticKeys.has(key))) {
    issues.push({ code: 'PRIVATE_OR_UNSUPPORTED_DIAGNOSTIC_FIELD' })
  }
  if (typeof result.diagnostic.reasonCode !== 'string'
    || !validInsufficientReasons.has(result.diagnostic.reasonCode as VisualGroupInsufficientReason)) {
    issues.push({ code: 'INVALID_INSUFFICIENT_REASON' })
  }
  const knownRunIds = new Set(evidence.graph.runs.map((run) => run.originalIndex))
  if (result.diagnostic.runIds !== undefined) {
    if (!Array.isArray(result.diagnostic.runIds)
      || result.diagnostic.runIds.some((runId) => typeof runId !== 'number')) {
      issues.push({ code: 'INVALID_INSUFFICIENT_DIAGNOSTIC' })
    } else {
      const unknownRunIds = result.diagnostic.runIds.filter((runId) => !knownRunIds.has(runId as number)) as number[]
      if (unknownRunIds.length > 0) issues.push({ code: 'UNKNOWN_DIAGNOSTIC_RUN_ID', runIds: unknownRunIds })
    }
  }
  const knownCandidateIds = new Set(evidence.graph.candidates.map((candidate) => candidate.id))
  if (result.diagnostic.candidateIds !== undefined
    && (!Array.isArray(result.diagnostic.candidateIds)
      || result.diagnostic.candidateIds.some((candidateId) => (
        typeof candidateId !== 'string' || !knownCandidateIds.has(candidateId)
      )))) {
    issues.push({ code: 'UNKNOWN_OR_INVALID_DIAGNOSTIC_CANDIDATE_ID' })
  }
  if (result.diagnostic.counts !== undefined
    && (!isRecord(result.diagnostic.counts)
      || Object.values(result.diagnostic.counts).some((count) => (
        typeof count !== 'number' || !Number.isFinite(count)
      )))) {
    issues.push({ code: 'INVALID_DIAGNOSTIC_COUNTS' })
  }
  if (result.diagnostic.numericEvidence !== undefined
    && (!isRecord(result.diagnostic.numericEvidence)
      || Object.values(result.diagnostic.numericEvidence).some((value) => (
        value !== null && (typeof value !== 'number' || !Number.isFinite(value))
      )))) {
    issues.push({ code: 'INVALID_DIAGNOSTIC_NUMERIC_EVIDENCE' })
  }
  return normalizedIssues(issues)
}

const validFailureCodes = new Set<VisualGroupFailureCode>([
  'INVALID_GRAPH_HLE_PAIRING',
  'RUN_IDENTITY_MISMATCH',
  'UNKNOWN_RUN_REFERENCE',
  'DUPLICATE_CANONICAL_IDENTITY',
  'PERMISSION_INVARIANT_VIOLATION',
  'INVALID_INPUT_STRUCTURE',
  'INTERNAL_FORMATION_CONSISTENCY_FAILURE',
])

const failedResultIssues = (
  result: Record<string, unknown>,
): readonly VisualGroupContractIssue[] => {
  const issues: VisualGroupContractIssue[] = []
  const allowedKeys = new Set(['status', 'pageNumber', 'code', 'issues'])
  if (Object.keys(result).some((key) => !allowedKeys.has(key))) {
    issues.push({ code: 'FAILED_SCHEMA_CONFLICT' })
  }
  if (typeof result.code !== 'string' || !validFailureCodes.has(result.code as VisualGroupFailureCode)) {
    issues.push({ code: 'INVALID_VISUALGROUP_FAILURE_CODE' })
  }
  if (!Array.isArray(result.issues)) {
    issues.push({ code: 'VISUALGROUP_FAILURE_ISSUES_REQUIRED' })
  } else {
    const allowedIssueKeys = new Set(['code', 'runIds', 'candidateIds', 'count'])
    for (const issue of result.issues) {
      if (!isRecord(issue)
        || typeof issue.code !== 'string'
        || Object.keys(issue).some((key) => !allowedIssueKeys.has(key))
        || (issue.runIds !== undefined
          && (!Array.isArray(issue.runIds) || issue.runIds.some((runId) => typeof runId !== 'number')))
        || (issue.candidateIds !== undefined
          && (!Array.isArray(issue.candidateIds)
            || issue.candidateIds.some((candidateId) => typeof candidateId !== 'string')))
        || (issue.count !== undefined
          && (typeof issue.count !== 'number' || !Number.isFinite(issue.count)))) {
        issues.push({ code: 'INVALID_VISUALGROUP_FAILURE_ISSUE' })
      }
    }
  }
  return normalizedIssues(issues)
}

export function validateVisualGroupFormationResult(input: {
  readonly evidence: AvailablePageLayoutEvidence
  readonly result: unknown
}): VisualGroupContractValidation {
  if (!isRecord(input.result) || typeof input.result.status !== 'string') {
    return { valid: false, issues: [{ code: 'INVALID_VISUALGROUP_RESULT' }] }
  }

  const pageNumberIssues: readonly VisualGroupContractIssue[] = (
    typeof input.result.pageNumber === 'number' && Number.isFinite(input.result.pageNumber)
  ) ? [] : [{ code: 'INVALID_VISUALGROUP_PAGE_NUMBER' }]

  const evidenceIssues = visualGroupAdmissionIssues(input.evidence)
  let resultIssues: readonly VisualGroupContractIssue[]
  if (input.result.status === 'RESOLVED') {
    resultIssues = resolvedResultIssues(input.evidence, input.result)
  } else if (input.result.status === 'INSUFFICIENT_EVIDENCE') {
    resultIssues = insufficientResultIssues(input.evidence, input.result)
  } else if (input.result.status === 'FAILED') {
    resultIssues = failedResultIssues(input.result)
  } else {
    resultIssues = [{ code: 'UNSUPPORTED_VISUALGROUP_OUTCOME' }]
  }

  const inputMustBeValid = input.result.status !== 'FAILED'
  const issues = normalizedIssues([
    ...(inputMustBeValid ? evidenceIssues : []),
    ...pageNumberIssues,
    ...resultIssues,
  ])
  return { valid: issues.length === 0, issues }
}

export function isAvailablePageLayoutEvidence(
  evidence: InternalPageLayoutEvidenceResult,
): evidence is AvailablePageLayoutEvidence {
  return visualGroupAdmissionIssues(evidence).length === 0
}

export type ResolvedVisualGroupResult = Extract<VisualGroupFormationResult, { status: 'RESOLVED' }>

export function isResolvedVisualGroupResult(
  result: VisualGroupFormationResult,
): result is ResolvedVisualGroupResult {
  return result.status === 'RESOLVED'
}
