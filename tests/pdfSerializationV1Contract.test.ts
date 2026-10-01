import { describe, expect, it } from 'vitest'
import { aggregateClassifiedStages, createDocumentOutcome, RoutingClassificationRequired,
  validateResumeParseOutcome, type ClassifiedStage } from '../src/parsers/resumeDocumentOutcome'
import { causeForSerialization, classifyCause, validateCause, type SerializationCause,
  type ValidityClaim } from '../src/parsers/resumeParserCause'
import {
  canRunLegacyResumeAdapter, composeSerializedDocument, projectSerializationDiagnostic,
  serializationResultIssues, serializePageV1, serializedDocumentIssues, serializedPageIssues,
  serializedTextUnitIssues, type PdfPageManifest, type PdfSerializationInput,
  type PdfSerializationResult, type PdfSerializedPageEntry,
} from '../src/parsers/pdfSerialization'
import type { ResumeProfile } from '../src/types'
import { pageFixture } from './helpers/pdfSerializationV1ContractHarness'
import { validPdfClaims } from './helpers/pdfReadingOrderV1ContractHarness'

const serialize = (fixture: PdfSerializationInput): PdfSerializationResult => {
  const result = serializePageV1(fixture)
  if (!result) throw new Error('Fixture did not reach Serialization')
  return result
}
const classifySerializationCause = (cause: SerializationCause, validity: readonly ValidityClaim[],
  implementation: 'NORMAL' | 'FAILED' = 'NORMAL') => classifyCause({
  cause, validity, implementation, alternatePath: 'UNKNOWN',
})
const manifest = (pageCount: number): PdfPageManifest => ({
  pageCount, canonicalPageNumbers: Array.from({ length: pageCount }, (_, index) => index + 1),
})
const entry = (source: PdfSerializationInput): PdfSerializedPageEntry => ({ source, result: serialize(source) })
const composeDocument = (pageCount: number, entries: readonly PdfSerializedPageEntry[]) =>
  composeSerializedDocument(manifest(pageCount), entries)
const insufficient = (pageNumber = 1): SerializationCause => ({
  format: 'pdf', code: 'PDF_SERIALIZATION_INSUFFICIENT', pageNumber,
})
const failure = (pageNumber = 1): SerializationCause => ({
  format: 'pdf', code: 'PDF_SERIALIZATION_FAILED', pageNumber,
})
const profile = (): ResumeProfile => ({
  id: 'anonymous', name: 'Anonymous Example', skills: [], projects: [], workExperiences: [],
  education: { school: '', department: '', graduationStatus: '' }, careerDirections: [],
  updatedAt: '2026-09-27T00:00:00.000Z', level: 1, abilities: [],
})

describe('RP-101 page Serialization V1 contract (production)', () => {
  it('resolves one authoritative group/run to one page-local unit with canonical provenance', () => {
    const fixture = pageFixture(['hello'], { pageNumber: 2, groupId: 'visual:single' })
    expect(fixture.order).toEqual({ status: 'RESOLVED', pageNumber: 2, sequence: ['visual:single'] })
    const result = serialize(fixture)
    expect(result).toEqual({ status: 'RESOLVED', pageNumber: 2,
      page: { pageNumber: 2, orderedUnits: [{ groupId: 'visual:single', runId: 0, text: 'hello' }] } })
    expect(serializationResultIssues(fixture, result)).toEqual([])
  })

  it.each(['hello', ' hello ', 'hello  world', '\tfoo', '\nfoo', '', ' ', '   ', '\t'])
  ('preserves the exact canonical JavaScript string %j', (text) => {
    const fixture = pageFixture([text])
    const result = serialize(fixture)
    expect(result.status).toBe('RESOLVED')
    if (result.status !== 'RESOLVED') return
    expect(result.page.orderedUnits[0]?.text).toBe(text)
    expect(result.page.orderedUnits).toHaveLength(1)
    expect(serializationResultIssues(fixture, result)).toEqual([])
  })

  it('does not infer invalid PDF, low text, or insufficiency from an empty unit', () => {
    const fixture = pageFixture([''])
    const result = serialize(fixture)
    expect(result.status).toBe('RESOLVED')
    expect(causeForSerialization(fixture, result)).toBeNull()
  })

  it.each([undefined, null, 7, {}, ['text']])('fails when canonical run text is missing or non-string: %j', (text) => {
    const fixture = pageFixture(['valid'])
    if (fixture.input.evidence.status !== 'AVAILABLE') throw new Error('Invalid fixture')
    const run = fixture.input.evidence.graph.runs[0] as unknown as Record<string, unknown>
    if (text === undefined) delete run.text
    else run.text = text
    const result = serialize(fixture)
    expect(result).toEqual({ status: 'FAILED', pageNumber: 1, code: 'INVALID_INPUT_STRUCTURE' })
    expect(result).not.toHaveProperty('page')
  })

  it('abstains atomically on a valid two-run group without internal order or separator evidence', () => {
    const fixture = pageFixture(['left', 'right'])
    expect(fixture.order.status).toBe('RESOLVED')
    const result = serialize(fixture)
    expect(result).toEqual({ status: 'INSUFFICIENT_EVIDENCE', pageNumber: 1,
      diagnostic: { code: 'INTERNAL_ORDER_UNPROVEN', groupCount: 1, runCount: 2 } })
    expect(result).not.toHaveProperty('page')
    expect(JSON.stringify(result)).not.toContain('left')
    expect(JSON.stringify(result)).not.toContain('right')
  })

  it('does not promote run array permutation to textual authority', () => {
    const fixture = pageFixture(['left', 'right'])
    const before = serialize(fixture)
    if (fixture.input.evidence.status !== 'AVAILABLE') throw new Error('Invalid fixture')
    ;(fixture.input.evidence.graph.runs as unknown as unknown[]).reverse()
    expect(serialize(fixture)).toEqual(before)
    if (fixture.input.visualGroups.status !== 'RESOLVED') throw new Error('Invalid fixture')
    ;(fixture.input.visualGroups.groups[0]?.runIds as unknown as number[]).reverse()
    expect(serialize(fixture)).toEqual(before)
  })

  it.each([
    { positions: [{ x: 20, y: 700 }, { x: 40, y: 700 }] },
    { positions: [{ x: 40, y: 700 }, { x: 20, y: 700 }] },
  ])('does not let geometry or a guessed separator rescue multi-run order', ({ positions }) => {
    const result = serialize(pageFixture(['one', 'two'], { positions }))
    expect(result.status).toBe('INSUFFICIENT_EVIDENCE')
    expect(result).not.toHaveProperty('page')
    for (const joined of ['onetwo', 'one two', 'one\ntwo', 'one\ttwo']) {
      expect(JSON.stringify(result)).not.toContain(joined)
    }
  })

  it('ignores coordinate scale and translation once the authoritative references are fixed', () => {
    const original = serialize(pageFixture(['text'], { positions: [{ x: 20, y: 700 }] }))
    const changed = serialize(pageFixture(['text'], { positions: [{ x: 320, y: 200 }], scale: 2 }))
    expect(changed).toEqual(original)
  })

  it('rejects a forged text, run, group, page, or extra private field in a RESOLVED result', () => {
    const fixture = pageFixture(['private@example.invalid'])
    const result = serialize(fixture)
    if (result.status !== 'RESOLVED') throw new Error('Invalid fixture')
    const unit = result.page.orderedUnits[0]
    expect(unit).toBeDefined()
    if (!unit) throw new Error('Invalid fixture')
    for (const changed of [
      { ...result, page: { ...result.page, orderedUnits: [{ ...unit, text: 'forged' }] } },
      { ...result, page: { ...result.page, orderedUnits: [{ ...unit, runId: 99 }] } },
      { ...result, page: { ...result.page, orderedUnits: [{ ...unit, groupId: 'foreign' }] } },
      { ...result, page: { ...result.page, pageNumber: 2 } },
      { ...result, rawText: 'private@example.invalid' },
    ]) expect(serializationResultIssues(fixture, changed)).not.toEqual([])
  })

  it('fails on wrong Reading Order group reference or page identity', () => {
    const fixture = pageFixture(['text'])
    expect(serialize({ ...fixture, order: { status: 'RESOLVED', pageNumber: 1, sequence: ['foreign'] } }).status).toBe('FAILED')
    expect(serialize({ ...fixture, order: { status: 'RESOLVED', pageNumber: 2, sequence: ['visual:whole'] } }).status).toBe('FAILED')
  })

  it('uses the admitted source page for malformed Reading Order failure', () => {
    const fixture = pageFixture(['text'], { pageNumber: 3 })
    const result = serialize({ ...fixture, order: {} as PdfSerializationInput['order'] })
    expect(result).toEqual({ status: 'FAILED', pageNumber: 3, code: 'INVALID_INPUT_STRUCTURE' })
    expect(causeForSerialization({ ...fixture, order: {} as PdfSerializationInput['order'] }, result)).toEqual(failure(3))
  })

  it('fails on wrong run reference and stale evidence binding', () => {
    const wrongRun = pageFixture(['text'])
    if (wrongRun.input.visualGroups.status !== 'RESOLVED') throw new Error('Invalid fixture')
    ;(wrongRun.input.visualGroups.groups[0]?.runIds as unknown as number[]).splice(0, 1, 99)
    expect(serialize(wrongRun).status).toBe('FAILED')
    const stale = pageFixture(['text'])
    expect(serialize({ ...stale, input: { ...stale.input } }).status).toBe('FAILED')
  })

  it('does not execute after either upstream non-resolved Reading Order state', () => {
    const fixture = pageFixture(['text'])
    expect(serializePageV1({ ...fixture, order: { status: 'INSUFFICIENT_EVIDENCE', pageNumber: 1,
      diagnostic: { code: 'NO_APPROVED_PRECEDENCE_SIGNAL', groupCount: 2 } } })).toBeNull()
    expect(serializePageV1({ ...fixture, order: { status: 'FAILED', pageNumber: 1, code: 'RUNTIME_FAILURE' } })).toBeNull()
  })

  it('rejects a fabricated partial page on insufficiency', () => {
    const fixture = pageFixture(['first', 'second'])
    const result = serialize(fixture)
    expect(serializationResultIssues(fixture, { ...result, page: {
      pageNumber: 1, orderedUnits: [{ groupId: 'visual:whole', runId: 0, text: 'first' }],
    } })).toContain('INVALID_INSUFFICIENCY')
  })

  it('allows functional text but projects only stable, privacy-safe diagnostics', () => {
    const secret = 'Ada ada@example.invalid +886-987-654-321 PrivateCompany PrivateSchool'
    const fixture = pageFixture([secret])
    const result = serialize(fixture)
    expect(result.status === 'RESOLVED' && result.page.orderedUnits[0]?.text).toBe(secret)
    const diagnostic = projectSerializationDiagnostic(fixture, result)
    expect(diagnostic).toEqual({ pageNumber: 1, code: 'RESOLVED', unitCount: 1 })
    expect(JSON.stringify(diagnostic)).not.toContain(secret)
    expect(projectSerializationDiagnostic(fixture, { ...result, errorMessage: 'C:\\private\\resume.pdf' })).toBeNull()
    const ambiguous = pageFixture([secret, 'other'])
    expect(JSON.stringify(projectSerializationDiagnostic(ambiguous, serialize(ambiguous)))).not.toContain(secret)
  })

  it('is deterministic, permutation-safe for singleton containers, and does not mutate inputs', () => {
    const fixture = pageFixture(['text'])
    const before = structuredClone({ input: fixture.input, spatial: fixture.spatial, order: fixture.order })
    const first = serialize(fixture)
    expect(serialize(fixture)).toEqual(first)
    expect({ input: fixture.input, spatial: fixture.spatial, order: fixture.order }).toEqual(before)
  })
})

describe('RP-101 document composition and adapter admission (production)', () => {
  it('composes complete pages in validated PDF page order, not arrival/text/geometry order', () => {
    const pages = [
      entry(pageFixture(['zzz'], { pageNumber: 3, positions: [{ x: 0, y: 999 }] })),
      entry(pageFixture(['aaa'], { pageNumber: 1, positions: [{ x: 500, y: 10 }] })),
      entry(pageFixture(['mmm'], { pageNumber: 2, positions: [{ x: 100, y: 500 }] })),
    ]
    const document = composeDocument(3, pages)
    expect(document?.pages.map((page) => page.pageNumber)).toEqual([1, 2, 3])
    expect(document?.pages.map((page) => page.orderedUnits[0]?.text)).toEqual(['aaa', 'mmm', 'zzz'])
    expect(document).not.toHaveProperty('text')
    expect(serializedDocumentIssues(manifest(3), pages, document)).toEqual([])
    expect(canRunLegacyResumeAdapter(manifest(3), pages, document)).toBe(true)
  })

  it('rejects missing, duplicate, foreign, and unresolved critical pages', () => {
    const one = entry(pageFixture(['one'], { pageNumber: 1 }))
    const two = entry(pageFixture(['two'], { pageNumber: 2 }))
    const uncertain = entry(pageFixture(['x', 'y'], { pageNumber: 2 }))
    expect(composeDocument(3, [one, two])).toBeNull()
    expect(composeDocument(2, [one, one])).toBeNull()
    expect(composeDocument(2, [one, entry(pageFixture(['three'], { pageNumber: 3 }))])).toBeNull()
    expect(composeDocument(2, [one, uncertain])).toBeNull()
    expect(composeSerializedDocument({ pageCount: 2, canonicalPageNumbers: [2, 1] }, [one, two])).toBeNull()
  })

  it('rejects a forged resolved page payload or mismatched page identity', () => {
    const source = pageFixture(['text'])
    const result = serialize(source)
    if (result.status !== 'RESOLVED') throw new Error('Invalid fixture')
    expect(composeDocument(1, [{ source, result: { ...result, page: { ...result.page, pageNumber: 2 } } }])).toBeNull()
    expect(composeDocument(1, [{ source, result: { ...result, page: { ...result.page, orderedUnits: [] } } }])).toBeNull()
    expect(composeDocument(1, [{ source, result: { ...result, page: { ...result.page, orderedUnits: [
      { groupId: 'visual:whole', runId: 0, text: undefined },
    ] } } as unknown as PdfSerializationResult }])).toBeNull()
  })

  it('gates the future legacy adapter on page RESOLVED without flattening or choosing separators', () => {
    const single = pageFixture(['text'])
    const multi = pageFixture(['x', 'y'])
    const resolved = serialize(single)
    const insufficientResult = serialize(multi)
    const failedResult: PdfSerializationResult = { status: 'FAILED', pageNumber: 1, code: 'RUNTIME_FAILURE' }
    expect(canRunLegacyResumeAdapter(single, resolved)).toBe(true)
    expect(canRunLegacyResumeAdapter(multi, insufficientResult)).toBe(false)
    expect(canRunLegacyResumeAdapter(single, failedResult)).toBe(false)
    expect(composeDocument(1, [{ source: single, result: resolved }]))
      .toEqual({ pages: [resolved.status === 'RESOLVED' ? resolved.page : null] })
  })
})

describe('RP-101 cause, validity, and whole-document routing contract (production)', () => {
  it('keeps Serialization insufficiency and failure distinct from Reading Order and legacy codes', () => {
    const ambiguous = pageFixture(['a', 'b'])
    expect(causeForSerialization(ambiguous, serialize(ambiguous))).toEqual(insufficient())
    const malformed = pageFixture(['text'])
    const broken = { ...malformed, order: {} as PdfSerializationInput['order'] }
    expect(causeForSerialization(broken, serialize(broken))).toEqual(failure())
    expect(insufficient().code).not.toBe('PDF_READING_ORDER_INSUFFICIENT')
    expect(failure().code).not.toBe('PDF_READING_ORDER_FAILED')
    expect(insufficient().code).not.toBe('SCANNED_PDF')
    expect(failure().code).not.toBe('PARSE_FAILED')
    expect(insufficient()).not.toHaveProperty('fallbackEligible')
  })

  it.each([undefined, 0, -1, 1.5, NaN, '1'])('rejects malformed page scope %j for both causes', (pageNumber) => {
    expect(validateCause({ ...insufficient(), pageNumber })).toBe(false)
    expect(validateCause({ ...failure(), pageNumber })).toBe(false)
  })

  it('does not emit a page-local cause from an invalid page identity', () => {
    expect(() => causeForSerialization(pageFixture(['text']),
      { status: 'FAILED', pageNumber: 0, code: 'INVALID_INPUT_STRUCTURE' })).toThrow()
  })

  it('rejects foreign format and routing or private data in raw cause', () => {
    expect(validateCause(insufficient(2))).toBe(true)
    expect(validateCause(failure(2))).toBe(true)
    expect(validateCause({ ...insufficient(), format: 'docx' })).toBe(false)
    expect(validateCause({ ...insufficient(), fallbackEligible: true })).toBe(false)
    expect(validateCause({ ...failure(), message: 'private@example.invalid' })).toBe(false)
  })

  it('classifies all-confirmed-valid normal insufficiency as fallback-eligible insufficient structure', () => {
    const cause = insufficient(2)
    const validity = validPdfClaims(2)
    const before = structuredClone({ cause, validity })
    expect(classifySerializationCause(cause, validity)).toEqual({
      status: 'FALLBACK_ELIGIBLE', reason: 'INSUFFICIENT_STRUCTURE', cause: cause.code,
    })
    expect({ cause, validity }).toEqual(before)
  })

  it.each(['FILE', 'DOCUMENT', 'PAGE', 'CONTENT'] as const)('requires %s validity, including exact PAGE scope', (scope) => {
    const missing = validPdfClaims(2).filter((claim) => claim.scope !== scope)
    expect(classifySerializationCause(insufficient(2), missing).status).toBe('CLASSIFICATION_REQUIRED')
    const unknown: ValidityClaim[] = validPdfClaims(2).map((claim) => claim.scope === scope
      ? { ...claim, state: 'UNKNOWN' } : claim)
    expect(classifySerializationCause(insufficient(2), unknown)).toMatchObject({
      status: 'CLASSIFICATION_REQUIRED', need: 'NEEDS_VALIDITY_CLASSIFIER',
    })
    const invalid: ValidityClaim[] = validPdfClaims(2).map((claim) => claim.scope === scope
      ? { ...claim, state: 'CONFIRMED_INVALID' } : claim)
    expect(classifySerializationCause(insufficient(2), invalid)).toMatchObject({
      status: 'HARD_FAILURE', reason: 'DOCUMENT_UNREADABLE',
    })
  })

  it('cannot borrow page validity from a different page or hide an abnormal implementation', () => {
    expect(classifySerializationCause(insufficient(2), validPdfClaims(1))).toMatchObject({
      status: 'CLASSIFICATION_REQUIRED', need: 'NEEDS_VALIDITY_CLASSIFIER',
    })
    expect(classifySerializationCause(insufficient(), validPdfClaims(1), 'FAILED')).toMatchObject({
      status: 'CLASSIFICATION_REQUIRED', need: 'NEEDS_CAUSE_SPLIT',
    })
  })

  it('classifies internal Serialization failure as hard parser failure even without validity proof', () => {
    expect(classifySerializationCause(failure(), [])).toEqual({
      status: 'HARD_FAILURE', reason: 'PARSER_FAILURE', cause: 'PDF_SERIALIZATION_FAILED',
    })
  })

  it('makes one resolved page plus one insufficient page a whole-document fallback with no partial candidate', () => {
    const firstPage = pageFixture(['ok'], { pageNumber: 1 })
    const secondPage = pageFixture(['a', 'b'], { pageNumber: 2 })
    const first = serialize(firstPage)
    const second = serialize(secondPage)
    expect(first.status).toBe('RESOLVED')
    expect(composeDocument(2, [{ source: firstPage, result: first }, { source: secondPage, result: second }])).toBeNull()
    const cause = causeForSerialization(secondPage, second)
    if (!cause) throw new Error('Expected cause')
    const classified = classifySerializationCause(cause, validPdfClaims(2))
    if (classified.status !== 'FALLBACK_ELIGIBLE') throw new Error('Expected fallback classification')
    const stages: ClassifiedStage[] = [
      { status: 'SUCCESS', format: 'pdf', stage: 'serialization', pageNumber: 1 },
      { status: 'FALLBACK_ELIGIBLE', format: 'pdf', stage: 'serialization', pageNumber: 2,
        reason: classified.reason },
    ]
    const aggregate = aggregateClassifiedStages(stages)
    expect(aggregate).toEqual({ status: 'FALLBACK_ELIGIBLE', reason: 'INSUFFICIENT_STRUCTURE' })
    const outcome = createDocumentOutcome({ aggregate, parserVersion: 'rp-101-test' })
    expect(outcome.status).toBe('FALLBACK_ELIGIBLE')
    expect(outcome).not.toHaveProperty('candidate')
    expect(outcome).not.toHaveProperty('aiPages')
    expect(validateResumeParseOutcome({ ...outcome, candidate: profile() }).valid).toBe(false)
    expect(validateResumeParseOutcome({ ...outcome, aiPages: [{ pageNumber: 2 }] }).valid).toBe(false)
    expect(() => createDocumentOutcome({ aggregate, parserVersion: 'rp-101-test', profile: profile() }))
      .toThrow(RoutingClassificationRequired)
  })

  it('keeps hard failure above fallback above stage success independent of array order', () => {
    const stages: ClassifiedStage[] = [
      { status: 'SUCCESS', format: 'pdf', stage: 'serialization', pageNumber: 1 },
      { status: 'FALLBACK_ELIGIBLE', format: 'pdf', stage: 'serialization', pageNumber: 2,
        reason: 'INSUFFICIENT_STRUCTURE' },
      { status: 'HARD_FAILURE', format: 'pdf', stage: 'serialization', pageNumber: 3,
        reason: 'PARSER_FAILURE' },
    ]
    expect(aggregateClassifiedStages(stages)).toEqual(aggregateClassifiedStages([...stages].reverse()))
    expect(aggregateClassifiedStages(stages)).toEqual({
      status: 'HARD_FAILURE', reason: 'PARSER_FAILURE', retryClass: 'UNCLASSIFIED',
    })
  })

  it('does not promote a serialized page alone to deterministic document success', () => {
    expect(serialize(pageFixture(['text'])).status).toBe('RESOLVED')
    expect(() => createDocumentOutcome({ aggregate: { status: 'SUCCESS' }, parserVersion: 'rp-101-test',
      profile: profile() })).toThrow(RoutingClassificationRequired)
  })
})
