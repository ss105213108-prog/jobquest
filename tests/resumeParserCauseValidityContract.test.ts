import { describe, expect, it } from 'vitest'
import {
  causeFromLegacyCode,
  classifyCause,
  classifyDocument,
  projectLegacyCompatibility,
  projectSafeCause,
  validateCause,
  validateValidity,
  type CauseRecord,
  type DocxCauseCode,
  type PdfCauseCode,
  type ValidityClaim,
  type ValidityPredicate,
  type ValidityScope,
  type ValidityState,
} from '../src/parsers/resumeParserCause'

const claim = (scope: ValidityScope, predicate: ValidityPredicate, state: ValidityState, pageNumber?: number): ValidityClaim => ({
  scope, predicate, state, ...(pageNumber === undefined ? {} : { pageNumber }),
})
const validPdf: readonly ValidityClaim[] = [
  claim('FILE', 'ADMISSION_ACCEPTED', 'CONFIRMED_VALID'),
  claim('DOCUMENT', 'CONTAINER_PARSEABLE', 'CONFIRMED_VALID'),
  claim('PAGE', 'PAGE_STRUCTURE_VALID', 'CONFIRMED_VALID', 1),
  claim('CONTENT', 'SUBSTANTIVE_CONTENT_PRESENT', 'CONFIRMED_VALID'),
]
const validDocx: readonly ValidityClaim[] = [
  claim('FILE', 'ADMISSION_ACCEPTED', 'CONFIRMED_VALID'),
  claim('DOCUMENT', 'CONTAINER_PARSEABLE', 'CONFIRMED_VALID'),
  claim('CONTENT', 'SUBSTANTIVE_CONTENT_PRESENT', 'CONFIRMED_VALID'),
]
const documentLevelPdfCodes = new Set<PdfCauseCode>([
  'FILE_ADMISSION_REJECTED', 'PDF_READ_FAILED', 'PDF_LOAD_FAILED', 'PDF_DOMAIN_ANALYSIS_FAILED',
])
const pdf = (code: PdfCauseCode, extra: Record<string, unknown> = {}): CauseRecord => ({
  format: 'pdf', code, ...(documentLevelPdfCodes.has(code) ? {} : { pageNumber: 1 }), ...extra,
} as CauseRecord)
const docx = (code: DocxCauseCode, extra: Record<string, unknown> = {}): CauseRecord => ({ format: 'docx', code, ...extra } as CauseRecord)
const classify = (cause: CauseRecord, validity = cause.format === 'pdf' ? validPdf : validDocx, extra: {
  implementation?: 'NORMAL' | 'FAILED'; alternatePath?: 'APPROVED' | 'UNAPPROVED' | 'UNKNOWN'
} = {}) => classifyCause({ cause, validity, implementation: extra.implementation ?? 'NORMAL', alternatePath: extra.alternatePath ?? 'APPROVED' })
const replace = (claims: readonly ValidityClaim[], predicate: ValidityPredicate, state: ValidityState) => claims.map((entry) => (
  entry.predicate === predicate ? { ...entry, state } : entry
))

describe('RP-083 parser cause and validity contract (production foundation)', () => {
  it.each([
    'FILE_ADMISSION_REJECTED', 'PDF_READ_FAILED', 'PDF_LOAD_FAILED', 'PDF_PAGE_LOAD_FAILED',
    'PDF_TEXT_EXTRACTION_FAILED', 'PDF_GEOMETRY_INVALID', 'PDF_GEOMETRY_UNSUPPORTED',
    'PDF_RECONSTRUCTION_FAILED', 'PDF_CONTENT_INSUFFICIENT_OR_UNKNOWN',
    'PDF_LAYOUT_EVIDENCE_UNAVAILABLE', 'PDF_LAYOUT_EVIDENCE_FAILED',
    'PDF_VISUAL_GROUP_INSUFFICIENT', 'PDF_VISUAL_GROUP_FAILED',
  ] as const)('keeps PDF cause family %s distinct from a document outcome', (code) => {
    const cause = pdf(code)
    expect(validateCause(cause)).toBe(true)
    expect(cause).not.toHaveProperty('status')
    expect(cause).not.toHaveProperty('reason')
  })

  it.each([
    'DOCX_READ_FAILED', 'DOCX_CONVERSION_FAILED', 'DOCX_VALID_BUT_UNSUPPORTED',
    'DOCX_CONTENT_INSUFFICIENT_OR_UNKNOWN', 'DOCX_DOMAIN_ANALYSIS_FAILED', 'DOCX_WARNING_ONLY',
  ] as const)('keeps DOCX cause family %s independent of PDF', (code) => {
    expect(validateCause(docx(code))).toBe(true)
    expect(docx(code)).not.toHaveProperty('status')
  })

  it('rejects PDF cause codes as DOCX and DOCX cause codes as PDF, including PDF-only legacy projection', () => {
    expect(validateCause({ format: 'docx', code: 'PDF_VISUAL_GROUP_FAILED' })).toBe(false)
    expect(validateCause({ format: 'docx', code: 'PDF_LAYOUT_EVIDENCE_UNAVAILABLE' })).toBe(false)
    expect(validateCause({ format: 'pdf', code: 'DOCX_CONVERSION_FAILED' })).toBe(false)
    expect(() => projectLegacyCompatibility(docx('DOCX_READ_FAILED'), 'LOW_TEXT_PDF')).toThrow()
    expect(validateCause({ ...pdf('PDF_LOAD_FAILED'), pageNumber: 1 })).toBe(false)
    expect(validateCause({ format: 'pdf', code: 'PDF_PAGE_LOAD_FAILED' })).toBe(false)
  })

  it.each([
    [pdf('FILE_ADMISSION_REJECTED'), 'INPUT_REJECTED'],
    [pdf('PDF_READ_FAILED'), 'DOCUMENT_UNREADABLE'],
    [pdf('PDF_PAGE_LOAD_FAILED'), 'DOCUMENT_UNREADABLE'],
    [pdf('PDF_RECONSTRUCTION_FAILED'), 'PARSER_FAILURE'],
    [pdf('PDF_DOMAIN_ANALYSIS_FAILED'), 'PARSER_FAILURE'],
    [docx('DOCX_READ_FAILED'), 'DOCUMENT_UNREADABLE'],
    [docx('DOCX_DOMAIN_ANALYSIS_FAILED'), 'PARSER_FAILURE'],
  ] as const)('preserves directly verified hard cause %# with its coarse reason', (cause, reason) => {
    expect(classify(cause)).toMatchObject({ status: 'HARD_FAILURE', cause: cause.code, reason })
  })

  it('requires typed cause splitting for PDF load and DOCX conversion failures', () => {
    expect(classify(pdf('PDF_LOAD_FAILED'))).toMatchObject({ status: 'CLASSIFICATION_REQUIRED', need: 'NEEDS_CAUSE_SPLIT' })
    expect(classify(pdf('PDF_LOAD_FAILED', { failureCategory: 'CORRUPT_DOCUMENT' })))
      .toMatchObject({ status: 'HARD_FAILURE', reason: 'DOCUMENT_UNREADABLE' })
    expect(classify(docx('DOCX_CONVERSION_FAILED', { failureCategory: 'RUNTIME_FAILURE' })))
      .toMatchObject({ status: 'HARD_FAILURE', reason: 'PARSER_FAILURE' })
  })

  it.each(['FILE', 'DOCUMENT', 'PAGE', 'CONTENT'] as const)(
    '%s validity can be valid, invalid, or unknown independently', (scope) => {
      const predicate: Record<ValidityScope, ValidityPredicate> = {
        FILE: 'ADMISSION_ACCEPTED', DOCUMENT: 'CONTAINER_PARSEABLE',
        PAGE: 'PAGE_STRUCTURE_VALID', CONTENT: 'SUBSTANTIVE_CONTENT_PRESENT',
      }
      for (const state of ['CONFIRMED_VALID', 'CONFIRMED_INVALID', 'UNKNOWN'] as const) {
        const evidence = [claim(scope, predicate[scope], state, scope === 'PAGE' ? 2 : undefined)]
        expect(validateValidity(evidence)).toBe(true)
        expect(evidence[0].state).toBe(state)
      }
    },
  )

  it('rejects a single validity boolean, wrong scope, missing page, and conflicting claims', () => {
    expect(validateValidity({ isValid: true })).toBe(false)
    expect(validateValidity([{ scope: 'DOCUMENT', predicate: 'CONTAINER_PARSEABLE', isValid: true }])).toBe(false)
    expect(validateValidity([claim('FILE', 'CONTAINER_PARSEABLE', 'CONFIRMED_VALID')])).toBe(false)
    expect(validateValidity([claim('PAGE', 'PAGE_STRUCTURE_VALID', 'CONFIRMED_VALID')])).toBe(false)
    expect(validateValidity([
      claim('DOCUMENT', 'CONTAINER_PARSEABLE', 'CONFIRMED_VALID'),
      claim('DOCUMENT', 'CONTAINER_PARSEABLE', 'UNKNOWN'),
    ])).toBe(false)
  })

  it('does not let document validity prove another page or missing content validity', () => {
    expect(classify(pdf('PDF_GEOMETRY_UNSUPPORTED', { pageNumber: 2 }), validPdf).status).toBe('CLASSIFICATION_REQUIRED')
    expect(classify(pdf('PDF_GEOMETRY_UNSUPPORTED'), validPdf.filter((entry) => entry.scope !== 'CONTENT')).status)
      .toBe('CLASSIFICATION_REQUIRED')
  })

  it('treats UNKNOWN and CONFIRMED_INVALID as different, never as fallback-valid', () => {
    const cause = pdf('PDF_GEOMETRY_UNSUPPORTED')
    expect(classify(cause, replace(validPdf, 'PAGE_STRUCTURE_VALID', 'UNKNOWN'))).toMatchObject({
      status: 'CLASSIFICATION_REQUIRED', need: 'NEEDS_VALIDITY_CLASSIFIER',
    })
    expect(classify(cause, replace(validPdf, 'PAGE_STRUCTURE_VALID', 'CONFIRMED_INVALID'))).toMatchObject({ status: 'HARD_FAILURE' })
    expect(classify(cause, validPdf).status).toBe('FALLBACK_ELIGIBLE')
  })

  it('requires normal implementation behavior and an approved path for unsupported representation', () => {
    const cause = pdf('PDF_GEOMETRY_UNSUPPORTED')
    expect(classify(cause, validPdf, { implementation: 'FAILED' }).status).not.toBe('FALLBACK_ELIGIBLE')
    expect(classify(cause, validPdf, { alternatePath: 'UNKNOWN' }).status).not.toBe('FALLBACK_ELIGIBLE')
    expect(classify(cause, validPdf, { alternatePath: 'UNAPPROVED' }).status).not.toBe('FALLBACK_ELIGIBLE')
    expect(classify(cause, validPdf)).toMatchObject({ reason: 'UNSUPPORTED_VALID_REPRESENTATION' })
  })

  it('classifies validated VisualGroup insufficiency as fallback without calling it document success', () => {
    expect(classify(pdf('PDF_VISUAL_GROUP_INSUFFICIENT'))).toMatchObject({
      status: 'FALLBACK_ELIGIBLE', reason: 'INSUFFICIENT_STRUCTURE', cause: 'PDF_VISUAL_GROUP_INSUFFICIENT',
    })
  })

  it('keeps VisualGroup insufficiency unresolved when content validity is UNKNOWN', () => {
    expect(classify(pdf('PDF_VISUAL_GROUP_INSUFFICIENT'), replace(validPdf, 'SUBSTANTIVE_CONTENT_PRESENT', 'UNKNOWN')))
      .toMatchObject({ status: 'CLASSIFICATION_REQUIRED', need: 'NEEDS_VALIDITY_CLASSIFIER' })
  })

  it('makes an internal VisualGroup failure hard even for a valid document', () => {
    expect(classify(pdf('PDF_VISUAL_GROUP_FAILED'))).toMatchObject({
      status: 'HARD_FAILURE', reason: 'PARSER_FAILURE', cause: 'PDF_VISUAL_GROUP_FAILED',
    })
  })

  it('treats VisualGroup RESOLVED as stage success only', () => {
    expect(classify(pdf('PDF_VISUAL_GROUP_RESOLVED'))).toEqual({ status: 'STAGE_SUCCESS', cause: 'PDF_VISUAL_GROUP_RESOLVED' })
  })

  it('preserves INSUFFICIENT_CALIBRATION but does not infer fallback from UNAVAILABLE alone', () => {
    const cause = pdf('PDF_LAYOUT_EVIDENCE_UNAVAILABLE', { internalCode: 'INSUFFICIENT_CALIBRATION' })
    expect(classify(pdf('PDF_LAYOUT_EVIDENCE_UNAVAILABLE'))).toMatchObject({
      status: 'CLASSIFICATION_REQUIRED', need: 'NEEDS_CAUSE_SPLIT',
    })
    expect(projectSafeCause({ cause, validity: validPdf })).toMatchObject({ internalCode: 'INSUFFICIENT_CALIBRATION' })
    expect(classify(cause, replace(validPdf, 'SUBSTANTIVE_CONTENT_PRESENT', 'UNKNOWN')).status).toBe('CLASSIFICATION_REQUIRED')
    expect(classify(cause)).toMatchObject({ status: 'FALLBACK_ELIGIBLE', reason: 'INSUFFICIENT_STRUCTURE' })
  })

  it('routes PageLayout FAILED as hard without erasing its cause identity', () => {
    expect(classify(pdf('PDF_LAYOUT_EVIDENCE_FAILED'))).toMatchObject({
      status: 'HARD_FAILURE', reason: 'PARSER_FAILURE', cause: 'PDF_LAYOUT_EVIDENCE_FAILED',
    })
  })

  it('requires target-page validity for unsupported rotation and keeps invalid geometry hard', () => {
    expect(classify(pdf('PDF_GEOMETRY_UNSUPPORTED'), replace(validPdf, 'PAGE_STRUCTURE_VALID', 'UNKNOWN')))
      .toMatchObject({ status: 'CLASSIFICATION_REQUIRED', need: 'NEEDS_VALIDITY_CLASSIFIER' })
    expect(classify(pdf('PDF_GEOMETRY_UNSUPPORTED'))).toMatchObject({ status: 'FALLBACK_ELIGIBLE' })
    expect(classify(pdf('PDF_GEOMETRY_INVALID'))).toMatchObject({ status: 'HARD_FAILURE' })
  })

  it('keeps text extraction failure hard and distinct from image-only or insufficient content', () => {
    const extraction = classify(pdf('PDF_TEXT_EXTRACTION_FAILED'))
    const visual = classify(pdf('PDF_CONTENT_INSUFFICIENT_OR_UNKNOWN', { finding: 'LOW_TEXT_UNKNOWN' }))
    expect(extraction).toMatchObject({ status: 'HARD_FAILURE', cause: 'PDF_TEXT_EXTRACTION_FAILED' })
    expect(visual).toMatchObject({ status: 'CLASSIFICATION_REQUIRED', cause: 'PDF_CONTENT_INSUFFICIENT_OR_UNKNOWN' })
  })

  it('preserves different causes that share HARD_FAILURE routing', () => {
    const extraction = classify(pdf('PDF_TEXT_EXTRACTION_FAILED'))
    const visualGroup = classify(pdf('PDF_VISUAL_GROUP_FAILED'))
    expect(extraction.status).toBe('HARD_FAILURE')
    expect(visualGroup.status).toBe('HARD_FAILURE')
    expect(extraction.cause).not.toBe(visualGroup.cause)
  })

  it('refuses direct routing from SCANNED_PDF across sparse, blank, incomplete, and proven-image causes', () => {
    const controls = [
      { cause: pdf('PDF_CONTENT_INSUFFICIENT_OR_UNKNOWN', { finding: 'LOW_TEXT_UNKNOWN', counts: { NON_WHITESPACE_COUNT: 8 } }), validity: validPdf },
      { cause: pdf('PDF_CONTENT_INSUFFICIENT_OR_UNKNOWN', { finding: 'PROVEN_BLANK' }), validity: blankPdfValidity },
      { cause: pdf('PDF_CONTENT_INSUFFICIENT_OR_UNKNOWN', { finding: 'INCOMPLETE_EXTRACTION_UNKNOWN' }), validity: validPdf },
      { cause: pdf('PDF_CONTENT_INSUFFICIENT_OR_UNKNOWN', { finding: 'PROVEN_IMAGE_ONLY' }), validity: imageOnlyPdfValidity },
    ]
    const statuses = controls.map(({ cause, validity }) => classify(cause, validity).status)
    expect(statuses).toEqual(['CLASSIFICATION_REQUIRED', 'HARD_FAILURE', 'CLASSIFICATION_REQUIRED', 'FALLBACK_ELIGIBLE'])
    expect(controls.map(({ cause }) => projectLegacyCompatibility(cause, 'LOW_TEXT_PDF').code))
      .toEqual(Array(4).fill('SCANNED_PDF'))
    expect(() => causeFromLegacyCode('SCANNED_PDF')).toThrow()
  })

  it('refuses direct routing from PARSE_FAILED across PDF, DOCX, low-content, and domain causes', () => {
    const causes = [
      pdf('PDF_LOAD_FAILED'), pdf('PDF_TEXT_EXTRACTION_FAILED'),
      docx('DOCX_CONVERSION_FAILED'), docx('DOCX_CONTENT_INSUFFICIENT_OR_UNKNOWN', { finding: 'LOW_TEXT_UNKNOWN' }),
      docx('DOCX_DOMAIN_ANALYSIS_FAILED'),
    ]
    expect(causes.map((cause) => projectLegacyCompatibility(cause, 'GENERIC_PARSE_FAILURE').code))
      .toEqual(Array(5).fill('PARSE_FAILED'))
    expect(causes.map((cause) => classify(cause).status)).toEqual([
      'CLASSIFICATION_REQUIRED', 'HARD_FAILURE', 'CLASSIFICATION_REQUIRED', 'CLASSIFICATION_REQUIRED', 'HARD_FAILURE',
    ])
    expect(() => causeFromLegacyCode('PARSE_FAILED')).toThrow()
  })

  it('does not use legacy PDF <40 or DOCX <10 counts for validity, image-only, or routing', () => {
    const pdfLow = pdf('PDF_CONTENT_INSUFFICIENT_OR_UNKNOWN', { finding: 'LOW_TEXT_UNKNOWN', counts: { NON_WHITESPACE_COUNT: 0 } })
    const docxLow = docx('DOCX_CONTENT_INSUFFICIENT_OR_UNKNOWN', { finding: 'LOW_TEXT_UNKNOWN', counts: { NON_WHITESPACE_COUNT: 9 } })
    expect(classify(pdfLow).status).toBe('CLASSIFICATION_REQUIRED')
    expect(classify(docxLow).status).toBe('CLASSIFICATION_REQUIRED')
    expect(classify(pdf('PDF_CONTENT_INSUFFICIENT_OR_UNKNOWN', { finding: 'LOW_TEXT_UNKNOWN', counts: { NON_WHITESPACE_COUNT: 39 } })).status)
      .toBe('CLASSIFICATION_REQUIRED')
    expect(classify(docx('DOCX_CONTENT_INSUFFICIENT_OR_UNKNOWN', { finding: 'LOW_TEXT_UNKNOWN', counts: { NON_WHITESPACE_COUNT: 0 } })).status)
      .toBe('CLASSIFICATION_REQUIRED')
  })

  it('requires positive blank proof instead of equating zero text with blankness', () => {
    const cause = pdf('PDF_CONTENT_INSUFFICIENT_OR_UNKNOWN', { finding: 'PROVEN_BLANK' })
    expect(classify(cause, validPdf).status).toBe('CLASSIFICATION_REQUIRED')
    expect(classify(cause, blankPdfValidity)).toMatchObject({ status: 'HARD_FAILURE', reason: 'INPUT_REJECTED' })
    expect(classify(pdf('PDF_CONTENT_INSUFFICIENT_OR_UNKNOWN', { finding: 'LOW_TEXT_UNKNOWN', counts: { NON_WHITESPACE_COUNT: 0 } })).status)
      .toBe('CLASSIFICATION_REQUIRED')
  })

  it('requires valid visual content and no usable text layer before image-only fallback', () => {
    const cause = pdf('PDF_CONTENT_INSUFFICIENT_OR_UNKNOWN', { finding: 'PROVEN_IMAGE_ONLY' })
    expect(classify(cause, validPdf).status).toBe('CLASSIFICATION_REQUIRED')
    expect(classify(cause, replace(imageOnlyPdfValidity, 'VISUAL_CONTENT_PRESENT', 'UNKNOWN')).status).toBe('CLASSIFICATION_REQUIRED')
    expect(classify(cause, replace(imageOnlyPdfValidity, 'NO_USABLE_TEXT_LAYER', 'UNKNOWN')).status).toBe('CLASSIFICATION_REQUIRED')
    expect(classify(cause, imageOnlyPdfValidity, { alternatePath: 'UNAPPROVED' }).status).toBe('CLASSIFICATION_REQUIRED')
    expect(classify(cause, imageOnlyPdfValidity)).toMatchObject({ status: 'FALLBACK_ELIGIBLE', reason: 'NO_USABLE_TEXT' })
  })

  it('keeps DOCX read failure, conversion ambiguity, and validated conversion failure distinct', () => {
    expect(classify(docx('DOCX_READ_FAILED'))).toMatchObject({ status: 'HARD_FAILURE', cause: 'DOCX_READ_FAILED' })
    expect(classify(docx('DOCX_CONVERSION_FAILED'))).toMatchObject({ status: 'CLASSIFICATION_REQUIRED', need: 'NEEDS_CAUSE_SPLIT' })
    expect(classify(docx('DOCX_CONVERSION_FAILED', { failureCategory: 'CORRUPT_DOCUMENT' })))
      .toMatchObject({ status: 'HARD_FAILURE', reason: 'DOCUMENT_UNREADABLE' })
  })

  it('requires independent DOCX document/content validity for valid but unsupported content', () => {
    const cause = docx('DOCX_VALID_BUT_UNSUPPORTED')
    expect(classify(cause, replace(validDocx, 'CONTAINER_PARSEABLE', 'UNKNOWN')).status).toBe('CLASSIFICATION_REQUIRED')
    expect(classify(cause, replace(validDocx, 'SUBSTANTIVE_CONTENT_PRESENT', 'CONFIRMED_INVALID')).status).toBe('HARD_FAILURE')
    expect(classify(cause, validDocx)).toMatchObject({ status: 'FALLBACK_ELIGIBLE', reason: 'UNSUPPORTED_VALID_REPRESENTATION' })
  })

  it('keeps DOCX low-content unknown unresolved and warnings non-fatal', () => {
    expect(classify(docx('DOCX_CONTENT_INSUFFICIENT_OR_UNKNOWN', { finding: 'LOW_TEXT_UNKNOWN' }),
      replace(validDocx, 'SUBSTANTIVE_CONTENT_PRESENT', 'UNKNOWN')).status).toBe('CLASSIFICATION_REQUIRED')
    expect(classify(docx('DOCX_WARNING_ONLY'))).toEqual({ status: 'STAGE_SUCCESS', cause: 'DOCX_WARNING_ONLY' })
  })

  it('requires DOCX-specific positive blank proof rather than a low character count', () => {
    const cause = docx('DOCX_CONTENT_INSUFFICIENT_OR_UNKNOWN', { finding: 'PROVEN_BLANK' })
    const blank = [
      ...replace(validDocx, 'SUBSTANTIVE_CONTENT_PRESENT', 'CONFIRMED_INVALID'),
      claim('CONTENT', 'CONTENT_INSPECTION_COMPLETE', 'CONFIRMED_VALID'),
    ]
    expect(classify(cause, validDocx).status).toBe('CLASSIFICATION_REQUIRED')
    expect(classify(cause, blank)).toMatchObject({ status: 'HARD_FAILURE', reason: 'INPUT_REJECTED' })
  })

  it('does not create a parser cause from empty optional domain fields', () => {
    const profile = { name: '', skills: [], workExperiences: [], projects: [] }
    expect(validateCause(profile)).toBe(false)
    expect(profile).not.toHaveProperty('status')
    expect(classify(docx('DOCX_WARNING_ONLY')).status).toBe('STAGE_SUCCESS')
  })

  it('preserves a primary extraction failure when cleanup fails afterward', () => {
    const causes = [pdf('PDF_TEXT_EXTRACTION_FAILED'), pdf('PDF_CLEANUP_FAILED')]
    const result = classifyDocument({ causes, validity: validPdf, implementation: 'NORMAL', alternatePath: 'APPROVED' })
    expect(result).toMatchObject({ status: 'HARD_FAILURE', primaryCause: 'PDF_TEXT_EXTRACTION_FAILED' })
    expect(result.orderedCauses).toContain('PDF_CLEANUP_FAILED')
  })

  it('leaves cleanup-after-success explicitly undecided', () => {
    expect(classify(pdf('PDF_CLEANUP_FAILED'))).toEqual({
      status: 'NEEDS_FOCUSED_INVESTIGATION', cause: 'PDF_CLEANUP_FAILED',
    })
    expect(classifyDocument({ causes: [pdf('PDF_CLEANUP_FAILED')], validity: validPdf,
      implementation: 'NORMAL', alternatePath: 'APPROVED' }).status).toBe('NEEDS_FOCUSED_INVESTIGATION')
  })

  it('selects primary and ordered causes independent of arrival order', () => {
    const causes = [pdf('PDF_VISUAL_GROUP_FAILED', { pageNumber: 2 }),
      pdf('PDF_TEXT_EXTRACTION_FAILED', { pageNumber: 1 }), pdf('PDF_VISUAL_GROUP_INSUFFICIENT', { pageNumber: 3 })]
    const inputs = [causes, [causes[2], causes[0], causes[1]], [...causes].reverse()]
    const outcomes = inputs.map((ordered) => classifyDocument({ causes: ordered, validity: validPdf,
      implementation: 'NORMAL', alternatePath: 'APPROVED' }))
    expect(outcomes.every((outcome) => JSON.stringify(outcome) === JSON.stringify(outcomes[0]))).toBe(true)
    expect(outcomes[0].primaryCause).toBe('PDF_TEXT_EXTRACTION_FAILED')
  })

  it('does not mistake an empty observation set for deterministic stage success', () => {
    expect(() => classifyDocument({ causes: [], validity: validPdf,
      implementation: 'NORMAL', alternatePath: 'APPROVED' })).toThrow()
  })

  it('allows a verified hard failure to win while unclassified critical causes gate fallback', () => {
    const unsupported = pdf('PDF_GEOMETRY_UNSUPPORTED')
    const insufficient = pdf('PDF_VISUAL_GROUP_INSUFFICIENT', { pageNumber: 2 })
    const unknown = replace(validPdf, 'PAGE_STRUCTURE_VALID', 'UNKNOWN')
    expect(classifyDocument({ causes: [unsupported, insufficient], validity: unknown,
      implementation: 'NORMAL', alternatePath: 'APPROVED' }).status).toBe('CLASSIFICATION_REQUIRED')
    expect(classifyDocument({ causes: [unsupported, pdf('PDF_TEXT_EXTRACTION_FAILED')], validity: unknown,
      implementation: 'NORMAL', alternatePath: 'APPROVED' }).status).toBe('HARD_FAILURE')
  })

  it('projects only stable code, stage, page, safe counts, and validity scope/state', () => {
    const cause = { ...pdf('PDF_LAYOUT_EVIDENCE_UNAVAILABLE', { internalCode: 'INSUFFICIENT_CALIBRATION', counts: {
      RUN_COUNT: 2, PRIVATE_PHONE: 123456, ISSUE_COUNT: -1,
    } }), rawText: 'PRIVATE TEXT', name: 'Private Name', email: 'private@example.test',
    phone: '123-456-7890', company: 'Private Company', school: 'Private School',
    path: 'C:/private/resume.pdf', textRun: 'PRIVATE TEXT' } as CauseRecord & Readonly<Record<string, unknown>>
    const projected = projectSafeCause({ cause, validity: validPdf, exception: new Error('PRIVATE EXCEPTION MESSAGE') })
    expect(projected).toMatchObject({ code: 'PDF_LAYOUT_EVIDENCE_UNAVAILABLE', stage: 'layout', pageNumber: 1,
      internalCode: 'INSUFFICIENT_CALIBRATION', counts: { RUN_COUNT: 2 } })
    expect(Object.keys(projected).sort()).toEqual(['code', 'counts', 'internalCode', 'pageNumber', 'stage', 'validity'])
    expect(JSON.stringify(projected)).not.toMatch(/PRIVATE|private|123-456|C:\/private|MESSAGE/)
  })

  it('never uses raw Error.message as a routing category', () => {
    const cause = pdf('PDF_LOAD_FAILED', { failureCategory: 'UNCLASSIFIED' })
    const left = projectSafeCause({ cause, validity: validPdf, exception: new Error('password') })
    const right = projectSafeCause({ cause, validity: validPdf, exception: new Error('corrupt') })
    expect(left).toEqual(right)
    expect(classify(cause)).toMatchObject({ status: 'CLASSIFICATION_REQUIRED', need: 'NEEDS_CAUSE_SPLIT' })
  })

  it('permits one-way preserved-cause to legacy projection but prohibits reverse inference', () => {
    expect(projectLegacyCompatibility(pdf('PDF_TEXT_EXTRACTION_FAILED'), 'GENERIC_PARSE_FAILURE')).toEqual({ code: 'PARSE_FAILED' })
    expect(projectLegacyCompatibility(docx('DOCX_CONTENT_INSUFFICIENT_OR_UNKNOWN'), 'GENERIC_PARSE_FAILURE')).toEqual({ code: 'PARSE_FAILED' })
    expect(() => causeFromLegacyCode('PARSE_FAILED')).toThrow()
    expect(() => causeFromLegacyCode('SCANNED_PDF')).toThrow()
  })

  it('does not mutate frozen causes, validity evidence, counts, or source arrays', () => {
    const counts = Object.freeze({ RUN_COUNT: 2 })
    const cause = Object.freeze(pdf('PDF_VISUAL_GROUP_INSUFFICIENT', { counts }))
    const validity = Object.freeze(validPdf.map((entry) => Object.freeze({ ...entry })))
    const causes = Object.freeze([cause])
    const before = structuredClone({ cause, validity, causes })
    const first = classifyDocument({ causes, validity, implementation: 'NORMAL', alternatePath: 'APPROVED' })
    const second = classifyDocument({ causes, validity, implementation: 'NORMAL', alternatePath: 'APPROVED' })
    const projected = projectSafeCause({ cause, validity })
    expect(first).toEqual(second)
    expect(projected).toEqual(projectSafeCause({ cause, validity }))
    expect({ cause, validity, causes }).toEqual(before)
  })
})

const blankPdfValidity: readonly ValidityClaim[] = [
  ...replace(validPdf, 'SUBSTANTIVE_CONTENT_PRESENT', 'CONFIRMED_INVALID'),
  claim('CONTENT', 'CONTENT_INSPECTION_COMPLETE', 'CONFIRMED_VALID'),
  claim('CONTENT', 'VISUAL_CONTENT_PRESENT', 'CONFIRMED_INVALID'),
]
const imageOnlyPdfValidity: readonly ValidityClaim[] = [
  ...validPdf.filter((entry) => entry.predicate !== 'SUBSTANTIVE_CONTENT_PRESENT'),
  claim('CONTENT', 'CONTENT_INSPECTION_COMPLETE', 'CONFIRMED_VALID'),
  claim('CONTENT', 'VISUAL_CONTENT_PRESENT', 'CONFIRMED_VALID'),
  claim('CONTENT', 'NO_USABLE_TEXT_LAYER', 'CONFIRMED_VALID'),
]
