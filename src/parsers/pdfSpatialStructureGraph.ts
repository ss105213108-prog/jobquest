import type { InternalPageLayoutEvidenceResult } from './pdfPageLayoutEvidence'
import {
  isAvailablePageLayoutEvidence,
  validateVisualGroupFormationResult,
  type AvailablePageLayoutEvidence,
  type VisualGroupFormationResult,
} from './pdfVisualGroupResult'

export interface SpatialStructureInput {
  readonly evidence: InternalPageLayoutEvidenceResult
  readonly visualGroups: VisualGroupFormationResult
}

export interface SpatialBounds {
  readonly minX: number
  readonly maxX: number
  readonly minY: number
  readonly maxY: number
}

export interface SpatialNode {
  readonly groupId: string
  readonly bounds: SpatialBounds
}

export interface SpatialScope {
  readonly pageNumber: number
  readonly minY: number
  readonly maxY: number
}

export type SpatialFactKind = 'X_DISJOINT' | 'X_OVERLAP' | 'Y_ABOVE' | 'BAND_OCCUPANCY' | 'X_SPANS'

export interface SpatialFact {
  readonly kind: SpatialFactKind
  readonly nodeIds: readonly string[]
  readonly scope: SpatialScope
  readonly witnessRunIds: readonly number[]
}

export interface SpatialStructureGraph {
  readonly nodes: readonly SpatialNode[]
  readonly facts: readonly SpatialFact[]
}

export type SpatialStructureResult =
  | { readonly status: 'RESOLVED'; readonly pageNumber: number; readonly graph: SpatialStructureGraph }
  | { readonly status: 'INSUFFICIENT_EVIDENCE'; readonly pageNumber: number; readonly diagnostic: {
      readonly code: 'NODE_GEOMETRY_UNAVAILABLE'; readonly nodeCount?: number
    } }
  | { readonly status: 'FAILED'; readonly pageNumber: number; readonly code:
      'INVALID_INPUT_STRUCTURE' | 'INVALID_SPATIAL_GRAPH' | 'INTERNAL_CONSISTENCY_FAILURE' }

type Origin = {
  readonly source: AvailablePageLayoutEvidence
  readonly graph: AvailablePageLayoutEvidence['graph']
  readonly hle: AvailablePageLayoutEvidence['horizontalEvidence']
  readonly visualGroups: VisualGroupFormationResult
}

const origins = new WeakMap<SpatialStructureInput, Origin>()
const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
)
const keysOnly = (value: Record<string, unknown>, keys: readonly string[]) => (
  Object.keys(value).every((key) => keys.includes(key))
)
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
const validPage = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) > 0
const sorted = <T extends string | number>(values: readonly T[]) => [...values].sort()
const same = <T>(left: readonly T[], right: readonly T[]) => (
  left.length === right.length && left.every((value, index) => value === right[index])
)

// The producer binds the exact upstream instances it used; equality of copied evidence is not enough.
export function bindSpatialInput(
  source: AvailablePageLayoutEvidence,
  visualGroups: VisualGroupFormationResult,
  evidence: InternalPageLayoutEvidenceResult = source,
): SpatialStructureInput {
  const input = { evidence, visualGroups }
  origins.set(input, { source, graph: source.graph, hle: source.horizontalEvidence, visualGroups })
  return input
}

export function spatialInputIssues(input: SpatialStructureInput): readonly string[] {
  if (!isRecord(input) || !isRecord(input.evidence) || !isRecord(input.visualGroups)) return ['INVALID_INPUT_STRUCTURE']
  const origin = origins.get(input)
  if (!origin) return ['MISSING_EVIDENCE_PROVENANCE']
  if (input.visualGroups.status !== 'RESOLVED') return ['VISUAL_GROUP_NOT_RESOLVED']
  if (input.evidence.status !== 'AVAILABLE') return ['PAGE_LAYOUT_NOT_AVAILABLE']
  if (input.evidence !== origin.source || input.evidence.graph !== origin.graph
    || input.evidence.horizontalEvidence !== origin.hle || input.visualGroups !== origin.visualGroups) {
    return ['EVIDENCE_INSTANCE_MISMATCH']
  }
  if (!validPage(input.evidence.pageNumber) || input.visualGroups.pageNumber !== input.evidence.pageNumber) {
    return ['PAGE_IDENTITY_MISMATCH']
  }
  try {
    if (!isAvailablePageLayoutEvidence(input.evidence)) return ['INVALID_PAGE_LAYOUT_EVIDENCE']
    const validation = validateVisualGroupFormationResult({ evidence: input.evidence, result: input.visualGroups })
    return validation.valid ? [] : ['INVALID_VISUAL_GROUP_RESULT', ...validation.issues.map((issue) => issue.code)]
  } catch {
    return ['INVALID_PAGE_LAYOUT_EVIDENCE']
  }
}

function groupIds(input: SpatialStructureInput): readonly string[] {
  return input.visualGroups.status === 'RESOLVED'
    ? input.visualGroups.groups.map((group) => group.groupId) : []
}

function groupBounds(input: SpatialStructureInput, groupId: string): SpatialBounds | null {
  if (input.evidence.status !== 'AVAILABLE' || input.visualGroups.status !== 'RESOLVED') return null
  const group = input.visualGroups.groups.find((value) => value.groupId === groupId)
  if (!group) return null
  const runs = new Map(input.evidence.graph.runs.map((run) => [run.originalIndex, run]))
  const members = group.runIds.map((id) => runs.get(id))
  if (members.length === 0 || members.some((run) => !run || !run.geometryComparable
    || !finite(run.x) || !finite(run.y) || !finite(run.height) || run.height <= 0 || !finite(run.endX))) return null
  const safe = members as (NonNullable<typeof members[number]> & { endX: number })[]
  return {
    minX: Math.min(...safe.map((run) => run.x)), maxX: Math.max(...safe.map((run) => run.endX)),
    minY: Math.min(...safe.map((run) => run.y)), maxY: Math.max(...safe.map((run) => run.y + run.height)),
  }
}

const factNodes = (kind: SpatialFactKind, ids: readonly string[]) => {
  if (kind === 'BAND_OCCUPANCY') return ids.length > 0 && new Set(ids).size === ids.length
  return ids.length === (kind === 'X_SPANS' ? 3 : 2) && new Set(ids).size === ids.length
}

function factKey(fact: Pick<SpatialFact, 'kind' | 'nodeIds' | 'scope'>): string {
  const ids = fact.kind === 'Y_ABOVE' ? fact.nodeIds
    : fact.kind === 'X_SPANS' ? [fact.nodeIds[0], ...sorted(fact.nodeIds.slice(1))]
      : sorted(fact.nodeIds)
  return JSON.stringify([fact.kind, ids, fact.scope.pageNumber, fact.scope.minY, fact.scope.maxY])
}

function factIssues(input: SpatialStructureInput, facts: readonly unknown[]): readonly string[] {
  if (input.evidence.status !== 'AVAILABLE' || input.visualGroups.status !== 'RESOLVED') return ['INPUT_NOT_ADMITTED']
  const groups = new Map(input.visualGroups.groups.map((group) => [group.groupId, group]))
  const hleRunIds = new Set(input.evidence.horizontalEvidence.runIntervals.map((interval) => interval.runId))
  const allBounds = [...groups.keys()].map((id) => groupBounds(input, id)).filter((bounds) => bounds !== null)
  const pageMinY = Math.min(...allBounds.map((bounds) => bounds.minY))
  const pageMaxY = Math.max(...allBounds.map((bounds) => bounds.maxY))
  const issues: string[] = []
  const factKeys = new Set<string>()
  const xClaims = new Map<string, Set<string>>()
  for (const value of facts) {
    if (!isRecord(value) || !keysOnly(value, ['kind', 'nodeIds', 'scope', 'witnessRunIds'])
      || !['X_DISJOINT', 'X_OVERLAP', 'Y_ABOVE', 'BAND_OCCUPANCY', 'X_SPANS'].includes(value.kind as string)
      || !Array.isArray(value.nodeIds) || !value.nodeIds.every((id) => typeof id === 'string')
      || !Array.isArray(value.witnessRunIds) || !value.witnessRunIds.every((id) => Number.isSafeInteger(id))
      || !isRecord(value.scope) || !keysOnly(value.scope, ['pageNumber', 'minY', 'maxY'])) {
      issues.push('INVALID_FACT_SCHEMA')
      continue
    }
    const fact = value as unknown as SpatialFact
    if (!factNodes(fact.kind, fact.nodeIds)) {
      issues.push('INVALID_FACT_ENDPOINTS')
      continue
    }
    if (fact.nodeIds.some((id) => !groups.has(id))) {
      issues.push('UNKNOWN_FACT_NODE')
      continue
    }
    const scope = fact.scope
    if (scope.pageNumber !== input.evidence.pageNumber || !finite(scope.minY) || !finite(scope.maxY)
      || scope.minY >= scope.maxY || scope.minY < pageMinY || scope.maxY > pageMaxY) {
      issues.push('INVALID_FACT_SCOPE')
    }
    const expectedRuns = sorted(fact.nodeIds.flatMap((id) => groups.get(id)?.runIds ?? []))
    if (!same(sorted(fact.witnessRunIds), expectedRuns)
      || new Set(fact.witnessRunIds).size !== fact.witnessRunIds.length
      || fact.witnessRunIds.some((id) => !hleRunIds.has(id))) issues.push('INVALID_FACT_PROVENANCE')
    const bounds = fact.nodeIds.map((id) => groupBounds(input, id))
    if (bounds.some((item) => item === null) || scope.minY >= scope.maxY) {
      issues.push('FACT_NOT_SUPPORTED')
      continue
    }
    const safe = bounds as SpatialBounds[]
    const [a, b, c] = safe
    const inBand = (box: SpatialBounds) => scope.minY >= box.minY && scope.maxY <= box.maxY
    if (fact.kind === 'X_DISJOINT' && !(inBand(a) && inBand(b)
      && (a.maxX < b.minX || b.maxX < a.minX))) issues.push('FACT_NOT_SUPPORTED')
    if (fact.kind === 'X_OVERLAP' && !(inBand(a) && inBand(b)
      && Math.min(a.maxX, b.maxX) > Math.max(a.minX, b.minX))) issues.push('FACT_NOT_SUPPORTED')
    if (fact.kind === 'Y_ABOVE' && !(a.minY > b.maxY
      && scope.minY <= b.minY && scope.maxY >= a.maxY)) issues.push('FACT_NOT_SUPPORTED')
    if (fact.kind === 'BAND_OCCUPANCY') {
      const runs = new Map(input.evidence.graph.runs.map((run) => [run.originalIndex, run]))
      const observed = [...groups.values()].filter((group) => group.runIds.some((id) => {
        const run = runs.get(id)
        return run && run.geometryComparable && finite(run.y) && finite(run.height)
          && run.y < scope.maxY && run.y + run.height > scope.minY
      })).map((group) => group.groupId)
      if (!safe.every((box) => inBand(box)) || !same(sorted(fact.nodeIds), sorted(observed))) {
        issues.push('FACT_NOT_SUPPORTED')
      }
    }
    if (fact.kind === 'X_SPANS' && !(inBand(b) && inBand(c)
      && (b.maxX < c.minX || c.maxX < b.minX)
      && a.minX <= Math.min(b.minX, c.minX) && a.maxX >= Math.max(b.maxX, c.maxX))) {
      issues.push('FACT_NOT_SUPPORTED')
    }
    const key = factKey(fact)
    if (factKeys.has(key)) issues.push('DUPLICATE_FACT')
    factKeys.add(key)
    if (fact.kind === 'X_DISJOINT' || fact.kind === 'X_OVERLAP') {
      const pairKey = JSON.stringify([sorted(fact.nodeIds), scope.pageNumber, scope.minY, scope.maxY])
      const claims = xClaims.get(pairKey) ?? new Set<string>()
      claims.add(fact.kind)
      xClaims.set(pairKey, claims)
    }
  }
  if ([...xClaims.values()].some((claims) => claims.size > 1)) issues.push('CONTRADICTORY_FACTS')
  return [...new Set(issues)].sort()
}

export function spatialResultIssues(input: SpatialStructureInput, result: unknown): readonly string[] {
  if (!isRecord(result) || !['RESOLVED', 'INSUFFICIENT_EVIDENCE', 'FAILED'].includes(result.status as string)) {
    return ['INVALID_RESULT_STATE']
  }
  const admission = spatialInputIssues(input)
  if (admission.length > 0) return result.status === 'FAILED' && result.code === 'INVALID_INPUT_STRUCTURE'
    && isRecord(input) && isRecord(input.evidence) && validPage(result.pageNumber)
    && result.pageNumber === input.evidence.pageNumber && keysOnly(result, ['status', 'pageNumber', 'code'])
    ? [] : ['SPATIAL_INPUT_NOT_ADMITTED', ...admission]
  if (result.pageNumber !== input.evidence.pageNumber) return ['PAGE_IDENTITY_MISMATCH']
  if (result.status === 'INSUFFICIENT_EVIDENCE') {
    if (!keysOnly(result, ['status', 'pageNumber', 'diagnostic']) || !isRecord(result.diagnostic)
      || !keysOnly(result.diagnostic, ['code', 'nodeCount'])
      || result.diagnostic.code !== 'NODE_GEOMETRY_UNAVAILABLE'
      || (result.diagnostic.nodeCount !== undefined
        && (!Number.isSafeInteger(result.diagnostic.nodeCount) || (result.diagnostic.nodeCount as number) < 0))) {
      return ['INVALID_INSUFFICIENT_RESULT']
    }
    return groupIds(input).some((id) => groupBounds(input, id) === null) ? [] : ['UNSUPPORTED_INSUFFICIENCY']
  }
  if (result.status === 'FAILED') return keysOnly(result, ['status', 'pageNumber', 'code'])
    && ['INVALID_SPATIAL_GRAPH', 'INTERNAL_CONSISTENCY_FAILURE'].includes(result.code as string)
    ? [] : ['INVALID_FAILURE_RESULT']
  if (!keysOnly(result, ['status', 'pageNumber', 'graph']) || !isRecord(result.graph)
    || !keysOnly(result.graph, ['nodes', 'facts']) || !Array.isArray(result.graph.nodes)
    || !Array.isArray(result.graph.facts)) return ['INVALID_RESOLVED_SCHEMA']

  const graph = result.graph as { nodes: unknown[]; facts: unknown[] }
  const expected = sorted(groupIds(input))
  const actual: string[] = []
  const issues: string[] = []
  for (const value of graph.nodes) {
    if (!isRecord(value) || !keysOnly(value, ['groupId', 'bounds'])
      || typeof value.groupId !== 'string' || !isRecord(value.bounds)
      || !keysOnly(value.bounds, ['minX', 'maxX', 'minY', 'maxY'])) {
      issues.push('INVALID_NODE_SCHEMA')
      continue
    }
    actual.push(value.groupId)
    const bounds = value.bounds as Record<string, unknown>
    const expectedBounds = groupBounds(input, value.groupId)
    if (!expectedBounds) issues.push(expected.includes(value.groupId) ? 'NODE_GEOMETRY_UNAVAILABLE' : 'UNKNOWN_NODE')
    else if (Object.keys(expectedBounds).some((key) => !finite(bounds[key])
      || bounds[key] !== expectedBounds[key as keyof SpatialBounds])) issues.push('INVALID_NODE_GEOMETRY')
  }
  if (new Set(actual).size !== actual.length) issues.push('DUPLICATE_NODE')
  if (actual.some((id) => !expected.includes(id))) issues.push('UNKNOWN_NODE')
  if (expected.some((id) => !actual.includes(id))) issues.push('MISSING_NODE')
  issues.push(...factIssues(input, graph.facts))
  return [...new Set(issues)].sort()
}

export function querySpatialFact(
  input: SpatialStructureInput,
  result: SpatialStructureResult,
  query: Pick<SpatialFact, 'kind' | 'nodeIds' | 'scope'>,
): 'SUPPORTED' | 'UNKNOWN' {
  if (result.status !== 'RESOLVED' || spatialResultIssues(input, result).length > 0) {
    throw new Error('Query requires a validated resolved spatial graph')
  }
  return result.graph.facts.some((fact) => factKey(fact) === factKey(query)) ? 'SUPPORTED' : 'UNKNOWN'
}

// Admission permits the downstream stage to run; it does not claim an ordering is solvable.
export function canAdmitReadingOrder(input: SpatialStructureInput, result: unknown): boolean {
  return isRecord(result) && result.status === 'RESOLVED' && spatialResultIssues(input, result).length === 0
}

export type SpatialDiagnostic = {
  readonly pageNumber: number
  readonly status: SpatialStructureResult['status']
  readonly nodeCount?: number
  readonly factCount?: number
  readonly code?: 'NODE_GEOMETRY_UNAVAILABLE' | 'INVALID_INPUT_STRUCTURE' | 'INVALID_SPATIAL_GRAPH' | 'INTERNAL_CONSISTENCY_FAILURE'
}

export function projectSpatialDiagnostic(input: SpatialStructureInput, result: unknown): SpatialDiagnostic | null {
  if (spatialResultIssues(input, result).length > 0 || !isRecord(result) || !validPage(result.pageNumber)) return null
  if (result.status === 'RESOLVED') {
    const graph = result.graph as SpatialStructureGraph
    return { pageNumber: result.pageNumber, status: 'RESOLVED', nodeCount: graph.nodes.length, factCount: graph.facts.length }
  }
  if (result.status === 'INSUFFICIENT_EVIDENCE') {
    const diagnostic = result.diagnostic as { code: 'NODE_GEOMETRY_UNAVAILABLE'; nodeCount?: number }
    return { pageNumber: result.pageNumber, status: 'INSUFFICIENT_EVIDENCE', code: diagnostic.code,
      ...(diagnostic.nodeCount === undefined ? {} : { nodeCount: diagnostic.nodeCount }) }
  }
  return { pageNumber: result.pageNumber as number, status: 'FAILED', code: result.code as SpatialDiagnostic['code'] }
}
