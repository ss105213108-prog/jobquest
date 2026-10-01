import { canSerializeReadingOrder, type ReadingOrderV1Result } from './pdfReadingOrder'
import type { SpatialStructureInput, SpatialStructureResult } from './pdfSpatialStructureGraph'

export interface SerializedTextUnit {
  readonly groupId: string
  readonly runId: number
  readonly text: string
}

export interface SerializedPage {
  readonly pageNumber: number
  readonly orderedUnits: readonly SerializedTextUnit[]
}

export interface SerializedDocument {
  readonly pages: readonly SerializedPage[]
}

export type PdfSerializationResult =
  | { readonly status: 'RESOLVED'; readonly pageNumber: number; readonly page: SerializedPage }
  | { readonly status: 'INSUFFICIENT_EVIDENCE'; readonly pageNumber: number; readonly diagnostic: {
      readonly code: 'INTERNAL_ORDER_UNPROVEN'; readonly groupCount: number; readonly runCount: number
    } }
  | { readonly status: 'FAILED'; readonly pageNumber: number; readonly code: 'INVALID_INPUT_STRUCTURE' | 'RUNTIME_FAILURE' }

export interface PdfSerializationInput {
  readonly input: SpatialStructureInput
  readonly spatial: SpatialStructureResult
  readonly order: ReadingOrderV1Result
}

export interface PdfPageManifest {
  readonly pageCount: number
  readonly canonicalPageNumbers: readonly number[]
}

export interface PdfSerializedPageEntry {
  readonly source: PdfSerializationInput
  readonly result: PdfSerializationResult
}

export type PdfSerializationDiagnostic =
  | { readonly pageNumber: number; readonly code: 'RESOLVED'; readonly unitCount: 1 }
  | { readonly pageNumber: number; readonly code: 'INTERNAL_ORDER_UNPROVEN'; readonly groupCount: 1; readonly runCount: number }
  | { readonly pageNumber: number; readonly code: 'INVALID_INPUT_STRUCTURE' | 'RUNTIME_FAILURE' }

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
const exact = (value: Record<string, unknown>, keys: readonly string[]) =>
  Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key))
const positivePage = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) > 0
const validRunId = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0
const failed = (pageNumber: number): PdfSerializationResult => ({ status: 'FAILED', pageNumber, code: 'INVALID_INPUT_STRUCTURE' })

function sourcePage(source: PdfSerializationInput): number {
  try {
    const input = record(source) ? source.input : undefined
    const evidence = record(input) ? input.evidence : undefined
    return record(evidence) && positivePage(evidence.pageNumber) ? evidence.pageNumber : 0
  } catch {
    return 0
  }
}

export function serializePageV1(source: PdfSerializationInput): PdfSerializationResult | null {
  const pageNumber = sourcePage(source)
  try {
    if (!record(source) || !record(source.order) || !positivePage(source.order.pageNumber)) return failed(pageNumber)
    const { input, spatial, order } = source
    if (order.status === 'INSUFFICIENT_EVIDENCE' || order.status === 'FAILED') return null
    if (!canSerializeReadingOrder(input, spatial, order) || input.visualGroups.status !== 'RESOLVED'
      || input.evidence.status !== 'AVAILABLE') return failed(pageNumber)
    const groupId = order.sequence[0]
    const group = input.visualGroups.groups.find((item) => item.groupId === groupId)
    if (!group || input.visualGroups.groups.length !== 1 || !Array.isArray(group.runIds)
      || group.runIds.length === 0) return failed(pageNumber)
    const runs = group.runIds.map((runId) => input.evidence.status === 'AVAILABLE'
      ? input.evidence.graph.runs.find((run) => run.originalIndex === runId) : undefined)
    if (runs.some((run) => !run || typeof run.text !== 'string')) return failed(pageNumber)
    if (runs.length > 1) return { status: 'INSUFFICIENT_EVIDENCE', pageNumber,
      diagnostic: { code: 'INTERNAL_ORDER_UNPROVEN', groupCount: 1, runCount: runs.length } }
    const run = runs[0]
    if (!run) return failed(pageNumber)
    return { status: 'RESOLVED', pageNumber,
      page: { pageNumber, orderedUnits: [{ groupId, runId: run.originalIndex, text: run.text }] } }
  } catch {
    return { status: 'FAILED', pageNumber, code: 'RUNTIME_FAILURE' }
  }
}

export function serializedTextUnitIssues(source: PdfSerializationInput, value: unknown): readonly string[] {
  if (!record(value) || !exact(value, ['groupId', 'runId', 'text']) || typeof value.groupId !== 'string'
    || !value.groupId || !validRunId(value.runId) || typeof value.text !== 'string') return ['INVALID_UNIT']
  try {
    const input = source.input
    if (input.visualGroups.status !== 'RESOLVED' || input.evidence.status !== 'AVAILABLE') return ['INVALID_SOURCE']
    const group = input.visualGroups.groups.find((item) => item.groupId === value.groupId)
    const run = input.evidence.graph.runs.find((item) => item.originalIndex === value.runId)
    return group?.runIds.includes(value.runId) && run && run.text === value.text ? [] : ['SOURCE_REFERENCE_MISMATCH']
  } catch {
    return ['INVALID_SOURCE']
  }
}

export function serializedPageIssues(source: PdfSerializationInput, value: unknown): readonly string[] {
  if (!record(value) || !exact(value, ['pageNumber', 'orderedUnits'])
    || !positivePage(value.pageNumber) || !Array.isArray(value.orderedUnits)
    || value.orderedUnits.length !== 1) return ['INVALID_PAGE']
  try {
    const expected = serializePageV1(source)
    if (!expected || expected.status !== 'RESOLVED') return ['SOURCE_NOT_SERIALIZABLE']
    if (source.order.status !== 'RESOLVED' || !canSerializeReadingOrder(source.input, source.spatial, source.order)
      || value.pageNumber !== sourcePage(source)) return ['PAGE_OR_SOURCE_MISMATCH']
    const unit = value.orderedUnits[0]
    if (!record(unit) || unit.groupId !== source.order.sequence[0]) return ['GROUP_REFERENCE_MISMATCH']
    const issues = serializedTextUnitIssues(source, unit)
    if (issues.length) return issues
    return unit.runId === expected.page.orderedUnits[0]?.runId ? [] : ['RUN_REFERENCE_MISMATCH']
  } catch {
    return ['PAGE_OR_SOURCE_MISMATCH']
  }
}

export function serializationResultIssues(source: PdfSerializationInput, value: unknown): readonly string[] {
  if (!record(value) || !positivePage(value.pageNumber)) return ['INVALID_RESULT']
  const expected = serializePageV1(source)
  if (!expected) return ['UPSTREAM_NOT_RESOLVED']
  if (value.pageNumber !== expected.pageNumber || value.status !== expected.status) return ['STATE_OR_PAGE_MISMATCH']
  if (expected.status === 'RESOLVED') {
    if (!exact(value, ['status', 'pageNumber', 'page'])) return ['INVALID_RESULT']
    const issues = serializedPageIssues(source, value.page)
    if (issues.length) return issues
    const page = value.page as SerializedPage
    return page.orderedUnits[0]?.runId === expected.page.orderedUnits[0]?.runId ? [] : ['RUN_REFERENCE_MISMATCH']
  }
  if (expected.status === 'INSUFFICIENT_EVIDENCE') {
    return exact(value, ['status', 'pageNumber', 'diagnostic']) && record(value.diagnostic)
      && exact(value.diagnostic, ['code', 'groupCount', 'runCount'])
      && value.diagnostic.code === expected.diagnostic.code
      && value.diagnostic.groupCount === expected.diagnostic.groupCount
      && value.diagnostic.runCount === expected.diagnostic.runCount ? [] : ['INVALID_INSUFFICIENCY']
  }
  return exact(value, ['status', 'pageNumber', 'code']) && value.code === expected.code ? [] : ['INVALID_FAILURE']
}

export function projectSerializationDiagnostic(
  source: PdfSerializationInput, value: unknown,
): PdfSerializationDiagnostic | null {
  if (serializationResultIssues(source, value).length || !record(value)) return null
  if (value.status === 'RESOLVED') return { pageNumber: value.pageNumber as number, code: 'RESOLVED', unitCount: 1 }
  if (value.status === 'INSUFFICIENT_EVIDENCE' && record(value.diagnostic)) return {
    pageNumber: value.pageNumber as number, code: 'INTERNAL_ORDER_UNPROVEN', groupCount: 1,
    runCount: value.diagnostic.runCount as number,
  }
  return { pageNumber: value.pageNumber as number, code: value.code as 'INVALID_INPUT_STRUCTURE' | 'RUNTIME_FAILURE' }
}

function validManifest(value: unknown): value is PdfPageManifest {
  if (!record(value) || !exact(value, ['pageCount', 'canonicalPageNumbers'])
    || !positivePage(value.pageCount) || !Array.isArray(value.canonicalPageNumbers)
    || value.canonicalPageNumbers.length !== value.pageCount) return false
  return value.canonicalPageNumbers.every((page, index) => page === index + 1)
}

export function composeSerializedDocument(
  manifest: PdfPageManifest, entries: readonly PdfSerializedPageEntry[],
): SerializedDocument | null {
  if (!validManifest(manifest) || !Array.isArray(entries) || entries.length !== manifest.pageCount) return null
  const pages: SerializedPage[] = []
  for (const entry of entries) {
    if (!record(entry) || !exact(entry, ['source', 'result']) || !record(entry.result)
      || entry.result.status !== 'RESOLVED') return null
    const admitted = entry as unknown as PdfSerializedPageEntry
    if (serializationResultIssues(admitted.source, admitted.result).length) return null
    pages.push((admitted.result as Extract<PdfSerializationResult, { status: 'RESOLVED' }>).page)
  }
  const byPage = new Map(pages.map((page) => [page.pageNumber, page]))
  if (byPage.size !== manifest.pageCount
    || manifest.canonicalPageNumbers.some((page) => !byPage.has(page))) return null
  return { pages: manifest.canonicalPageNumbers.map((page) => {
    const source = byPage.get(page)
    if (!source) throw new Error('Validated page missing')
    return { pageNumber: source.pageNumber, orderedUnits: source.orderedUnits.map((unit) => ({ ...unit })) }
  }) }
}

export function serializedDocumentIssues(
  manifest: PdfPageManifest, entries: readonly PdfSerializedPageEntry[], value: unknown,
): readonly string[] {
  const expected = composeSerializedDocument(manifest, entries)
  if (!expected || !record(value) || !exact(value, ['pages']) || !Array.isArray(value.pages)
    || value.pages.length !== expected.pages.length) return ['INVALID_DOCUMENT']
  for (let index = 0; index < expected.pages.length; index += 1) {
    const page = value.pages[index]
    const entry = entries.find((item) => item.result.pageNumber === expected.pages[index]?.pageNumber)
    if (!entry || serializedPageIssues(entry.source, page).length
      || page.pageNumber !== expected.pages[index]?.pageNumber) return ['INVALID_DOCUMENT_PAGE']
  }
  return []
}

export function canRunLegacyResumeAdapter(source: PdfSerializationInput, result: unknown): boolean
export function canRunLegacyResumeAdapter(manifest: PdfPageManifest,
  entries: readonly PdfSerializedPageEntry[], document: unknown): boolean
export function canRunLegacyResumeAdapter(
  first: PdfSerializationInput | PdfPageManifest, second: unknown, third?: unknown,
): boolean {
  if (third !== undefined) {
    return serializedDocumentIssues(first as PdfPageManifest, second as readonly PdfSerializedPageEntry[], third).length === 0
  }
  return record(second) && second.status === 'RESOLVED'
    && serializationResultIssues(first as PdfSerializationInput, second).length === 0
}
