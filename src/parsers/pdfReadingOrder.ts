import {
  canAdmitReadingOrder,
  type SpatialStructureInput,
  type SpatialStructureResult,
} from './pdfSpatialStructureGraph'

export type ReadingOrderV1Result =
  | { readonly status: 'RESOLVED'; readonly pageNumber: number; readonly sequence: readonly string[] }
  | { readonly status: 'INSUFFICIENT_EVIDENCE'; readonly pageNumber: number; readonly diagnostic: {
      readonly code: 'NO_APPROVED_PRECEDENCE_SIGNAL'; readonly groupCount: number
    } }
  | { readonly status: 'FAILED'; readonly pageNumber: number; readonly code:
      'INVALID_INPUT_STRUCTURE' | 'INTERNAL_CONSISTENCY_FAILURE' | 'RUNTIME_FAILURE' }

export type ReadingOrderDiagnostic =
  | { readonly pageNumber: number; readonly code: 'RESOLVED' }
  | { readonly pageNumber: number; readonly code: 'NO_APPROVED_PRECEDENCE_SIGNAL'; readonly groupCount: number }
  | { readonly pageNumber: number; readonly code:
      'INVALID_INPUT_STRUCTURE' | 'INTERNAL_CONSISTENCY_FAILURE' | 'RUNTIME_FAILURE' }

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
)
const exactKeys = (value: Record<string, unknown>, expected: readonly string[]) => (
  Object.keys(value).length === expected.length && expected.every((key) => Object.hasOwn(value, key))
)
const validPage = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) > 0
const pageOf = (input: SpatialStructureInput, spatial: SpatialStructureResult): number => (
  isRecord(input) && isRecord(input.evidence) && validPage(input.evidence.pageNumber)
    ? input.evidence.pageNumber : isRecord(spatial) && validPage(spatial.pageNumber) ? spatial.pageNumber : 0
)

export function resolveReadingOrderV1(input: SpatialStructureInput, spatial: SpatialStructureResult): ReadingOrderV1Result {
  const pageNumber = pageOf(input, spatial)
  try {
    if (!canAdmitReadingOrder(input, spatial) || spatial.status !== 'RESOLVED' || spatial.graph.nodes.length === 0) {
      return { status: 'FAILED', pageNumber, code: 'INVALID_INPUT_STRUCTURE' }
    }
    if (spatial.graph.nodes.length > 1) {
      return { status: 'INSUFFICIENT_EVIDENCE', pageNumber,
        diagnostic: { code: 'NO_APPROVED_PRECEDENCE_SIGNAL', groupCount: spatial.graph.nodes.length } }
    }
    return { status: 'RESOLVED', pageNumber, sequence: [spatial.graph.nodes[0].groupId] }
  } catch {
    return { status: 'FAILED', pageNumber, code: 'RUNTIME_FAILURE' }
  }
}

export function readingOrderResultIssues(
  input: SpatialStructureInput, spatial: SpatialStructureResult, value: unknown,
): readonly string[] {
  if (!isRecord(value) || !['RESOLVED', 'INSUFFICIENT_EVIDENCE', 'FAILED'].includes(value.status as string)) return ['INVALID_RESULT']
  const issues: string[] = []
  if (!validPage(value.pageNumber) || value.pageNumber !== pageOf(input, spatial)) issues.push('PAGE_IDENTITY_MISMATCH')
  let admitted = false
  try { admitted = canAdmitReadingOrder(input, spatial) && spatial.status === 'RESOLVED' } catch { admitted = false }
  const ids = admitted && spatial.status === 'RESOLVED' ? spatial.graph.nodes.map((node) => node.groupId) : []
  if (value.status === 'RESOLVED') {
    if (!exactKeys(value, ['status', 'pageNumber', 'sequence']) || !Array.isArray(value.sequence)
      || !admitted || ids.length !== 1 || value.sequence.length !== 1 || value.sequence[0] !== ids[0]) {
      issues.push('INVALID_RESOLVED_SEQUENCE')
    }
  } else if (value.status === 'INSUFFICIENT_EVIDENCE') {
    if (!exactKeys(value, ['status', 'pageNumber', 'diagnostic']) || !isRecord(value.diagnostic)
      || !exactKeys(value.diagnostic, ['code', 'groupCount'])
      || value.diagnostic.code !== 'NO_APPROVED_PRECEDENCE_SIGNAL'
      || value.diagnostic.groupCount !== ids.length || !admitted || ids.length < 2) {
      issues.push('INVALID_INSUFFICIENCY')
    }
  } else if (!exactKeys(value, ['status', 'pageNumber', 'code'])
    || !['INVALID_INPUT_STRUCTURE', 'INTERNAL_CONSISTENCY_FAILURE', 'RUNTIME_FAILURE'].includes(value.code as string)) {
    issues.push('INVALID_FAILURE')
  }
  return issues
}

export function canSerializeReadingOrder(
  input: SpatialStructureInput, spatial: SpatialStructureResult, result: unknown,
): boolean {
  return isRecord(result) && result.status === 'RESOLVED'
    && readingOrderResultIssues(input, spatial, result).length === 0
}

export function projectReadingOrderDiagnostic(
  input: SpatialStructureInput, spatial: SpatialStructureResult, result: unknown,
): ReadingOrderDiagnostic | null {
  if (readingOrderResultIssues(input, spatial, result).length > 0 || !isRecord(result)) return null
  if (result.status === 'INSUFFICIENT_EVIDENCE') {
    const diagnostic = result.diagnostic as { readonly code: 'NO_APPROVED_PRECEDENCE_SIGNAL'; readonly groupCount: number }
    return { pageNumber: result.pageNumber as number, code: diagnostic.code, groupCount: diagnostic.groupCount }
  }
  if (result.status === 'FAILED') {
    return { pageNumber: result.pageNumber as number, code: result.code as Extract<ReadingOrderV1Result, { status: 'FAILED' }>['code'] }
  }
  return { pageNumber: result.pageNumber as number, code: 'RESOLVED' }
}
