// Internal cause and validity foundation. Parser call sites are intentionally separate.
import { readingOrderResultIssues, type ReadingOrderV1Result } from './pdfReadingOrder'
import { serializationResultIssues, type PdfSerializationInput, type PdfSerializationResult } from './pdfSerialization'
import type { SpatialStructureInput, SpatialStructureResult } from './pdfSpatialStructureGraph'

export type ValidityScope = 'FILE' | 'DOCUMENT' | 'PAGE' | 'CONTENT'
export type ValidityState = 'CONFIRMED_VALID' | 'CONFIRMED_INVALID' | 'UNKNOWN'
export type ValidityPredicate = 'ADMISSION_ACCEPTED' | 'CONTAINER_PARSEABLE' | 'PAGE_STRUCTURE_VALID'
  | 'SUBSTANTIVE_CONTENT_PRESENT' | 'CONTENT_INSPECTION_COMPLETE'
  | 'VISUAL_CONTENT_PRESENT' | 'NO_USABLE_TEXT_LAYER'

export interface ValidityClaim {
  readonly scope: ValidityScope
  readonly predicate: ValidityPredicate
  readonly state: ValidityState
  readonly pageNumber?: number
}

export type PdfCauseCode =
  | 'FILE_ADMISSION_REJECTED' | 'PDF_READ_FAILED' | 'PDF_LOAD_FAILED' | 'PDF_PAGE_LOAD_FAILED'
  | 'PDF_TEXT_EXTRACTION_FAILED' | 'PDF_GEOMETRY_INVALID' | 'PDF_GEOMETRY_UNSUPPORTED'
  | 'PDF_RECONSTRUCTION_FAILED' | 'PDF_CONTENT_INSUFFICIENT_OR_UNKNOWN'
  | 'PDF_LAYOUT_EVIDENCE_UNAVAILABLE' | 'PDF_LAYOUT_EVIDENCE_FAILED'
  | 'PDF_VISUAL_GROUP_INSUFFICIENT' | 'PDF_VISUAL_GROUP_FAILED' | 'PDF_VISUAL_GROUP_RESOLVED'
  | 'PDF_READING_ORDER_INSUFFICIENT' | 'PDF_READING_ORDER_FAILED'
  | 'PDF_SERIALIZATION_INSUFFICIENT' | 'PDF_SERIALIZATION_FAILED'
  | 'PDF_DOMAIN_ANALYSIS_FAILED' | 'PDF_CLEANUP_FAILED'

export type DocxCauseCode =
  | 'FILE_ADMISSION_REJECTED' | 'DOCX_READ_FAILED' | 'DOCX_CONVERSION_FAILED'
  | 'DOCX_VALID_BUT_UNSUPPORTED' | 'DOCX_CONTENT_INSUFFICIENT_OR_UNKNOWN'
  | 'DOCX_DOMAIN_ANALYSIS_FAILED' | 'DOCX_WARNING_ONLY'

export type CauseRecord =
  | { readonly format: 'pdf'; readonly code: PdfCauseCode; readonly pageNumber?: number; readonly finding?: 'LOW_TEXT_UNKNOWN' | 'INCOMPLETE_EXTRACTION_UNKNOWN' | 'PROVEN_BLANK' | 'PROVEN_IMAGE_ONLY'; readonly failureCategory?: 'CORRUPT_DOCUMENT' | 'RUNTIME_FAILURE' | 'UNCLASSIFIED'; readonly internalCode?: 'INSUFFICIENT_CALIBRATION'; readonly counts?: Readonly<Record<string, number>> }
  | { readonly format: 'docx'; readonly code: DocxCauseCode; readonly finding?: 'LOW_TEXT_UNKNOWN' | 'PROVEN_BLANK'; readonly failureCategory?: 'CORRUPT_DOCUMENT' | 'RUNTIME_FAILURE' | 'UNCLASSIFIED'; readonly counts?: Readonly<Record<string, number>> }

export type ReadingOrderCause =
  | { readonly format: 'pdf'; readonly code: 'PDF_READING_ORDER_INSUFFICIENT'; readonly pageNumber: number }
  | { readonly format: 'pdf'; readonly code: 'PDF_READING_ORDER_FAILED'; readonly pageNumber: number }

export type SerializationCause =
  | { readonly format: 'pdf'; readonly code: 'PDF_SERIALIZATION_INSUFFICIENT'; readonly pageNumber: number }
  | { readonly format: 'pdf'; readonly code: 'PDF_SERIALIZATION_FAILED'; readonly pageNumber: number }

export function causeForSerialization(source: PdfSerializationInput, result: PdfSerializationResult): SerializationCause | null {
  if (serializationResultIssues(source, result).length) throw new Error('Invalid Serialization result')
  if (result.status === 'RESOLVED') return null
  if (!Number.isSafeInteger(result.pageNumber) || result.pageNumber <= 0) {
    throw new Error('Invalid page-scoped Serialization result')
  }
  return { format: 'pdf', pageNumber: result.pageNumber,
    code: result.status === 'INSUFFICIENT_EVIDENCE' ? 'PDF_SERIALIZATION_INSUFFICIENT' : 'PDF_SERIALIZATION_FAILED' }
}

export function causeForReadingOrder(
  input: SpatialStructureInput, spatial: SpatialStructureResult, result: ReadingOrderV1Result,
): ReadingOrderCause | null {
  if (readingOrderResultIssues(input, spatial, result).length > 0) throw new Error('Invalid Reading Order result')
  if (result.status === 'RESOLVED') return null
  return { format: 'pdf', code: result.status === 'INSUFFICIENT_EVIDENCE'
    ? 'PDF_READING_ORDER_INSUFFICIENT' : 'PDF_READING_ORDER_FAILED', pageNumber: result.pageNumber }
}

export type RoutingClassification =
  | { readonly status: 'STAGE_SUCCESS'; readonly cause: CauseRecord['code'] }
  | { readonly status: 'FALLBACK_ELIGIBLE'; readonly reason: 'INSUFFICIENT_STRUCTURE' | 'UNSUPPORTED_VALID_REPRESENTATION' | 'NO_USABLE_TEXT'; readonly cause: CauseRecord['code'] }
  | { readonly status: 'HARD_FAILURE'; readonly reason: 'INPUT_REJECTED' | 'DOCUMENT_UNREADABLE' | 'PARSER_FAILURE'; readonly cause: CauseRecord['code'] }
  | { readonly status: 'CLASSIFICATION_REQUIRED'; readonly need: 'NEEDS_VALIDITY_CLASSIFIER' | 'NEEDS_CAUSE_SPLIT'; readonly cause: CauseRecord['code'] }
  | { readonly status: 'NEEDS_FOCUSED_INVESTIGATION'; readonly cause: CauseRecord['code'] }

export type LegacyCode = 'SCANNED_PDF' | 'PARSE_FAILED'
export type LegacyProjectionObservation = 'LOW_TEXT_PDF' | 'GENERIC_PARSE_FAILURE'
export type ClassificationInput = {
  readonly cause: CauseRecord
  readonly validity: readonly ValidityClaim[]
  readonly implementation: 'NORMAL' | 'FAILED'
  readonly alternatePath: 'APPROVED' | 'UNAPPROVED' | 'UNKNOWN'
}

const pdfCodes = new Set<PdfCauseCode>([
  'FILE_ADMISSION_REJECTED', 'PDF_READ_FAILED', 'PDF_LOAD_FAILED', 'PDF_PAGE_LOAD_FAILED',
  'PDF_TEXT_EXTRACTION_FAILED', 'PDF_GEOMETRY_INVALID', 'PDF_GEOMETRY_UNSUPPORTED',
  'PDF_RECONSTRUCTION_FAILED', 'PDF_CONTENT_INSUFFICIENT_OR_UNKNOWN',
  'PDF_LAYOUT_EVIDENCE_UNAVAILABLE', 'PDF_LAYOUT_EVIDENCE_FAILED',
  'PDF_VISUAL_GROUP_INSUFFICIENT', 'PDF_VISUAL_GROUP_FAILED', 'PDF_VISUAL_GROUP_RESOLVED',
  'PDF_READING_ORDER_INSUFFICIENT', 'PDF_READING_ORDER_FAILED',
  'PDF_SERIALIZATION_INSUFFICIENT', 'PDF_SERIALIZATION_FAILED',
  'PDF_DOMAIN_ANALYSIS_FAILED', 'PDF_CLEANUP_FAILED',
])
const docxCodes = new Set<DocxCauseCode>([
  'FILE_ADMISSION_REJECTED', 'DOCX_READ_FAILED', 'DOCX_CONVERSION_FAILED',
  'DOCX_VALID_BUT_UNSUPPORTED', 'DOCX_CONTENT_INSUFFICIENT_OR_UNKNOWN',
  'DOCX_DOMAIN_ANALYSIS_FAILED', 'DOCX_WARNING_ONLY',
])
const documentLevelPdfCodes = new Set<PdfCauseCode>([
  'FILE_ADMISSION_REJECTED', 'PDF_READ_FAILED', 'PDF_LOAD_FAILED', 'PDF_DOMAIN_ANALYSIS_FAILED',
])
const scopes = new Set<ValidityScope>(['FILE', 'DOCUMENT', 'PAGE', 'CONTENT'])
const states = new Set<ValidityState>(['CONFIRMED_VALID', 'CONFIRMED_INVALID', 'UNKNOWN'])
const predicates: Record<ValidityPredicate, ValidityScope> = {
  ADMISSION_ACCEPTED: 'FILE', CONTAINER_PARSEABLE: 'DOCUMENT', PAGE_STRUCTURE_VALID: 'PAGE',
  SUBSTANTIVE_CONTENT_PRESENT: 'CONTENT', CONTENT_INSPECTION_COMPLETE: 'CONTENT',
  VISUAL_CONTENT_PRESENT: 'CONTENT', NO_USABLE_TEXT_LAYER: 'CONTENT',
}
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const allowedKeys = (value: Record<string, unknown>, keys: readonly string[]) => Object.keys(value).every((key) => keys.includes(key))
const isPage = (value: unknown) => Number.isSafeInteger(value) && (value as number) > 0

export function validateCause(value: unknown): value is CauseRecord {
  if (!isRecord(value) || !allowedKeys(value, ['format', 'code', 'pageNumber', 'finding', 'failureCategory', 'internalCode', 'counts'])) return false
  if (value.format === 'pdf') {
    if (!pdfCodes.has(value.code as PdfCauseCode) || (value.pageNumber !== undefined && !isPage(value.pageNumber))) return false
    if (documentLevelPdfCodes.has(value.code as PdfCauseCode) && value.pageNumber !== undefined) return false
    if (!documentLevelPdfCodes.has(value.code as PdfCauseCode) && value.code !== 'PDF_CLEANUP_FAILED'
      && !isPage(value.pageNumber)) return false
  } else if (value.format === 'docx') {
    if (!docxCodes.has(value.code as DocxCauseCode) || value.pageNumber !== undefined || value.finding === 'PROVEN_IMAGE_ONLY') return false
  } else return false
  if (value.finding !== undefined && !['LOW_TEXT_UNKNOWN', 'INCOMPLETE_EXTRACTION_UNKNOWN', 'PROVEN_BLANK', 'PROVEN_IMAGE_ONLY'].includes(value.finding as string)) return false
  if (value.finding !== undefined && !['PDF_CONTENT_INSUFFICIENT_OR_UNKNOWN', 'DOCX_CONTENT_INSUFFICIENT_OR_UNKNOWN'].includes(value.code as string)) return false
  if (value.format === 'docx' && value.finding === 'INCOMPLETE_EXTRACTION_UNKNOWN') return false
  if (value.failureCategory !== undefined && !['CORRUPT_DOCUMENT', 'RUNTIME_FAILURE', 'UNCLASSIFIED'].includes(value.failureCategory as string)) return false
  if (value.failureCategory !== undefined && !['PDF_LOAD_FAILED', 'DOCX_CONVERSION_FAILED'].includes(value.code as string)) return false
  if (value.internalCode !== undefined && !(value.code === 'PDF_LAYOUT_EVIDENCE_UNAVAILABLE' && value.internalCode === 'INSUFFICIENT_CALIBRATION')) return false
  if (value.counts !== undefined && (!isRecord(value.counts) || Object.values(value.counts).some((count) => !Number.isSafeInteger(count) || (count as number) < 0))) return false
  return true
}

export function validateValidity(claims: unknown): claims is readonly ValidityClaim[] {
  if (!Array.isArray(claims)) return false
  const seen = new Set<string>()
  for (const claim of claims) {
    if (!isRecord(claim) || !allowedKeys(claim, ['scope', 'predicate', 'state', 'pageNumber'])
      || !scopes.has(claim.scope as ValidityScope) || !states.has(claim.state as ValidityState)
      || predicates[claim.predicate as ValidityPredicate] !== claim.scope
      || (claim.scope === 'PAGE' && !isPage(claim.pageNumber))
      || (claim.scope !== 'PAGE' && claim.pageNumber !== undefined)) return false
    const key = `${claim.scope}:${claim.predicate}:${claim.pageNumber ?? 0}`
    if (seen.has(key)) return false
    seen.add(key)
  }
  return true
}

export function validateClassification(value: unknown): value is RoutingClassification {
  if (!isRecord(value) || !pdfCodes.has(value.cause as PdfCauseCode) && !docxCodes.has(value.cause as DocxCauseCode)) return false
  switch (value.status) {
    case 'STAGE_SUCCESS':
    case 'NEEDS_FOCUSED_INVESTIGATION':
      return allowedKeys(value, ['status', 'cause'])
    case 'FALLBACK_ELIGIBLE':
      return allowedKeys(value, ['status', 'cause', 'reason'])
        && ['INSUFFICIENT_STRUCTURE', 'UNSUPPORTED_VALID_REPRESENTATION', 'NO_USABLE_TEXT'].includes(value.reason as string)
    case 'HARD_FAILURE':
      return allowedKeys(value, ['status', 'cause', 'reason'])
        && ['INPUT_REJECTED', 'DOCUMENT_UNREADABLE', 'PARSER_FAILURE'].includes(value.reason as string)
    case 'CLASSIFICATION_REQUIRED':
      return allowedKeys(value, ['status', 'cause', 'need'])
        && ['NEEDS_VALIDITY_CLASSIFIER', 'NEEDS_CAUSE_SPLIT'].includes(value.need as string)
    default:
      return false
  }
}

const stateOf = (claims: readonly ValidityClaim[], predicate: ValidityPredicate, pageNumber?: number): ValidityState => (
  claims.find((claim) => claim.predicate === predicate && claim.pageNumber === pageNumber)?.state ?? 'UNKNOWN'
)
const pdfRequirements = (claims: readonly ValidityClaim[], pageNumber: number) => [
  stateOf(claims, 'ADMISSION_ACCEPTED'), stateOf(claims, 'CONTAINER_PARSEABLE'),
  stateOf(claims, 'PAGE_STRUCTURE_VALID', pageNumber), stateOf(claims, 'SUBSTANTIVE_CONTENT_PRESENT'),
]
const docxRequirements = (claims: readonly ValidityClaim[]) => [
  stateOf(claims, 'ADMISSION_ACCEPTED'), stateOf(claims, 'CONTAINER_PARSEABLE'),
  stateOf(claims, 'SUBSTANTIVE_CONTENT_PRESENT'),
]
const verified = (statesToCheck: readonly ValidityState[]) => statesToCheck.every((state) => state === 'CONFIRMED_VALID')
const invalid = (statesToCheck: readonly ValidityState[]) => statesToCheck.includes('CONFIRMED_INVALID')

export function classifyCause(input: ClassificationInput): RoutingClassification {
  const { cause, validity } = input
  if (!validateCause(cause) || !validateValidity(validity)
    || !['NORMAL', 'FAILED'].includes(input.implementation)
    || !['APPROVED', 'UNAPPROVED', 'UNKNOWN'].includes(input.alternatePath)) {
    throw new Error('Invalid classification input')
  }
  const hard = (reason: Extract<RoutingClassification, { status: 'HARD_FAILURE' }>['reason']): RoutingClassification => ({ status: 'HARD_FAILURE', reason, cause: cause.code })
  const fallback = (reason: Extract<RoutingClassification, { status: 'FALLBACK_ELIGIBLE' }>['reason']): RoutingClassification => ({ status: 'FALLBACK_ELIGIBLE', reason, cause: cause.code })
  const gate = (need: 'NEEDS_VALIDITY_CLASSIFIER' | 'NEEDS_CAUSE_SPLIT'): RoutingClassification => ({ status: 'CLASSIFICATION_REQUIRED', need, cause: cause.code })
  if (cause.code === 'PDF_CLEANUP_FAILED') return { status: 'NEEDS_FOCUSED_INVESTIGATION', cause: cause.code }
  if (cause.code === 'FILE_ADMISSION_REJECTED') return hard('INPUT_REJECTED')
  if (['PDF_READ_FAILED', 'PDF_PAGE_LOAD_FAILED', 'PDF_TEXT_EXTRACTION_FAILED', 'DOCX_READ_FAILED'].includes(cause.code)) return hard('DOCUMENT_UNREADABLE')
  if (['PDF_GEOMETRY_INVALID'].includes(cause.code)) return hard('DOCUMENT_UNREADABLE')
  if (['PDF_RECONSTRUCTION_FAILED', 'PDF_LAYOUT_EVIDENCE_FAILED', 'PDF_VISUAL_GROUP_FAILED', 'PDF_READING_ORDER_FAILED', 'PDF_SERIALIZATION_FAILED', 'PDF_DOMAIN_ANALYSIS_FAILED', 'DOCX_DOMAIN_ANALYSIS_FAILED'].includes(cause.code)) return hard('PARSER_FAILURE')
  if (cause.code === 'PDF_LOAD_FAILED' || cause.code === 'DOCX_CONVERSION_FAILED') {
    if (!cause.failureCategory || cause.failureCategory === 'UNCLASSIFIED') return gate('NEEDS_CAUSE_SPLIT')
    return hard(cause.failureCategory === 'CORRUPT_DOCUMENT' ? 'DOCUMENT_UNREADABLE' : 'PARSER_FAILURE')
  }
  if (cause.code === 'PDF_VISUAL_GROUP_RESOLVED' || cause.code === 'DOCX_WARNING_ONLY') return { status: 'STAGE_SUCCESS', cause: cause.code }
  if (cause.code === 'PDF_LAYOUT_EVIDENCE_UNAVAILABLE' && cause.internalCode !== 'INSUFFICIENT_CALIBRATION') {
    return gate('NEEDS_CAUSE_SPLIT')
  }
  if (['PDF_READING_ORDER_INSUFFICIENT', 'PDF_SERIALIZATION_INSUFFICIENT'].includes(cause.code)
    && input.implementation !== 'NORMAL') {
    return gate('NEEDS_CAUSE_SPLIT')
  }

  if (cause.code === 'PDF_CONTENT_INSUFFICIENT_OR_UNKNOWN' || cause.code === 'DOCX_CONTENT_INSUFFICIENT_OR_UNKNOWN') {
    if (cause.finding === 'PROVEN_BLANK') {
      const base = cause.format === 'pdf'
        ? pdfRequirements(validity, cause.pageNumber ?? 1).slice(0, 3)
        : docxRequirements(validity).slice(0, 2)
      const proof = [...base, stateOf(validity, 'CONTENT_INSPECTION_COMPLETE')]
      if (verified(proof) && input.implementation === 'NORMAL'
        && stateOf(validity, 'SUBSTANTIVE_CONTENT_PRESENT') === 'CONFIRMED_INVALID'
        && (cause.format !== 'pdf' || stateOf(validity, 'VISUAL_CONTENT_PRESENT') === 'CONFIRMED_INVALID')) return hard('INPUT_REJECTED')
    }
    if (cause.format === 'pdf' && cause.finding === 'PROVEN_IMAGE_ONLY') {
      const base = pdfRequirements(validity, cause.pageNumber ?? 1).slice(0, 3)
      const proof = [...base, stateOf(validity, 'CONTENT_INSPECTION_COMPLETE'),
        stateOf(validity, 'VISUAL_CONTENT_PRESENT'), stateOf(validity, 'NO_USABLE_TEXT_LAYER')]
      if (verified(proof) && input.implementation === 'NORMAL' && input.alternatePath === 'APPROVED') return fallback('NO_USABLE_TEXT')
    }
    return gate('NEEDS_VALIDITY_CLASSIFIER')
  }

  const required = cause.format === 'pdf' ? pdfRequirements(validity, cause.pageNumber ?? 1) : docxRequirements(validity)
  if (invalid(required)) return hard('DOCUMENT_UNREADABLE')
  if (!verified(required) || input.implementation !== 'NORMAL') return gate('NEEDS_VALIDITY_CLASSIFIER')
  if (['PDF_GEOMETRY_UNSUPPORTED', 'DOCX_VALID_BUT_UNSUPPORTED'].includes(cause.code)) {
    return input.alternatePath === 'APPROVED' ? fallback('UNSUPPORTED_VALID_REPRESENTATION') : gate('NEEDS_VALIDITY_CLASSIFIER')
  }
  if (['PDF_LAYOUT_EVIDENCE_UNAVAILABLE', 'PDF_VISUAL_GROUP_INSUFFICIENT', 'PDF_READING_ORDER_INSUFFICIENT', 'PDF_SERIALIZATION_INSUFFICIENT'].includes(cause.code)) {
    return fallback('INSUFFICIENT_STRUCTURE')
  }
  throw new Error('Unclassified test cause')
}

const stageByCause: Record<PdfCauseCode | DocxCauseCode, string> = {
  FILE_ADMISSION_REJECTED: 'file-admission', PDF_READ_FAILED: 'read', PDF_LOAD_FAILED: 'document-load',
  PDF_PAGE_LOAD_FAILED: 'page-load', PDF_TEXT_EXTRACTION_FAILED: 'extraction', PDF_GEOMETRY_INVALID: 'geometry',
  PDF_GEOMETRY_UNSUPPORTED: 'geometry', PDF_RECONSTRUCTION_FAILED: 'reconstruction',
  PDF_CONTENT_INSUFFICIENT_OR_UNKNOWN: 'extraction', PDF_LAYOUT_EVIDENCE_UNAVAILABLE: 'layout',
  PDF_LAYOUT_EVIDENCE_FAILED: 'layout', PDF_VISUAL_GROUP_INSUFFICIENT: 'visual-group',
  PDF_VISUAL_GROUP_FAILED: 'visual-group', PDF_VISUAL_GROUP_RESOLVED: 'visual-group',
  PDF_READING_ORDER_INSUFFICIENT: 'reading-order', PDF_READING_ORDER_FAILED: 'reading-order',
  PDF_SERIALIZATION_INSUFFICIENT: 'serialization', PDF_SERIALIZATION_FAILED: 'serialization',
  PDF_DOMAIN_ANALYSIS_FAILED: 'domain-analysis', PDF_CLEANUP_FAILED: 'cleanup',
  DOCX_READ_FAILED: 'read', DOCX_CONVERSION_FAILED: 'conversion', DOCX_VALID_BUT_UNSUPPORTED: 'conversion',
  DOCX_CONTENT_INSUFFICIENT_OR_UNKNOWN: 'conversion', DOCX_DOMAIN_ANALYSIS_FAILED: 'domain-analysis',
  DOCX_WARNING_ONLY: 'conversion',
}
const stageRank: Record<string, number> = {
  'file-admission': 0, read: 1, 'document-load': 2, 'page-load': 3, geometry: 4,
  extraction: 5, layout: 6, 'visual-group': 7, 'reading-order': 8, serialization: 9, reconstruction: 9, conversion: 8,
  'domain-analysis': 10, cleanup: 11,
}
const severity = (result: RoutingClassification) => result.status === 'HARD_FAILURE' ? 0
  : result.status === 'CLASSIFICATION_REQUIRED' || result.status === 'NEEDS_FOCUSED_INVESTIGATION' ? 1
    : result.status === 'FALLBACK_ELIGIBLE' ? 2 : 3
const pageOf = (cause: CauseRecord) => cause.format === 'pdf' ? cause.pageNumber ?? 0 : 0

export function classifyDocument(input: {
  readonly causes: readonly CauseRecord[]
  readonly validity: ClassificationInput['validity']
  readonly implementation: ClassificationInput['implementation']
  readonly alternatePath: ClassificationInput['alternatePath']
}): { readonly status: RoutingClassification['status']; readonly primaryCause?: CauseRecord['code']; readonly orderedCauses: readonly CauseRecord['code'][] } {
  if (!Array.isArray(input.causes) || !input.causes.length) throw new Error('No classified stage observations')
  if (input.causes.some((cause) => !validateCause(cause) || cause.format !== input.causes[0].format)) {
    throw new Error('Invalid document cause set')
  }
  const classified: Array<{ cause: CauseRecord; result: RoutingClassification }> = input.causes.map((cause: CauseRecord) => (
    { cause, result: classifyCause({ ...input, cause }) }
  ))
  const ordered = [...classified].sort((a, b) => severity(a.result) - severity(b.result)
    || pageOf(a.cause) - pageOf(b.cause)
    || stageRank[stageByCause[a.cause.code]] - stageRank[stageByCause[b.cause.code]]
    || a.cause.code.localeCompare(b.cause.code))
  const first = ordered[0]
  return {
    status: first?.result.status ?? 'STAGE_SUCCESS',
    ...(first ? { primaryCause: first.cause.code } : {}),
    orderedCauses: ordered.map((entry) => entry.cause.code),
  }
}

const safeCountKeys = new Set(['PAGE_COUNT', 'RUN_COUNT', 'ISSUE_COUNT', 'NON_WHITESPACE_COUNT'])
export function projectSafeCause(input: {
  readonly cause: CauseRecord & Readonly<Record<string, unknown>>
  readonly validity: readonly ValidityClaim[]
  readonly exception?: Error
}): Readonly<Record<string, unknown>> {
  if (!isRecord(input.cause)) throw new Error('Invalid cause')
  const counts = Object.fromEntries(Object.entries(isRecord(input.cause.counts) ? input.cause.counts : {})
    .filter(([key, value]) => safeCountKeys.has(key) && Number.isSafeInteger(value) && value >= 0)
    .sort(([a], [b]) => a.localeCompare(b)))
  const safeCause = { format: input.cause.format, code: input.cause.code,
    ...(input.cause.pageNumber === undefined ? {} : { pageNumber: input.cause.pageNumber }),
    ...(input.cause.internalCode === undefined ? {} : { internalCode: input.cause.internalCode }),
    ...(input.cause.finding === undefined ? {} : { finding: input.cause.finding }),
    ...(input.cause.failureCategory === undefined ? {} : { failureCategory: input.cause.failureCategory }),
    counts,
  }
  if (!validateCause(safeCause) || !validateValidity(input.validity)) throw new Error('Invalid projection input')
  const validity = input.validity
    .map((claim) => ({ scope: claim.scope, state: claim.state }))
    .sort((a, b) => a.scope.localeCompare(b.scope) || a.state.localeCompare(b.state))
  return {
    code: input.cause.code, stage: stageByCause[input.cause.code],
    ...(input.cause.internalCode === 'INSUFFICIENT_CALIBRATION' && input.cause.code === 'PDF_LAYOUT_EVIDENCE_UNAVAILABLE'
      ? { internalCode: input.cause.internalCode } : {}),
    ...(input.cause.pageNumber ? { pageNumber: input.cause.pageNumber } : {}),
    ...(Object.keys(counts).length ? { counts } : {}),
    ...(validity.length ? { validity } : {}),
  }
}

export function projectLegacyCompatibility(cause: CauseRecord, observation: LegacyProjectionObservation): { readonly code: LegacyCode } {
  if (!validateCause(cause)) throw new Error('Invalid cause')
  if (['PDF_READING_ORDER_INSUFFICIENT', 'PDF_READING_ORDER_FAILED',
    'PDF_SERIALIZATION_INSUFFICIENT', 'PDF_SERIALIZATION_FAILED'].includes(cause.code)) {
    throw new Error('Reading Order and Serialization legacy projection is deferred')
  }
  if (!['LOW_TEXT_PDF', 'GENERIC_PARSE_FAILURE'].includes(observation)) throw new Error('Unknown legacy observation')
  if (observation === 'LOW_TEXT_PDF' && cause.format !== 'pdf') throw new Error('PDF-only legacy observation')
  return { code: observation === 'LOW_TEXT_PDF' ? 'SCANNED_PDF' : 'PARSE_FAILED' }
}

export function causeFromLegacyCode(_code: LegacyCode): never {
  throw new Error('A legacy public code cannot reconstruct a parser cause.')
}
