import { describe, expect, it } from 'vitest'
import {
  classifyCause,
  classifyDocument,
  projectSafeCause,
  validateCause,
  validateClassification,
  validateValidity,
  type CauseRecord,
  type ClassificationInput,
} from '../src/parsers/resumeParserCause'

const pdfCause: CauseRecord = { format: 'pdf', code: 'PDF_VISUAL_GROUP_INSUFFICIENT', pageNumber: 1 }
const validity = [
  { scope: 'FILE', predicate: 'ADMISSION_ACCEPTED', state: 'CONFIRMED_VALID' },
  { scope: 'DOCUMENT', predicate: 'CONTAINER_PARSEABLE', state: 'CONFIRMED_VALID' },
  { scope: 'PAGE', predicate: 'PAGE_STRUCTURE_VALID', state: 'CONFIRMED_VALID', pageNumber: 1 },
  { scope: 'CONTENT', predicate: 'SUBSTANTIVE_CONTENT_PRESENT', state: 'CONFIRMED_VALID' },
] as const
const input: ClassificationInput = { cause: pdfCause, validity, implementation: 'NORMAL', alternatePath: 'APPROVED' }

describe('RP-084 production cause foundation runtime boundary', () => {
  it('rejects malformed page scopes, namespaces, and unsafe cause fields', () => {
    expect(validateCause({ ...pdfCause, pageNumber: 0 })).toBe(false)
    expect(validateCause({ ...pdfCause, pageNumber: 1.5 })).toBe(false)
    expect(validateCause({ format: 'docx', code: pdfCause.code })).toBe(false)
    expect(validateCause({ ...pdfCause, rawText: 'private' })).toBe(false)
    expect(validateCause({ format: 'pdf', code: 'PDF_PAGE_LOAD_FAILED' })).toBe(false)
    expect(validateCause({ format: 'pdf', code: 'PDF_LAYOUT_EVIDENCE_UNAVAILABLE', pageNumber: 1, internalCode: 'OTHER' })).toBe(false)
  })

  it('rejects malformed validity and classification results at runtime', () => {
    expect(validateValidity([{ ...validity[0], state: 'VALID' }])).toBe(false)
    expect(validateValidity([{ ...validity[2], pageNumber: -1 }])).toBe(false)
    expect(validateClassification({ status: 'FALLBACK_ELIGIBLE', cause: pdfCause.code })).toBe(false)
    expect(validateClassification({ status: 'HARD_FAILURE', cause: pdfCause.code, reason: 'OTHER' })).toBe(false)
    expect(validateClassification({ status: 'STAGE_SUCCESS', cause: pdfCause.code, rawText: 'private' })).toBe(false)
    expect(validateClassification(classifyCause(input))).toBe(true)
  })

  it('rejects invalid runtime classifier options and zero stage observations', () => {
    expect(() => classifyCause({ ...input, implementation: 'MAYBE' } as unknown as ClassificationInput)).toThrow()
    expect(() => classifyCause({ ...input, alternatePath: 'MAYBE' } as unknown as ClassificationInput)).toThrow()
    expect(() => classifyDocument({ ...input, causes: [] })).toThrow()
    expect(() => classifyDocument({ ...input, causes: [pdfCause, { format: 'docx', code: 'DOCX_READ_FAILED' }] })).toThrow()
  })

  it('keeps projections private while rejecting malformed structural input', () => {
    const safe = projectSafeCause({
      cause: { ...pdfCause, rawText: 'private', path: 'C:/private', counts: { RUN_COUNT: 2, NAME: 1 } },
      validity,
      exception: new Error('private'),
    })
    expect(safe).toMatchObject({ code: pdfCause.code, counts: { RUN_COUNT: 2 } })
    expect(JSON.stringify(safe)).not.toContain('private')
    expect(() => projectSafeCause({ cause: { format: 'docx', code: pdfCause.code } as unknown as CauseRecord, validity })).toThrow()
    expect(() => projectSafeCause({ cause: { ...pdfCause, pageNumber: 0 }, validity })).toThrow()
  })
})
