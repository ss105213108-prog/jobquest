import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { describe, expect, it } from 'vitest'
import { parseResumeFile, validateResumeFile } from '../src/parsers/resumeFileParser'
import type { ResumeProfile } from '../src/types'
import {
  aggregateClassifiedStages,
  createDocumentOutcome,
  projectSafeDiagnostic,
  RoutingClassificationRequired,
  validateCandidateEnvelope,
  validateResumeParseOutcome,
  type ClassifiedStage,
  type RequiredStageCompletion,
} from '../src/parsers/resumeDocumentOutcome'
import { anonymousPdfFile } from './helpers/anonymousPdfFactory'

GlobalWorkerOptions.workerSrc = pathToFileURL(resolve('node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs')).href

const anonymousCandidate = (): ResumeProfile => ({
  id: 'resume-anonymous',
  name: 'Avery Example',
  skills: ['TypeScript'],
  projects: [],
  workExperiences: [],
  education: { school: '', department: '', graduationStatus: '' },
  careerDirections: [],
  updatedAt: '2026-09-26T00:00:00.000Z',
  level: 1,
  abilities: [],
})

const allStagesComplete = {
  extraction: true,
  structure: true,
  serialization: true,
  domainParsing: true,
} as const
const unfinishedSerialization = { ...allStagesComplete, serialization: false }
const completePage = (pageNumber: number, format: 'pdf' | 'docx' = 'pdf'): ClassifiedStage => ({
  pageNumber, format, stage: format === 'pdf' ? 'visual-group' : 'docx-conversion', status: 'SUCCESS',
})
const eligiblePage = (pageNumber: number): ClassifiedStage => ({
  pageNumber, format: 'pdf', stage: 'visual-group', status: 'FALLBACK_ELIGIBLE', reason: 'INSUFFICIENT_STRUCTURE',
})
const hardPage = (pageNumber: number): ClassifiedStage => ({
  pageNumber, format: 'pdf', stage: 'visual-group', status: 'HARD_FAILURE', reason: 'PARSER_FAILURE',
})
const route = (pages: readonly ClassifiedStage[], candidate: ResumeProfile | undefined = anonymousCandidate(), stages: RequiredStageCompletion = allStagesComplete) => {
  const aggregate = aggregateClassifiedStages(pages)
  return createDocumentOutcome(aggregate.status === 'SUCCESS'
    ? { aggregate, parserVersion: 'test-v1', profile: candidate, completedStages: stages }
    : { aggregate, parserVersion: 'test-v1' })
}

describe('RP-079 document outcome contract', () => {
  it('requires a complete deterministic candidate and external provenance for success', () => {
    const result = route([completePage(1)])
    expect(result.status).toBe('DETERMINISTIC_SUCCESS')
    expect(validateResumeParseOutcome(result)).toEqual({ valid: true, issues: [] })
    if (result.status !== 'DETERMINISTIC_SUCCESS') throw new Error('Expected deterministic success')
    expect(result.candidate.profile.name).toBe('Avery Example')
    expect(result.candidate.provenance).toEqual({ source: 'DETERMINISTIC', parserVersion: 'test-v1' })
    expect(result).not.toHaveProperty('reason')
    expect(result.candidate.profile).not.toHaveProperty('provider')
    expect(result.candidate.profile).not.toHaveProperty('model')
  })

  it('rejects success without a candidate or with an incomplete candidate', () => {
    expect(() => createDocumentOutcome({
      aggregate: aggregateClassifiedStages([completePage(1)]), parserVersion: 'test-v1', completedStages: allStagesComplete,
    }))
      .toThrow(RoutingClassificationRequired)
    expect(() => route([completePage(1)], { name: 'Avery Example' } as ResumeProfile))
      .toThrow(RoutingClassificationRequired)
    expect(() => createDocumentOutcome({
      aggregate: { status: 'SUCCESS', reason: 'INSUFFICIENT_STRUCTURE' } as unknown as ReturnType<typeof aggregateClassifiedStages>,
      parserVersion: 'test-v1', profile: anonymousCandidate(), completedStages: allStagesComplete,
    })).toThrow(RoutingClassificationRequired)
    expect(validateResumeParseOutcome({
      status: 'DETERMINISTIC_SUCCESS',
      candidate: { profile: anonymousCandidate(), provenance: { source: 'DETERMINISTIC', parserVersion: 'test-v1' } },
      reason: 'INSUFFICIENT_STRUCTURE',
    }).valid).toBe(false)
  })

  it('keeps fallback and hard failure free of partial or fake success profiles', () => {
    const partial = anonymousCandidate()
    const fallback = route([completePage(1), eligiblePage(2)], partial)
    const hard = route([completePage(1), hardPage(2)], partial)
    expect(fallback).toMatchObject({ status: 'FALLBACK_ELIGIBLE', reason: 'INSUFFICIENT_STRUCTURE' })
    expect(hard).toMatchObject({ status: 'HARD_FAILURE', reason: 'PARSER_FAILURE' })
    expect(fallback).not.toHaveProperty('candidate')
    expect(hard).not.toHaveProperty('candidate')
    expect(validateResumeParseOutcome(fallback).valid).toBe(true)
    expect(validateResumeParseOutcome(hard).valid).toBe(true)
    expect(validateResumeParseOutcome({ ...fallback, candidate: partial }).valid).toBe(false)
    expect(validateResumeParseOutcome({ ...hard, candidate: partial }).valid).toBe(false)
    expect(() => createDocumentOutcome({ aggregate: aggregateClassifiedStages([eligiblePage(1)]), parserVersion: 'test-v1', profile: partial }))
      .toThrow(RoutingClassificationRequired)
    expect(() => createDocumentOutcome({ aggregate: aggregateClassifiedStages([hardPage(1)]), parserVersion: 'test-v1', profile: partial }))
      .toThrow(RoutingClassificationRequired)
  })

  it('prohibits hard-failure AI masking and defaults eligible cases to no external send', () => {
    const hard = route([hardPage(1)])
    const fallback = route([eligiblePage(1)])
    expect(hard).not.toHaveProperty('fallbackEligible')
    expect(fallback).not.toHaveProperty('externalSendAuthorized')
    expect(validateResumeParseOutcome({ ...hard, fallbackEligible: true }).valid).toBe(false)
    expect(validateResumeParseOutcome({ ...fallback, externalSendAuthorized: true }).valid).toBe(false)
  })

  it.each([
    { name: 'all pages succeed', pages: [completePage(1), completePage(2)], expected: 'DETERMINISTIC_SUCCESS' },
    { name: 'one insufficient page', pages: [completePage(1), eligiblePage(2)], expected: 'FALLBACK_ELIGIBLE' },
    { name: 'one failed page', pages: [completePage(1), hardPage(2)], expected: 'HARD_FAILURE' },
    { name: 'hard failure outranks fallback', pages: [eligiblePage(1), hardPage(2)], expected: 'HARD_FAILURE' },
    { name: 'multiple insufficient pages', pages: [eligiblePage(1), eligiblePage(2)], expected: 'FALLBACK_ELIGIBLE' },
  ])('$name aggregates the entire document', ({ pages, expected }) => {
    const result = route(pages)
    expect(result.status).toBe(expected)
    expect(validateResumeParseOutcome(result).valid).toBe(true)
  })

  it('keeps precedence and reason stable across page-order permutations', () => {
    const pages = [completePage(3), eligiblePage(1), hardPage(2)]
    const permutations = [
      [pages[0], pages[1], pages[2]], [pages[0], pages[2], pages[1]],
      [pages[1], pages[0], pages[2]], [pages[1], pages[2], pages[0]],
      [pages[2], pages[0], pages[1]], [pages[2], pages[1], pages[0]],
    ]
    const outcomes = permutations.map((ordered) => route(ordered))
    expect(outcomes.map((outcome) => outcome.status)).toEqual(Array(6).fill('HARD_FAILURE'))
    expect(outcomes.every((outcome) => JSON.stringify(outcome) === JSON.stringify(outcomes[0]))).toBe(true)
    expect(route([completePage(2), eligiblePage(1)]).status).toBe(route([eligiblePage(1), completePage(2)]).status)
  })

  it('requires downstream completion after a classified page-stage success', () => {
    const page = completePage(1)
    expect(page).toEqual(completePage(1))
    expect(aggregateClassifiedStages([page]).status).toBe('SUCCESS')
    expect(() => route([page], anonymousCandidate(), unfinishedSerialization))
      .toThrow(RoutingClassificationRequired)
    expect(() => route([page], anonymousCandidate(), { ...allStagesComplete, domainParsing: false }))
      .toThrow(RoutingClassificationRequired)
  })

  it.each(['extraction', 'structure', 'serialization', 'domainParsing'] as const)(
    '%s cannot be unfinished in a deterministic document success', (stage) => {
      expect(() => route([completePage(1)], anonymousCandidate(), { ...allStagesComplete, [stage]: false }))
        .toThrow(RoutingClassificationRequired)
    },
  )

  it('aggregates only already-classified fallback and hard stages', () => {
    expect(route([completePage(1), eligiblePage(2)])).toMatchObject({ status: 'FALLBACK_ELIGIBLE', reason: 'INSUFFICIENT_STRUCTURE' })
    expect(route([completePage(1), hardPage(2)])).toMatchObject({ status: 'HARD_FAILURE', reason: 'PARSER_FAILURE' })
    expect(() => aggregateClassifiedStages([{ ...completePage(2), status: 'VISUALGROUP_INSUFFICIENT' } as unknown as ClassifiedStage]))
      .toThrow(RoutingClassificationRequired)
  })

  it('refuses raw calibration, runtime, and zero-run signals without classification', () => {
    for (const status of ['CALIBRATION_UNAVAILABLE', 'PAGE_LAYOUT_RUNTIME_FAILURE', 'INVALID_INTERNAL_STRUCTURE', 'ZERO_TEXT']) {
      expect(() => aggregateClassifiedStages([{ ...completePage(1), status } as unknown as ClassifiedStage]))
        .toThrow(RoutingClassificationRequired)
    }
  })

  it('preserves distinct preclassified reasons without performing image-only detection', () => {
    expect(route([{ ...hardPage(1), reason: 'INPUT_REJECTED' }])).toMatchObject({ status: 'HARD_FAILURE', reason: 'INPUT_REJECTED' })
    expect(route([{ ...hardPage(1), reason: 'DOCUMENT_UNREADABLE' }])).toMatchObject({ status: 'HARD_FAILURE', reason: 'DOCUMENT_UNREADABLE' })
    expect(route([{ ...eligiblePage(1), reason: 'NO_USABLE_TEXT' }])).toMatchObject({ status: 'FALLBACK_ELIGIBLE', reason: 'NO_USABLE_TEXT' })
    expect(() => aggregateClassifiedStages([{ ...completePage(1), status: 'ZERO_TEXT' } as unknown as ClassifiedStage]))
      .toThrow(RoutingClassificationRequired)
  })

  it('rejects classification gates as document-page successes', () => {
    const gate = { ...completePage(1), status: 'ROUTING_REQUIRES_FUTURE_CLASSIFICATION' }
    expect(() => route([gate as unknown as ClassifiedStage])).toThrow(RoutingClassificationRequired)
  })

  it('keeps SCANNED_PDF and PARSE_FAILED outside the classified-stage API', () => {
    for (const code of ['SCANNED_PDF', 'PARSE_FAILED'] as const) {
      expect(() => aggregateClassifiedStages([{ ...completePage(1), status: code } as unknown as ClassifiedStage]))
        .toThrow(RoutingClassificationRequired)
      expect(() => aggregateClassifiedStages([{ ...completePage(1), reason: code } as unknown as ClassifiedStage]))
        .toThrow(RoutingClassificationRequired)
    }
  })

  it.each(['UNSUPPORTED_FILE', 'FILE_TOO_LARGE', 'EMPTY_FILE'] as const)(
    '%s cannot be mapped by the foundation', (code) => {
      expect(() => aggregateClassifiedStages([{ ...completePage(1), status: code } as unknown as ClassifiedStage]))
        .toThrow(RoutingClassificationRequired)
      expect(route([{ ...hardPage(1), reason: 'INPUT_REJECTED', retryClass: 'NOT_RETRYABLE' }]))
        .toMatchObject({ status: 'HARD_FAILURE', reason: 'INPUT_REJECTED', retryClass: 'NOT_RETRYABLE' })
    },
  )

  it('requires a preclassified state for unsupported representation', () => {
    expect(() => aggregateClassifiedStages([{ ...completePage(1), status: 'PDF_PAGE_GEOMETRY_UNSUPPORTED' } as unknown as ClassifiedStage]))
      .toThrow(RoutingClassificationRequired)
    expect(route([{ ...eligiblePage(1), reason: 'UNSUPPORTED_VALID_REPRESENTATION' }]))
      .toMatchObject({ status: 'FALLBACK_ELIGIBLE', reason: 'UNSUPPORTED_VALID_REPRESENTATION' })
  })

  it('keeps the production contract format-neutral without DOCX or PDF cause mapping', () => {
    expect(route([completePage(1, 'docx')]).status).toBe('DETERMINISTIC_SUCCESS')
    expect(route([{ ...completePage(1, 'docx'), status: 'FALLBACK_ELIGIBLE', reason: 'UNSUPPORTED_VALID_REPRESENTATION' }]))
      .toMatchObject({ status: 'FALLBACK_ELIGIBLE', reason: 'UNSUPPORTED_VALID_REPRESENTATION' })
    expect(route([{ ...completePage(1, 'docx'), status: 'HARD_FAILURE', reason: 'PARSER_FAILURE' }]))
      .toMatchObject({ status: 'HARD_FAILURE', reason: 'PARSER_FAILURE' })
    expect(() => aggregateClassifiedStages([{ ...completePage(1, 'docx'), status: 'SCANNED_PDF' } as unknown as ClassifiedStage]))
      .toThrow(RoutingClassificationRequired)
    expect(() => aggregateClassifiedStages([completePage(1, 'pdf'), completePage(2, 'docx')]))
      .toThrow(RoutingClassificationRequired)
  })

  it('uses real anonymous PDF and DOCX fixtures without treating legacy parse as routing proof', async () => {
    const sparsePdf = anonymousPdfFile('anonymous-sparse.pdf', [{ text: 'TOKEN000', x: 50, y: 700 }])
    const blankPdf = anonymousPdfFile('anonymous-blank.pdf', [])
    expect(validateResumeFile(sparsePdf)).toBe('pdf')
    await expect(parseResumeFile(sparsePdf)).rejects.toMatchObject({ code: 'SCANNED_PDF' })
    await expect(parseResumeFile(blankPdf)).rejects.toMatchObject({ code: 'SCANNED_PDF' })
    const scannedPdf = new File([readFileSync(resolve('tests/fixtures/resume-scanned.pdf'))], 'anonymous-scanned.pdf', { type: 'application/pdf' })
    await expect(parseResumeFile(scannedPdf)).rejects.toMatchObject({ code: 'SCANNED_PDF' })
    const corruptPdf = new File(['not a PDF'], 'anonymous-corrupt.pdf', { type: 'application/pdf' })
    await expect(parseResumeFile(corruptPdf)).rejects.toMatchObject({ code: 'PARSE_FAILED' })
    const docx = new File([readFileSync(resolve('tests/fixtures/resume-text.docx'))], 'anonymous.docx', {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    })
    expect(validateResumeFile(docx)).toBe('docx')
    const parsedDocx = await parseResumeFile(docx)
    expect(parsedDocx.fileType).toBe('docx')
    expect(parsedDocx).not.toHaveProperty('status')
    expect(aggregateClassifiedStages([completePage(1, 'docx')])).toMatchObject({ status: 'SUCCESS' })
  })

  it('keeps provenance outside ResumeProfile and admits conceptual AI_FALLBACK provenance only as an envelope', () => {
    const profile = anonymousCandidate()
    expect(validateCandidateEnvelope({ profile, provenance: { source: 'DETERMINISTIC', parserVersion: 'test-v1' } }).valid).toBe(true)
    expect(validateCandidateEnvelope({ profile, provenance: { source: 'AI_FALLBACK', parserVersion: 'future-v1' } }).valid).toBe(true)
    expect(validateCandidateEnvelope({ profile: { ...profile, provider: 'not-a-domain-field' }, provenance: { source: 'AI_FALLBACK', parserVersion: 'future-v1' } }).issues)
      .toContain('ROUTING_DATA_IN_PROFILE')
    expect(validateResumeParseOutcome({ ...route([completePage(1)]), candidate: { profile, provenance: { source: 'AI_FALLBACK', parserVersion: 'future-v1' } } }).valid).toBe(false)
  })

  it('keeps reason taxonomy coarse and diagnostics privacy-safe', () => {
    const projected = projectSafeDiagnostic({
      stage: 'visual-group', internalCode: 'INSUFFICIENT_EVIDENCE', pageNumber: 2,
      counts: { RUN_COUNT: 2, private_value: 9, PRIVATE_PHONE: 42 },
      rawText: 'TOKEN_PRIVATE', name: 'Avery Example', email: 'private@example.invalid',
      company: 'Example Company', school: 'Example School', fontName: 'PrivateFont',
      rawRuns: ['TOKEN_PRIVATE'],
    }, 'pdf')
    expect(projected).toEqual({
      format: 'pdf', stage: 'visual-group', internalCode: 'INSUFFICIENT_EVIDENCE',
      pageNumber: 2, counts: { RUN_COUNT: 2 },
    })
    expect(JSON.stringify(projected)).not.toMatch(/TOKEN_PRIVATE|Avery|private@example|Company|School|PrivateFont/)
    const outcome = route([{ ...eligiblePage(2), diagnostic: { stage: 'visual-group', internalCode: 'INSUFFICIENT_EVIDENCE', pageNumber: 2, rawText: 'TOKEN_PRIVATE' } }])
    expect(JSON.stringify(outcome)).not.toContain('TOKEN_PRIVATE')
    expect(validateResumeParseOutcome({ ...outcome, reason: 'INSUFFICIENT_CALIBRATION' }).valid).toBe(false)
    expect(validateResumeParseOutcome({ ...outcome, safeDiagnostics: [{ ...projected, rawText: 'TOKEN_PRIVATE' }] }).issues)
      .toContain('INVALID_SAFE_DIAGNOSTICS')
    expect(validateResumeParseOutcome({ ...route([hardPage(1)]), reason: 'INVALID_GRAPH_HLE_PAIRING' }).valid).toBe(false)
  })

  it('allows retry only as a classified hard-failure attribute, never as an AI route', () => {
    const transient = route([{
      pageNumber: 1, format: 'docx', stage: 'docx-conversion', status: 'HARD_FAILURE',
      reason: 'DOCUMENT_UNREADABLE', retryClass: 'TRANSIENT',
    }])
    expect(transient).toMatchObject({ status: 'HARD_FAILURE', retryClass: 'TRANSIENT' })
    expect(transient).not.toHaveProperty('sendToAI')
    expect(validateResumeParseOutcome({ ...transient, retryClass: 'AUTO_AI' }).issues).toContain('INVALID_RETRY_CLASS')
  })

  it('sorts diagnostics and resolves equal-priority reasons independently of input order', () => {
    const first: ClassifiedStage = { pageNumber: 2, format: 'pdf', stage: 'layout', status: 'FALLBACK_ELIGIBLE', reason: 'NO_USABLE_TEXT',
      diagnostic: { stage: 'layout', internalCode: 'NO_USABLE_TEXT', pageNumber: 2 } }
    const second: ClassifiedStage = { pageNumber: 1, format: 'pdf', stage: 'visual-group', status: 'FALLBACK_ELIGIBLE', reason: 'INSUFFICIENT_STRUCTURE',
      diagnostic: { stage: 'visual-group', internalCode: 'INSUFFICIENT_EVIDENCE', pageNumber: 1 } }
    const left = route([first, second])
    const right = route([second, first])
    expect(left).toEqual(right)
    expect(left).toMatchObject({ status: 'FALLBACK_ELIGIBLE', reason: 'INSUFFICIENT_STRUCTURE' })
    expect(left.safeDiagnostics?.map((diagnostic) => diagnostic.pageNumber)).toEqual([1, 2])
  })

  it('does not treat duplicate page observations as a complete document', () => {
    expect(() => route([completePage(1), completePage(1)])).toThrow(RoutingClassificationRequired)
  })

  it('does not mutate pages, diagnostics, source arrays, or the candidate', () => {
    const candidate = anonymousCandidate()
    const diagnostic = { stage: 'visual-group', internalCode: 'INSUFFICIENT_EVIDENCE', pageNumber: 2, counts: { RUN_COUNT: 1 } }
    const pages = [completePage(1), { ...eligiblePage(2), diagnostic }]
    const before = structuredClone({ candidate, pages })
    Object.freeze(candidate.skills)
    Object.freeze(candidate)
    Object.freeze(diagnostic.counts)
    Object.freeze(diagnostic)
    pages.forEach(Object.freeze)
    Object.freeze(pages)
    const first = route(pages, candidate)
    const second = route(pages, candidate)
    expect({ candidate, pages }).toEqual(before)
    expect(first).toEqual(second)
    expect(first.safeDiagnostics).not.toBe(pages)
    const success = route([completePage(1)], candidate)
    if (success.status !== 'DETERMINISTIC_SUCCESS') throw new Error('Expected success')
    expect(success.candidate.profile).not.toBe(candidate)
  })
})
