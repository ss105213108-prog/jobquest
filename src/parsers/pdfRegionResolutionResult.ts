import type { InternalPageLayoutEvidenceResult } from './pdfPageLayoutEvidence'
import {
  isAvailablePageLayoutEvidence,
  validateVisualGroupFormationResult,
  type AvailablePageLayoutEvidence,
  type VisualGroupFormationResult,
} from './pdfVisualGroupResult'

export interface RegionBounds {
  readonly minX: number
  readonly maxX: number
  readonly minY: number
  readonly maxY: number
}

export interface Region {
  readonly regionId: string
  readonly pageNumber: number
  readonly groupIds: readonly string[]
  readonly bounds: RegionBounds
  readonly role?: 'COLUMN_LIKE' | 'SPANNING'
}

// Spatial edges remain undefined until their evidence and meaning have a contract.
export interface RegionGraph {
  readonly regions: readonly Region[]
}

export type RegionResolutionResult =
  | { readonly status: 'RESOLVED'; readonly pageNumber: number; readonly graph: RegionGraph }
  | { readonly status: 'INSUFFICIENT_EVIDENCE'; readonly pageNumber: number; readonly diagnostic: {
      readonly code: 'SPATIAL_STRUCTURE_UNRESOLVED'
      readonly regionCount?: number
    } }
  | { readonly status: 'FAILED'; readonly pageNumber: number; readonly code:
      'INVALID_INPUT_STRUCTURE' | 'INVALID_REGION_GRAPH' | 'INTERNAL_CONSISTENCY_FAILURE' }

export interface RegionResolutionInput {
  readonly evidence: InternalPageLayoutEvidenceResult
  readonly visualGroups: VisualGroupFormationResult
}

type Origin = {
  readonly evidence: AvailablePageLayoutEvidence
  readonly graph: AvailablePageLayoutEvidence['graph']
  readonly hle: AvailablePageLayoutEvidence['horizontalEvidence']
  readonly visualGroups: VisualGroupFormationResult
}

const origins = new WeakMap<RegionResolutionInput, Origin>()
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const keysOnly = (value: Record<string, unknown>, keys: readonly string[]) => Object.keys(value).every((key) => keys.includes(key))
const validPage = (page: unknown): page is number => Number.isSafeInteger(page) && (page as number) > 0
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)

// The producer must bind its resolved result to the exact evidence instance it used.
export function bindRegionResolutionInput(
  sourceEvidence: AvailablePageLayoutEvidence,
  visualGroups: VisualGroupFormationResult,
  evidence: InternalPageLayoutEvidenceResult = sourceEvidence,
): RegionResolutionInput {
  const input = { evidence, visualGroups }
  origins.set(input, {
    evidence: sourceEvidence, graph: sourceEvidence.graph,
    hle: sourceEvidence.horizontalEvidence, visualGroups,
  })
  return input
}

export function validateRegionResolutionInput(input: RegionResolutionInput): readonly string[] {
  const origin = origins.get(input)
  if (!origin) return ['MISSING_EVIDENCE_PROVENANCE']
  if (input.visualGroups.status !== 'RESOLVED') return ['VISUAL_GROUP_NOT_RESOLVED']
  if (input.evidence.status !== 'AVAILABLE') return ['PAGE_LAYOUT_NOT_AVAILABLE']
  if (input.evidence !== origin.evidence || input.evidence.graph !== origin.graph
    || input.evidence.horizontalEvidence !== origin.hle || input.visualGroups !== origin.visualGroups) {
    return ['EVIDENCE_INSTANCE_MISMATCH']
  }
  if (!validPage(input.evidence.pageNumber) || input.visualGroups.pageNumber !== input.evidence.pageNumber) {
    return ['PAGE_IDENTITY_MISMATCH']
  }
  try {
    if (!isAvailablePageLayoutEvidence(input.evidence)) return ['INVALID_PAGE_LAYOUT_EVIDENCE']
    const validation = validateVisualGroupFormationResult({ evidence: input.evidence, result: input.visualGroups })
    if (!validation.valid) return ['INVALID_VISUAL_GROUP_RESULT', ...validation.issues.map((issue) => issue.code)]
    return []
  } catch {
    return ['INVALID_PAGE_LAYOUT_EVIDENCE']
  }
}

const memberBounds = (input: RegionResolutionInput, groupIds: readonly string[]): RegionBounds | null => {
  if (input.evidence.status !== 'AVAILABLE' || input.visualGroups.status !== 'RESOLVED') return null
  const groups = new Map(input.visualGroups.groups.map((group) => [group.groupId, group]))
  const runs = new Map(input.evidence.graph.runs.map((run) => [run.originalIndex, run]))
  const members = groupIds.flatMap((id) => groups.get(id)?.runIds ?? []).map((id) => runs.get(id))
  if (members.length === 0 || members.some((run) => !run || !run.geometryComparable
    || !finite(run.x) || !finite(run.y) || !finite(run.height) || !finite(run.endX))) return null
  const safe = members as (NonNullable<typeof members[number]> & { endX: number })[]
  return {
    minX: Math.min(...safe.map((run) => run.x)), maxX: Math.max(...safe.map((run) => run.endX)),
    minY: Math.min(...safe.map((run) => run.y)), maxY: Math.max(...safe.map((run) => run.y + run.height)),
  }
}

export function validateRegionResolutionResult(input: RegionResolutionInput, result: unknown): readonly string[] {
  if (!isRecord(result) || !['RESOLVED', 'INSUFFICIENT_EVIDENCE', 'FAILED'].includes(result.status as string)) {
    return ['INVALID_RESULT_STATE']
  }
  const admission = validateRegionResolutionInput(input)
  if (admission.length > 0) return result.status === 'FAILED' && result.code === 'INVALID_INPUT_STRUCTURE'
    && result.pageNumber === input.evidence.pageNumber && validPage(result.pageNumber)
    && keysOnly(result, ['status', 'pageNumber', 'code']) ? [] : ['REGION_INPUT_NOT_ADMITTED', ...admission]
  if (result.pageNumber !== input.evidence.pageNumber) return ['PAGE_IDENTITY_MISMATCH']

  if (result.status === 'INSUFFICIENT_EVIDENCE') {
    if (!keysOnly(result, ['status', 'pageNumber', 'diagnostic']) || !isRecord(result.diagnostic)
      || !keysOnly(result.diagnostic, ['code', 'regionCount'])
      || result.diagnostic.code !== 'SPATIAL_STRUCTURE_UNRESOLVED') return ['INVALID_INSUFFICIENT_RESULT']
    if (result.diagnostic.regionCount !== undefined && (!Number.isSafeInteger(result.diagnostic.regionCount)
      || (result.diagnostic.regionCount as number) < 0)) return ['UNSAFE_DIAGNOSTIC']
    return []
  }
  if (result.status === 'FAILED') return keysOnly(result, ['status', 'pageNumber', 'code'])
    && ['INVALID_REGION_GRAPH', 'INTERNAL_CONSISTENCY_FAILURE'].includes(result.code as string)
    ? [] : ['INVALID_FAILURE_RESULT']
  if (!keysOnly(result, ['status', 'pageNumber', 'graph']) || !isRecord(result.graph)
    || !keysOnly(result.graph, ['regions']) || !Array.isArray(result.graph.regions)) return ['INVALID_RESOLVED_SCHEMA']

  const expectedGroups = new Set(input.visualGroups.status === 'RESOLVED' ? input.visualGroups.groups.map((group) => group.groupId) : [])
  const owners = new Map<string, number>()
  const regionIds = new Set<string>()
  const issues: string[] = []
  for (const value of result.graph.regions) {
    if (!isRecord(value) || !keysOnly(value, ['regionId', 'pageNumber', 'groupIds', 'bounds', 'role'])
      || !Array.isArray(value.groupIds) || value.groupIds.length === 0 || value.pageNumber !== input.evidence.pageNumber
      || !isRecord(value.bounds) || !keysOnly(value.bounds, ['minX', 'maxX', 'minY', 'maxY'])) {
      issues.push('INVALID_REGION_NODE')
      continue
    }
    const ids = value.groupIds as unknown[]
    if (ids.some((id) => typeof id !== 'string' || !expectedGroups.has(id))) issues.push('UNKNOWN_GROUP_ID')
    if (new Set(ids).size !== ids.length) issues.push('DUPLICATE_GROUP_MEMBERSHIP')
    for (const id of ids) if (typeof id === 'string') owners.set(id, (owners.get(id) ?? 0) + 1)
    if (value.role !== undefined && !['COLUMN_LIKE', 'SPANNING'].includes(value.role as string)) issues.push('INVALID_STRUCTURAL_ROLE')
    if (typeof value.regionId !== 'string' || value.regionId.length === 0 || regionIds.has(value.regionId)) {
      issues.push('INVALID_REGION_ID')
    }
    regionIds.add(value.regionId as string)
    const bounds = value.bounds
    if (!['minX', 'maxX', 'minY', 'maxY'].every((key) => finite(bounds[key]))
      || (bounds.minX as number) > (bounds.maxX as number) || (bounds.minY as number) > (bounds.maxY as number)) {
      issues.push('INVALID_REGION_GEOMETRY')
      continue
    }
    if (ids.every((id) => typeof id === 'string' && expectedGroups.has(id))) {
      const expected = memberBounds(input, ids as string[])
      if (!expected) issues.push('REGION_GEOMETRY_UNAVAILABLE')
      else if (['minX', 'maxX', 'minY', 'maxY'].some((key) => bounds[key] !== expected[key as keyof RegionBounds])) {
        issues.push('REGION_GEOMETRY_MISMATCH')
      }
    }
  }
  for (const groupId of expectedGroups) {
    if (!owners.has(groupId)) issues.push('MISSING_GROUP_MEMBERSHIP')
    else if (owners.get(groupId) !== 1) issues.push('DUPLICATE_GROUP_MEMBERSHIP')
  }
  return [...new Set(issues)].sort()
}

export function canRunReadingOrder(input: RegionResolutionInput, result: unknown): boolean {
  return isRecord(result) && result.status === 'RESOLVED'
    && validateRegionResolutionResult(input, result).length === 0
}
