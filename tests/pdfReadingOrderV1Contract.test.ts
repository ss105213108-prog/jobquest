import { describe, expect, it } from 'vitest'
import {
  createDocumentOutcome,
  RoutingClassificationRequired,
  validateResumeParseOutcome,
  type StageAggregate,
} from '../src/parsers/resumeDocumentOutcome'
import {
  causeForReadingOrder,
  causeFromLegacyCode,
  classifyCause,
  classifyDocument,
  projectLegacyCompatibility,
  validateCause as validReadingOrderCause,
  type ReadingOrderCause,
  type ValidityClaim,
} from '../src/parsers/resumeParserCause'
import {
  canSerializeReadingOrder as maySerialize,
  projectReadingOrderDiagnostic,
  readingOrderResultIssues,
  resolveReadingOrderV1 as formReadingOrderV1,
  type ReadingOrderV1Result,
} from '../src/parsers/pdfReadingOrder'
import { canAdmitReadingOrder, spatialResultIssues, type SpatialStructureResult } from '../src/parsers/pdfSpatialStructureGraph'
import type { ResumeProfile } from '../src/types'
import { oneMultiRunGroupFixture, readingOrderFixture, validPdfClaims,
  type AnonymousBox } from './helpers/pdfReadingOrderV1ContractHarness'

const one = [{ x: 20, y: 700, width: 30 }] as const
const disjoint = [{ x: 20, y: 700, width: 20 }, { x: 80, y: 700, width: 20 }] as const
const overlap = [{ x: 20, y: 700, width: 40 }, { x: 50, y: 704, width: 30 }] as const
const above = [{ x: 20, y: 760, width: 20 }, { x: 20, y: 700, width: 20 }] as const
const touching = [{ x: 20, y: 700, width: 10 }, { x: 30, y: 700, width: 10 }] as const
const fixture = (boxes: readonly AnonymousBox[], pageNumber = 1, groupOrder?: readonly number[]) => (
  readingOrderFixture(boxes, pageNumber, groupOrder)
)
const resolved = (boxes: readonly AnonymousBox[], pageNumber = 1, groupOrder?: readonly number[]) => {
  const page = fixture(boxes, pageNumber, groupOrder)
  return { ...page, order: formReadingOrderV1(page.input, page.spatial) }
}
const insufficientCause = (pageNumber = 1): ReadingOrderCause => ({
  format: 'pdf', code: 'PDF_READING_ORDER_INSUFFICIENT', pageNumber,
})
const failedCause = (pageNumber = 1): ReadingOrderCause => ({
  format: 'pdf', code: 'PDF_READING_ORDER_FAILED', pageNumber,
})
const classify = (cause: ReadingOrderCause, validity: readonly ValidityClaim[] = validPdfClaims(cause.pageNumber),
  implementation: 'NORMAL' | 'FAILED' = 'NORMAL') => classifyCause({ cause, validity, implementation, alternatePath: 'UNKNOWN' })
const partialProfile = (): ResumeProfile => ({
  id: 'anonymous', name: 'Anonymous Example', skills: [], projects: [], workExperiences: [],
  education: { school: '', department: '', graduationStatus: '' }, careerDirections: [],
  updatedAt: '2026-09-27T00:00:00.000Z', level: 1, abilities: [],
})
const completeStages = { extraction: true, structure: true, serialization: true, domainParsing: true } as const

describe('RP-098 Reading Order V1 result and admission contract (production)', () => {
  it('resolves a valid singleton to its one canonical group exactly once, without Region ownership', () => {
    const { input, spatial, order } = resolved(one)
    expect(canAdmitReadingOrder(input, spatial)).toBe(true)
    expect(spatial).not.toHaveProperty('regions')
    expect(order).toEqual({ status: 'RESOLVED', pageNumber: 1, sequence: ['visual:0'] })
    expect(readingOrderResultIssues(input, spatial, order)).toEqual([])
  })

  it('keeps a multi-run authoritative VisualGroup whole under fixture-item permutation', () => {
    const first = oneMultiRunGroupFixture([{ x: 20, y: 700, width: 20 }, { x: 40, y: 700, width: 20 }])
    const reversed = oneMultiRunGroupFixture([{ x: 40, y: 700, width: 20 }, { x: 20, y: 700, width: 20 }])
    for (const page of [first, reversed]) {
      expect(canAdmitReadingOrder(page.input, page.spatial)).toBe(true)
      expect(formReadingOrderV1(page.input, page.spatial)).toEqual({
        status: 'RESOLVED', pageNumber: 1, sequence: ['visual:whole'],
      })
    }
  })

  it.each([
    ['two groups', disjoint, 'X_DISJOINT'],
    ['horizontal overlap', overlap, 'X_OVERLAP'],
    ['vertical separation', above, 'Y_ABOVE'],
  ] as const)('%s remains insufficient even with %s evidence', (_label, boxes, kind) => {
    const { input, spatial, order } = resolved(boxes)
    expect(spatial.status).toBe('RESOLVED')
    if (spatial.status !== 'RESOLVED') throw new Error('Invalid fixture')
    expect(spatial.graph.facts.map((fact) => fact.kind)).toContain(kind)
    expect(canAdmitReadingOrder(input, spatial)).toBe(true)
    expect(order).toEqual({ status: 'INSUFFICIENT_EVIDENCE', pageNumber: 1,
      diagnostic: { code: 'NO_APPROVED_PRECEDENCE_SIGNAL', groupCount: 2 } })
    expect(order).not.toHaveProperty('sequence')
    expect(readingOrderResultIssues(input, spatial, order)).toEqual([])
  })

  it('does not infer precedence from a unique-looking three-group vertical chain', () => {
    const { spatial, order } = resolved([
      { x: 20, y: 760, width: 20 }, { x: 20, y: 700, width: 20 }, { x: 20, y: 640, width: 20 },
    ])
    expect(spatial.status === 'RESOLVED' && spatial.graph.facts.some((fact) => fact.kind === 'Y_ABOVE')).toBe(true)
    expect(order.status).toBe('INSUFFICIENT_EVIDENCE')
    expect(order).not.toHaveProperty('sequence')
  })

  it('resolves zero-fact singleton but abstains on valid zero-fact multi-group', () => {
    const single = resolved(one)
    const multi = resolved(touching)
    expect(single.spatial.status === 'RESOLVED' && single.spatial.graph.facts).toEqual([])
    expect(multi.spatial.status === 'RESOLVED' && multi.spatial.graph.facts).toEqual([])
    expect(single.order.status).toBe('RESOLVED')
    expect(multi.order.status).toBe('INSUFFICIENT_EVIDENCE')
  })

  it('does not turn reversed VisualGroup input order into a reading tie-break', () => {
    const forward = resolved(disjoint, 1, [0, 1])
    const backward = resolved(disjoint, 1, [1, 0])
    expect(forward.input.visualGroups.status === 'RESOLVED' && forward.input.visualGroups.groups.map((group) => group.groupId))
      .toEqual(['visual:0', 'visual:1'])
    expect(backward.input.visualGroups.status === 'RESOLVED' && backward.input.visualGroups.groups.map((group) => group.groupId))
      .toEqual(['visual:1', 'visual:0'])
    expect(backward.order).toEqual(forward.order)
    expect(backward.order).not.toHaveProperty('sequence')
  })

  it('rejects a sequence, including a partial or input-order sequence, on insufficiency', () => {
    const { input, spatial, order } = resolved(disjoint)
    for (const sequence of [[], ['visual:0'], ['visual:0', 'visual:1'], ['visual:1', 'visual:0']]) {
      expect(readingOrderResultIssues(input, spatial, { ...order, sequence })).toContain('INVALID_INSUFFICIENCY')
    }
    expect(readingOrderResultIssues(input, spatial, { ...order, orderedGroups: ['visual:0', 'visual:1'] }))
      .toContain('INVALID_INSUFFICIENCY')
  })

  it('rejects fabricated, repeated, omitted, or foreign singleton identity', () => {
    const { input, spatial, order } = resolved(one)
    for (const sequence of [[], ['visual:0', 'visual:0'], ['visual:foreign']]) {
      expect(readingOrderResultIssues(input, spatial, { ...order, sequence })).toContain('INVALID_RESOLVED_SEQUENCE')
    }
    expect(readingOrderResultIssues(input, spatial, { ...order, pageNumber: 2 })).toContain('PAGE_IDENTITY_MISMATCH')
  })

  it('rejects a forged RESOLVED sequence for an admitted multi-group page', () => {
    const { input, spatial } = fixture(disjoint)
    expect(readingOrderResultIssues(input, spatial, {
      status: 'RESOLVED', pageNumber: 1, sequence: ['visual:0', 'visual:1'],
    })).toContain('INVALID_RESOLVED_SEQUENCE')
    expect(readingOrderResultIssues(input, spatial, {
      status: 'RESOLVED', pageNumber: 1, sequence: ['visual:0'],
    })).toContain('INVALID_RESOLVED_SEQUENCE')
  })

  it('fails admission for missing nodes, evidence mismatch, and non-resolved spatial input', () => {
    const { input, spatial } = fixture(disjoint)
    if (spatial.status !== 'RESOLVED') throw new Error('Invalid fixture')
    const malformed: SpatialStructureResult = { ...spatial, graph: { ...spatial.graph, nodes: spatial.graph.nodes.slice(1) } }
    expect(spatialResultIssues(input, malformed)).toContain('MISSING_NODE')
    expect(formReadingOrderV1(input, malformed)).toMatchObject({ status: 'FAILED', code: 'INVALID_INPUT_STRUCTURE' })
    const stale = { ...input, visualGroups: { ...input.visualGroups } }
    expect(formReadingOrderV1(stale, spatial).status).toBe('FAILED')
    expect(formReadingOrderV1(input, { status: 'FAILED', pageNumber: 1, code: 'INVALID_SPATIAL_GRAPH' }).status).toBe('FAILED')
    expect(formReadingOrderV1(input, { status: 'INSUFFICIENT_EVIDENCE', pageNumber: 1,
      diagnostic: { code: 'NODE_GEOMETRY_UNAVAILABLE' } }).status).toBe('FAILED')
  })

  it('rejects unresolved PageLayout or VisualGroups without calling it normal Reading Order ambiguity', () => {
    const { input, spatial } = fixture(one)
    const unavailable = { ...input, evidence: { status: 'UNAVAILABLE', pageNumber: 1,
      stage: 'vertical-calibration', code: 'INSUFFICIENT_CALIBRATION' } as const }
    const unresolved = { ...input, visualGroups: { status: 'INSUFFICIENT_EVIDENCE', pageNumber: 1,
      diagnostic: { reasonCode: 'INSUFFICIENT_CONTEXT' } } as const }
    expect(canAdmitReadingOrder(unavailable, spatial)).toBe(false)
    expect(canAdmitReadingOrder(unresolved, spatial)).toBe(false)
    expect(formReadingOrderV1(unavailable, spatial).status).toBe('FAILED')
    expect(formReadingOrderV1(unresolved, spatial).status).toBe('FAILED')
  })

  it('distinguishes runtime/internal FAILED from valid multi-group ambiguity', () => {
    const page = fixture(disjoint)
    const failure: ReadingOrderV1Result = { status: 'FAILED', pageNumber: 1, code: 'RUNTIME_FAILURE' }
    expect(readingOrderResultIssues(page.input, page.spatial, failure)).toEqual([])
    expect(failure).not.toHaveProperty('sequence')
    expect(formReadingOrderV1(page.input, page.spatial).status).toBe('INSUFFICIENT_EVIDENCE')
  })

  it('admits Serialization only for a validated RESOLVED result', () => {
    const single = resolved(one)
    const multi = resolved(disjoint)
    expect(maySerialize(single.input, single.spatial, single.order)).toBe(true)
    expect(maySerialize(multi.input, multi.spatial, multi.order)).toBe(false)
    expect(maySerialize(single.input, single.spatial, { status: 'FAILED', pageNumber: 1, code: 'RUNTIME_FAILURE' })).toBe(false)
    expect(maySerialize(single.input, single.spatial, { ...single.order, sequence: ['visual:foreign'] })).toBe(false)
  })

  it('projects only page, group count, and stable issue code; rejects leaked content and exception detail', () => {
    const page = resolved(disjoint)
    expect(projectReadingOrderDiagnostic(page.input, page.spatial, page.order)).toEqual({
      pageNumber: 1, code: 'NO_APPROVED_PRECEDENCE_SIGNAL', groupCount: 2,
    })
    const leaked = { ...page.order, rawText: 'name@example.invalid', errorMessage: 'C:\\private\\resume.pdf' }
    expect(readingOrderResultIssues(page.input, page.spatial, leaked)).toContain('INVALID_INSUFFICIENCY')
    expect(projectReadingOrderDiagnostic(page.input, page.spatial, leaked)).toBeNull()
  })

  it('is deterministic and does not mutate admitted upstream evidence or page arrays', () => {
    const boxes = [...disjoint]
    const page = fixture(boxes)
    const before = JSON.stringify({ boxes, input: page.input, spatial: page.spatial })
    const first = formReadingOrderV1(page.input, page.spatial)
    const second = formReadingOrderV1(page.input, page.spatial)
    expect(second).toEqual(first)
    expect(JSON.stringify({ boxes, input: page.input, spatial: page.spatial })).toBe(before)
  })
})

describe('RP-098 page-scoped cause and validity classification (production)', () => {
  it('preserves the new PDF cause separately from layout, VisualGroup, extraction, and operational failure', () => {
    const page = resolved(disjoint)
    const cause = causeForReadingOrder(page.input, page.spatial, page.order)
    expect(cause).toEqual(insufficientCause())
    expect(cause).not.toHaveProperty('status')
    expect(cause).not.toHaveProperty('fallbackEligible')
    expect(cause?.code).not.toBe('PDF_VISUAL_GROUP_INSUFFICIENT')
    expect(cause?.code).not.toBe('PDF_LAYOUT_EVIDENCE_UNAVAILABLE')
    expect(cause?.code).not.toBe('PDF_TEXT_EXTRACTION_FAILED')
    expect(cause?.code).not.toBe('PDF_READING_ORDER_FAILED')
    const single = resolved(one)
    expect(causeForReadingOrder(single.input, single.spatial, single.order)).toBeNull()
  })

  it.each([undefined, 0, -1, NaN, 1.5, '1'])('rejects missing or malformed page scope %s', (pageNumber) => {
    expect(validReadingOrderCause({ format: 'pdf', code: 'PDF_READING_ORDER_INSUFFICIENT', pageNumber })).toBe(false)
  })

  it('rejects DOCX, extra routing flags, and raw exception data in a cause record', () => {
    expect(validReadingOrderCause(insufficientCause(2))).toBe(true)
    expect(validReadingOrderCause({ ...insufficientCause(), format: 'docx' })).toBe(false)
    expect(validReadingOrderCause({ ...insufficientCause(), fallbackEligible: true })).toBe(false)
    expect(validReadingOrderCause({ ...failedCause(), message: 'Private resume text' })).toBe(false)
  })

  it('classifies confirmed-valid, normal insufficiency as fallback-eligible insufficient structure', () => {
    const cause = insufficientCause(2)
    const validity = validPdfClaims(2)
    const before = JSON.stringify({ cause, validity })
    expect(classify(cause, validity)).toEqual({
      status: 'FALLBACK_ELIGIBLE', reason: 'INSUFFICIENT_STRUCTURE', cause: cause.code,
    })
    expect(JSON.stringify({ cause, validity })).toBe(before)
  })

  it.each(['FILE', 'DOCUMENT', 'PAGE', 'CONTENT'] as const)('blocks fallback when %s validity is missing', (scope) => {
    const validity = validPdfClaims(2).filter((claim) => claim.scope !== scope)
    expect(classify(insufficientCause(2), validity)).toEqual({
      status: 'CLASSIFICATION_REQUIRED', need: 'NEEDS_VALIDITY_CLASSIFIER', cause: 'PDF_READING_ORDER_INSUFFICIENT',
    })
  })

  it.each(['FILE', 'DOCUMENT', 'PAGE', 'CONTENT'] as const)('blocks fallback when %s validity is UNKNOWN', (scope) => {
    const validity = validPdfClaims(2).map((claim) => claim.scope === scope ? { ...claim, state: 'UNKNOWN' as const } : claim)
    expect(classify(insufficientCause(2), validity)).toMatchObject({
      status: 'CLASSIFICATION_REQUIRED', need: 'NEEDS_VALIDITY_CLASSIFIER',
    })
  })

  it.each(['FILE', 'DOCUMENT', 'PAGE', 'CONTENT'] as const)('never treats %s CONFIRMED_INVALID as fallback-valid', (scope) => {
    const validity = validPdfClaims(2).map((claim) => scope === claim.scope ? { ...claim, state: 'CONFIRMED_INVALID' as const } : claim)
    expect(classify(insufficientCause(2), validity)).toMatchObject({ status: 'HARD_FAILURE', reason: 'DOCUMENT_UNREADABLE' })
  })

  it('does not borrow the page validity claim from a different page', () => {
    expect(classify(insufficientCause(2), validPdfClaims(1))).toMatchObject({
      status: 'CLASSIFICATION_REQUIRED', need: 'NEEDS_VALIDITY_CLASSIFIER',
    })
  })

  it('does not let an abnormal implementation claim evidence insufficiency as fallback', () => {
    expect(classify(insufficientCause(), validPdfClaims(1), 'FAILED')).toEqual({
      status: 'CLASSIFICATION_REQUIRED', need: 'NEEDS_CAUSE_SPLIT', cause: 'PDF_READING_ORDER_INSUFFICIENT',
    })
  })

  it('preserves a distinct Reading Order operational failure as hard parser failure', () => {
    const page = fixture(disjoint)
    const failure: ReadingOrderV1Result = { status: 'FAILED', pageNumber: 1, code: 'RUNTIME_FAILURE' }
    expect(causeForReadingOrder(page.input, page.spatial, failure)).toEqual(failedCause())
    expect(classify(failedCause(), validPdfClaims(1))).toEqual({
      status: 'HARD_FAILURE', reason: 'PARSER_FAILURE', cause: 'PDF_READING_ORDER_FAILED',
    })
    expect(classify(failedCause(), [])).toMatchObject({ status: 'HARD_FAILURE', reason: 'PARSER_FAILURE' })
  })

  it('prohibits reverse inference from either legacy public error code', () => {
    expect(() => causeFromLegacyCode('SCANNED_PDF')).toThrow()
    expect(() => causeFromLegacyCode('PARSE_FAILED')).toThrow()
    expect(insufficientCause().code).not.toBe('SCANNED_PDF')
    expect(insufficientCause().code).not.toBe('PARSE_FAILED')
  })
})

const classifyDocumentCauses = (causes: readonly ReadingOrderCause[], validity: readonly ValidityClaim[]) => (
  classifyDocument({ causes, validity, implementation: 'NORMAL', alternatePath: 'UNKNOWN' })
)

// Scenario bridge only: both the primary-cause choice and its reason come from production classifiers.
const outcomeFromCauses = (causes: readonly ReadingOrderCause[], validity: readonly ValidityClaim[]) => {
  const document = classifyDocumentCauses(causes, validity)
  const primary = causes.find((cause) => cause.code === document.primaryCause)
  if (!primary) throw new RoutingClassificationRequired()
  const classified = classify(primary, validity)
  let aggregate: StageAggregate
  if (document.status === 'FALLBACK_ELIGIBLE' && classified.status === 'FALLBACK_ELIGIBLE') {
    aggregate = { status: 'FALLBACK_ELIGIBLE', reason: classified.reason }
  } else if (document.status === 'HARD_FAILURE' && classified.status === 'HARD_FAILURE') {
    aggregate = { status: 'HARD_FAILURE', reason: classified.reason, retryClass: 'UNCLASSIFIED' }
  } else throw new RoutingClassificationRequired()
  return { document, aggregate, outcome: createDocumentOutcome({ aggregate, parserVersion: 'rp-098-test' }) }
}

describe('RP-098 whole-document outcome and atomicity (production foundations)', () => {
  it('keeps two resolved page orders page-local and requires downstream completion for success', () => {
    const pages = [resolved(one, 1), resolved(one, 2)]
    expect(pages.map((page) => page.order.status)).toEqual(['RESOLVED', 'RESOLVED'])
    const aggregate: StageAggregate = { status: 'SUCCESS' }
    expect(() => createDocumentOutcome({ aggregate, parserVersion: 'rp-098-test', profile: partialProfile(),
      completedStages: { ...completeStages, serialization: false } })).toThrow(RoutingClassificationRequired)
    const outcome = createDocumentOutcome({ aggregate, parserVersion: 'rp-098-test', profile: partialProfile(),
      completedStages: completeStages })
    expect(outcome.status).toBe('DETERMINISTIC_SUCCESS')
    expect(validateResumeParseOutcome(outcome).valid).toBe(true)
  })

  it('makes page 1 success plus page 2 valid insufficiency a whole-document fallback without a candidate', () => {
    const first = resolved(one, 1)
    const second = resolved(disjoint, 2)
    expect(first.order.status).toBe('RESOLVED')
    const cause = causeForReadingOrder(second.input, second.spatial, second.order)
    if (!cause) throw new Error('Expected page 2 cause')
    const { document, aggregate, outcome } = outcomeFromCauses([cause], validPdfClaims(2))
    expect(document).toMatchObject({ status: 'FALLBACK_ELIGIBLE', primaryCause: 'PDF_READING_ORDER_INSUFFICIENT' })
    expect(aggregate).toEqual({ status: 'FALLBACK_ELIGIBLE', reason: 'INSUFFICIENT_STRUCTURE' })
    expect(outcome).toMatchObject({ status: 'FALLBACK_ELIGIBLE', reason: 'INSUFFICIENT_STRUCTURE' })
    expect(outcome).not.toHaveProperty('candidate')
    expect(outcome).not.toHaveProperty('externalSendAuthorized')
    expect(validateResumeParseOutcome({ ...outcome, candidate: partialProfile() }).valid).toBe(false)
    expect(() => createDocumentOutcome({ aggregate, parserVersion: 'rp-098-test', profile: partialProfile() }))
      .toThrow(RoutingClassificationRequired)
  })

  it('lets a hard Reading Order failure outrank valid insufficiency regardless of cause array order', () => {
    const insufficient = resolved(disjoint, 1)
    const other = fixture(disjoint, 2)
    const failed: ReadingOrderV1Result = { status: 'FAILED', pageNumber: 2, code: 'RUNTIME_FAILURE' }
    const fallback = causeForReadingOrder(insufficient.input, insufficient.spatial, insufficient.order)
    const hard = causeForReadingOrder(other.input, other.spatial, failed)
    if (!fallback || !hard) throw new Error('Expected two causes')
    const validity = [...validPdfClaims(1), { scope: 'PAGE', predicate: 'PAGE_STRUCTURE_VALID', state: 'CONFIRMED_VALID', pageNumber: 2 } as const]
    const forward = outcomeFromCauses([fallback, hard], validity)
    const backward = outcomeFromCauses([hard, fallback], validity)
    expect(forward.document).toEqual(backward.document)
    expect(forward.document).toMatchObject({ status: 'HARD_FAILURE', primaryCause: 'PDF_READING_ORDER_FAILED' })
    expect(forward.aggregate).toEqual({ status: 'HARD_FAILURE', reason: 'PARSER_FAILURE', retryClass: 'UNCLASSIFIED' })
    expect(forward.outcome.status).toBe('HARD_FAILURE')
    expect(forward.outcome).not.toHaveProperty('candidate')
    expect(forward.outcome).not.toHaveProperty('externalSendAuthorized')
  })

  it('keeps unknown validity as a classification gate, not fallback or partial success', () => {
    const page = resolved(disjoint)
    const cause = causeForReadingOrder(page.input, page.spatial, page.order)
    if (!cause) throw new Error('Expected cause')
    const unknown = validPdfClaims(1).filter((claim) => claim.scope !== 'CONTENT')
    expect(classifyDocumentCauses([cause], unknown).status).toBe('CLASSIFICATION_REQUIRED')
    expect(() => outcomeFromCauses([cause], unknown)).toThrow(RoutingClassificationRequired)
  })

  it('does not promote a singleton Reading Order result alone to document success', () => {
    const page = resolved(one)
    expect(page.order.status).toBe('RESOLVED')
    expect(() => createDocumentOutcome({ aggregate: { status: 'SUCCESS' }, parserVersion: 'rp-098-test',
      profile: partialProfile() })).toThrow(RoutingClassificationRequired)
  })

  it('does not merge a deterministic page with page-level AI or expose a partial ResumeProfile', () => {
    const first = resolved(one, 1)
    const second = resolved(disjoint, 2)
    expect(first.order.status).toBe('RESOLVED')
    const cause = causeForReadingOrder(second.input, second.spatial, second.order)
    if (!cause) throw new Error('Expected cause')
    const { outcome } = outcomeFromCauses([cause], validPdfClaims(2))
    expect(outcome.status).toBe('FALLBACK_ELIGIBLE')
    expect(outcome).not.toHaveProperty('candidate')
    expect(outcome).not.toHaveProperty('aiPages')
    expect(validateResumeParseOutcome({ ...outcome, aiPages: [{ pageNumber: 2 }] }).valid).toBe(false)
    expect(validateResumeParseOutcome({ ...outcome, candidate: partialProfile() }).valid).toBe(false)
  })

  it('does not mutate validity claims, cause observations, or document cause arrays', () => {
    const cause = insufficientCause()
    const claims = validPdfClaims(1)
    const causes = [cause]
    const before = JSON.stringify({ causes, claims })
    expect(classify(cause, claims).status).toBe('FALLBACK_ELIGIBLE')
    expect(outcomeFromCauses(causes, claims).outcome.status).toBe('FALLBACK_ELIGIBLE')
    expect(JSON.stringify({ causes, claims })).toBe(before)
  })
})
