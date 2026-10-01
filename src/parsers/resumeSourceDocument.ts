import {
  canRunLegacyResumeAdapter,
  type PdfPageManifest,
  type PdfSerializedPageEntry,
  type SerializedDocument,
  type SerializedPage,
  type SerializedTextUnit,
} from './pdfSerialization'

export interface ResumeSourceUnit {
  readonly text: string
  readonly provenance: {
    readonly pageNumber: number
    readonly groupId: string
    readonly runId: number
  }
}

export interface ResumeSourcePage {
  readonly pageNumber: number
  readonly units: readonly ResumeSourceUnit[]
}

export interface ResumeSourceDocument {
  readonly sourceKind: 'PDF'
  readonly pages: readonly ResumeSourcePage[]
}

export type ResumeSourceIssue = 'INVALID_MANIFEST' | 'INVALID_SERIALIZED_DOCUMENT'
  | 'INVALID_SERIALIZED_UNIT' | 'DUPLICATE_SERIALIZED_UNIT' | 'INVALID_SOURCE_DOCUMENT'
  | 'INVALID_SOURCE_PAGE' | 'INVALID_SOURCE_UNIT' | 'DUPLICATE_SOURCE_UNIT'
  | 'PAGE_OR_UNIT_COMPLETENESS' | 'UNIT_OR_PROVENANCE_MISMATCH'

export class InvalidSerializedDocument extends Error {
  constructor() {
    super('INVALID_SERIALIZED_DOCUMENT')
  }
}

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
const exact = (value: Record<string, unknown>, keys: readonly string[]) =>
  Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key))
const pageNumber = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) > 0
const runId = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0

export function toResumeSourceDocument(
  manifest: PdfPageManifest, entries: readonly PdfSerializedPageEntry[], serialized: SerializedDocument,
): ResumeSourceDocument {
  try {
    if (!canRunLegacyResumeAdapter(manifest, entries, serialized)) throw new InvalidSerializedDocument()
    return {
      sourceKind: 'PDF',
      pages: serialized.pages.map((page) => ({
        pageNumber: page.pageNumber,
        units: page.orderedUnits.map((unit) => ({
          text: unit.text,
          provenance: { pageNumber: page.pageNumber, groupId: unit.groupId, runId: unit.runId },
        })),
      })),
    }
  } catch {
    throw new InvalidSerializedDocument()
  }
}

export function resumeSourceUnitIssues(value: unknown, expected?: {
  readonly pageNumber: number; readonly unit: SerializedTextUnit
}): readonly ResumeSourceIssue[] {
  try {
    if (!record(value) || !exact(value, ['text', 'provenance']) || typeof value.text !== 'string'
      || !record(value.provenance) || !exact(value.provenance, ['pageNumber', 'groupId', 'runId'])
      || !pageNumber(value.provenance.pageNumber) || typeof value.provenance.groupId !== 'string'
      || !value.provenance.groupId || !runId(value.provenance.runId)) return ['INVALID_SOURCE_UNIT']
    if (expected && (value.text !== expected.unit.text || value.provenance.pageNumber !== expected.pageNumber
      || value.provenance.groupId !== expected.unit.groupId || value.provenance.runId !== expected.unit.runId)) {
      return ['UNIT_OR_PROVENANCE_MISMATCH']
    }
    return []
  } catch {
    return ['INVALID_SOURCE_UNIT']
  }
}

export function resumeSourcePageIssues(value: unknown, expected?: SerializedPage): readonly ResumeSourceIssue[] {
  try {
    if (!record(value) || !exact(value, ['pageNumber', 'units']) || !pageNumber(value.pageNumber)
      || !Array.isArray(value.units)) return ['INVALID_SOURCE_PAGE']
    if (expected && (value.pageNumber !== expected.pageNumber || value.units.length !== expected.orderedUnits.length)) {
      return ['PAGE_OR_UNIT_COMPLETENESS']
    }
    const seen = new Set<number>()
    for (let index = 0; index < value.units.length; index += 1) {
      const unit = value.units[index]
      const sourceUnit = expected?.orderedUnits[index]
      const issues = resumeSourceUnitIssues(unit, sourceUnit ? { pageNumber: value.pageNumber, unit: sourceUnit } : undefined)
      if (issues.length) return issues
      const provenance = (unit as ResumeSourceUnit).provenance
      if (provenance.pageNumber !== value.pageNumber) return ['UNIT_OR_PROVENANCE_MISMATCH']
      if (seen.has(provenance.runId)) return ['DUPLICATE_SOURCE_UNIT']
      seen.add(provenance.runId)
    }
    return []
  } catch {
    return ['INVALID_SOURCE_PAGE']
  }
}

// Correspondence validation supports multi-unit data shapes; it is not a second Serialization admission policy.
export function resumeSourceDocumentIssues(
  manifest: PdfPageManifest, serialized: unknown, candidate: unknown,
): readonly ResumeSourceIssue[] {
  try {
    if (!record(manifest) || !exact(manifest, ['pageCount', 'canonicalPageNumbers'])
      || !pageNumber(manifest.pageCount) || !Array.isArray(manifest.canonicalPageNumbers)
      || manifest.canonicalPageNumbers.length !== manifest.pageCount
      || manifest.canonicalPageNumbers.some((value, index) => value !== index + 1)) return ['INVALID_MANIFEST']
    if (!record(serialized) || !exact(serialized, ['pages']) || !Array.isArray(serialized.pages)
      || serialized.pages.length !== manifest.pageCount) return ['INVALID_SERIALIZED_DOCUMENT']
    if (!record(candidate) || !exact(candidate, ['sourceKind', 'pages']) || candidate.sourceKind !== 'PDF'
      || !Array.isArray(candidate.pages) || candidate.pages.length !== manifest.pageCount) return ['INVALID_SOURCE_DOCUMENT']

    for (let pageIndex = 0; pageIndex < manifest.pageCount; pageIndex += 1) {
      const sourcePage = serialized.pages[pageIndex]
      const outputPage = candidate.pages[pageIndex]
      const expectedNumber = manifest.canonicalPageNumbers[pageIndex]
      if (!record(sourcePage) || !exact(sourcePage, ['pageNumber', 'orderedUnits'])
        || sourcePage.pageNumber !== expectedNumber || !Array.isArray(sourcePage.orderedUnits)) {
        return ['PAGE_OR_UNIT_COMPLETENESS']
      }
      const seen = new Set<number>()
      for (const unit of sourcePage.orderedUnits) {
        if (!record(unit) || !exact(unit, ['groupId', 'runId', 'text']) || typeof unit.groupId !== 'string'
          || !unit.groupId || !runId(unit.runId) || typeof unit.text !== 'string') return ['INVALID_SERIALIZED_UNIT']
        if (seen.has(unit.runId)) return ['DUPLICATE_SERIALIZED_UNIT']
        seen.add(unit.runId)
      }
      const issues = resumeSourcePageIssues(outputPage, sourcePage as unknown as SerializedPage)
      if (issues.length) return issues
    }
    return []
  } catch {
    return ['INVALID_SOURCE_DOCUMENT']
  }
}

export type ResumeSourceDiagnostic =
  | { readonly code: 'INVALID_SOURCE_DOCUMENT' }
  | { readonly code: 'SOURCE_DOCUMENT_VALID'; readonly pageCount: number; readonly unitCount: number }

export function projectSourceDocumentDiagnostic(
  manifest: PdfPageManifest, serialized: unknown, candidate: unknown,
): ResumeSourceDiagnostic {
  try {
    if (resumeSourceDocumentIssues(manifest, serialized, candidate).length || !record(candidate)
      || !Array.isArray(candidate.pages)) return { code: 'INVALID_SOURCE_DOCUMENT' }
    return {
      code: 'SOURCE_DOCUMENT_VALID', pageCount: candidate.pages.length,
      unitCount: candidate.pages.reduce((sum: number, page: ResumeSourcePage) => sum + page.units.length, 0),
    }
  } catch {
    return { code: 'INVALID_SOURCE_DOCUMENT' }
  }
}
