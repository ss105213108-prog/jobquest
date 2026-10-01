import { describe, expect, it } from 'vitest'
import {
  canRunLegacyResumeAdapter, composeSerializedDocument, projectSerializationDiagnostic,
  serializedDocumentIssues, serializedPageIssues, serializedTextUnitIssues,
  serializationResultIssues, serializePageV1, type PdfPageManifest, type PdfSerializationInput,
} from '../src/parsers/pdfSerialization'
import {
  causeForSerialization, classifyCause, classifyDocument, projectLegacyCompatibility,
  projectSafeCause, validateCause,
} from '../src/parsers/resumeParserCause'
import { pageFixture } from './helpers/pdfSerializationV1ContractHarness'
import { validPdfClaims } from './helpers/pdfReadingOrderV1ContractHarness'

const manifest: PdfPageManifest = { pageCount: 2, canonicalPageNumbers: [1, 2] }

describe('RP-102 production Serialization foundation', () => {
  it('validates unit, page, result, and document against bound canonical provenance', () => {
    const first = pageFixture([' exact '], { pageNumber: 1 })
    const second = pageFixture([''], { pageNumber: 2 })
    const one = serializePageV1(first)
    const two = serializePageV1(second)
    if (!one || one.status !== 'RESOLVED' || !two || two.status !== 'RESOLVED') throw new Error('Invalid fixture')
    const unit = one.page.orderedUnits[0]
    expect(serializedTextUnitIssues(first, unit)).toEqual([])
    expect(serializedPageIssues(first, one.page)).toEqual([])
    expect(serializationResultIssues(first, one)).toEqual([])
    expect(serializedTextUnitIssues(first, { ...unit, runId: 99 })).not.toEqual([])
    expect(serializedPageIssues(first, { ...one.page, orderedUnits: [unit, unit] })).not.toEqual([])
    const entries = [{ source: second, result: two }, { source: first, result: one }]
    const document = composeSerializedDocument(manifest, entries)
    expect(document?.pages.map((page) => page.pageNumber)).toEqual([1, 2])
    expect(serializedDocumentIssues(manifest, entries, document)).toEqual([])
    expect(canRunLegacyResumeAdapter(manifest, entries, document)).toBe(true)
    expect(serializedDocumentIssues(manifest, entries, { pages: [...(document?.pages ?? [])].reverse() })).not.toEqual([])
  })

  it('does not mutate inputs or alias composed page/unit objects', () => {
    const first = pageFixture(['text'], { pageNumber: 1 })
    const second = pageFixture([''], { pageNumber: 2 })
    const one = serializePageV1(first)
    const two = serializePageV1(second)
    if (!one || one.status !== 'RESOLVED' || !two || two.status !== 'RESOLVED') throw new Error('Invalid fixture')
    const entries = [{ source: second, result: two }, { source: first, result: one }]
    const before = structuredClone(entries)
    const document = composeSerializedDocument(manifest, entries)
    expect(entries).toEqual(before)
    expect(document?.pages[0]).not.toBe(one.page)
    expect(document?.pages[0]?.orderedUnits[0]).not.toBe(one.page.orderedUnits[0])
  })

  it('returns safe issues for malformed runtime values and a hard state for an internal exception', () => {
    const source = pageFixture(['private@example.invalid'])
    expect(serializedTextUnitIssues(null as unknown as PdfSerializationInput, { groupId: 'x', runId: 0, text: 'x' }))
      .not.toEqual([])
    expect(serializedPageIssues(null as unknown as PdfSerializationInput,
      { pageNumber: 1, orderedUnits: [{ groupId: 'x', runId: 0, text: 'x' }] })).not.toEqual([])
    const throwing = { ...source, get order(): PdfSerializationInput['order'] {
      throw new Error('private@example.invalid')
    } }
    expect(serializePageV1(throwing)).toEqual({ status: 'FAILED', pageNumber: 1, code: 'RUNTIME_FAILURE' })
    expect(projectSerializationDiagnostic(source, { status: 'RESOLVED', pageNumber: 1,
      page: { pageNumber: 1, orderedUnits: [{ groupId: 'visual:whole', runId: 0,
        text: 'forged@example.invalid' }] } })).toBeNull()
    const multi = pageFixture(['one', 'two'])
    expect(serializedPageIssues(multi, { pageNumber: 1,
      orderedUnits: [{ groupId: 'visual:whole', runId: 0, text: 'one' }] })).toContain('SOURCE_NOT_SERIALIZABLE')
  })

  it('keeps new causes page-scoped, privacy-safe, and separate from legacy projection', () => {
    const source = pageFixture(['a', 'b'], { pageNumber: 2 })
    const result = serializePageV1(source)
    if (!result) throw new Error('Invalid fixture')
    const cause = causeForSerialization(source, result)
    if (!cause) throw new Error('Expected Serialization cause')
    expect(cause).toEqual({ format: 'pdf', code: 'PDF_SERIALIZATION_INSUFFICIENT', pageNumber: 2 })
    expect(validateCause(cause)).toBe(true)
    expect(validateCause({ ...cause, pageNumber: 0 })).toBe(false)
    expect(validateCause({ ...cause, pageNumber: undefined })).toBe(false)
    expect(projectSafeCause({ cause, validity: validPdfClaims(2),
      exception: new Error('private@example.invalid') })).toMatchObject({
      code: 'PDF_SERIALIZATION_INSUFFICIENT', stage: 'serialization', pageNumber: 2,
    })
    expect(JSON.stringify(projectSafeCause({ cause, validity: validPdfClaims(2),
      exception: new Error('private@example.invalid') }))).not.toContain('private@example.invalid')
    expect(() => projectLegacyCompatibility(cause, 'GENERIC_PARSE_FAILURE')).toThrow()
    expect(() => causeForSerialization(source, { ...result, pageNumber: 1 })).toThrow()
  })

  it('classifies normal valid insufficiency for fallback and failure as hard parser failure', () => {
    const valid = validPdfClaims(1)
    const insufficient = { format: 'pdf', code: 'PDF_SERIALIZATION_INSUFFICIENT', pageNumber: 1 } as const
    const failed = { format: 'pdf', code: 'PDF_SERIALIZATION_FAILED', pageNumber: 2 } as const
    const classify = (cause: typeof insufficient | typeof failed, implementation: 'NORMAL' | 'FAILED' = 'NORMAL') =>
      classifyCause({ cause, validity: valid, implementation, alternatePath: 'UNKNOWN' })
    expect(classify(insufficient)).toEqual({ status: 'FALLBACK_ELIGIBLE', reason: 'INSUFFICIENT_STRUCTURE',
      cause: insufficient.code })
    expect(classify(insufficient, 'FAILED')).toMatchObject({ status: 'CLASSIFICATION_REQUIRED', need: 'NEEDS_CAUSE_SPLIT' })
    expect(classify(failed)).toEqual({ status: 'HARD_FAILURE', reason: 'PARSER_FAILURE', cause: failed.code })
    const validity = [...valid, { scope: 'PAGE', predicate: 'PAGE_STRUCTURE_VALID',
      state: 'CONFIRMED_VALID', pageNumber: 2 } as const]
    const forward = classifyDocument({ causes: [insufficient, failed], validity,
      implementation: 'NORMAL', alternatePath: 'UNKNOWN' })
    const reversed = classifyDocument({ causes: [failed, insufficient], validity,
      implementation: 'NORMAL', alternatePath: 'UNKNOWN' })
    expect(forward).toEqual(reversed)
    expect(forward).toMatchObject({ status: 'HARD_FAILURE', primaryCause: 'PDF_SERIALIZATION_FAILED' })
  })
})
