import { describe, expect, it } from 'vitest'
import {
  projectReadingOrderDiagnostic,
  readingOrderResultIssues,
  resolveReadingOrderV1,
} from '../src/parsers/pdfReadingOrder'
import type { SpatialStructureResult } from '../src/parsers/pdfSpatialStructureGraph'
import {
  causeForReadingOrder,
  projectLegacyCompatibility,
  projectSafeCause,
  validateCause,
} from '../src/parsers/resumeParserCause'
import { readingOrderFixture, validPdfClaims } from './helpers/pdfReadingOrderV1ContractHarness'

const boxes = [{ x: 20, y: 700, width: 20 }, { x: 80, y: 700, width: 20 }] as const

describe('RP-099 production Reading Order foundation', () => {
  it('keeps the canonical input page when a malformed spatial result claims another page', () => {
    const { input, spatial } = readingOrderFixture(boxes)
    const wrongPage = { ...spatial, pageNumber: 2 } as SpatialStructureResult
    const result = resolveReadingOrderV1(input, wrongPage)
    expect(result).toEqual({ status: 'FAILED', pageNumber: 1, code: 'INVALID_INPUT_STRUCTURE' })
    expect(readingOrderResultIssues(input, wrongPage, result)).toEqual([])
    expect(causeForReadingOrder(input, wrongPage, result)).toEqual({
      format: 'pdf', code: 'PDF_READING_ORDER_FAILED', pageNumber: 1,
    })
  })

  it('fails closed on malformed or empty node inventory without fabricating an ordered payload', () => {
    const { input, spatial } = readingOrderFixture(boxes)
    if (spatial.status !== 'RESOLVED') throw new Error('Invalid fixture')
    const empty = { ...spatial, graph: { ...spatial.graph, nodes: [] } }
    const malformed = { ...spatial, graph: { ...spatial.graph, nodes: undefined } } as unknown as SpatialStructureResult
    for (const result of [empty, malformed]) {
      const order = resolveReadingOrderV1(input, result)
      expect(order.status).toBe('FAILED')
      expect(order).not.toHaveProperty('sequence')
      expect(readingOrderResultIssues(input, result, order)).toEqual([])
      expect(projectReadingOrderDiagnostic(input, result, order)).toEqual({ pageNumber: 1, code: order.status === 'FAILED' ? order.code : '' })
    }
  })

  it('keeps both new causes page-scoped and leaves their one-way legacy projection deferred', () => {
    for (const code of ['PDF_READING_ORDER_INSUFFICIENT', 'PDF_READING_ORDER_FAILED'] as const) {
      const cause = { format: 'pdf' as const, code, pageNumber: 2 }
      expect(validateCause(cause)).toBe(true)
      expect(validateCause({ ...cause, pageNumber: 0 })).toBe(false)
      expect(validateCause({ format: 'pdf', code })).toBe(false)
      expect(() => projectLegacyCompatibility(cause, 'GENERIC_PARSE_FAILURE')).toThrow()
    }
  })

  it('projects the Reading Order cause with a safe stage and page, never exception text', () => {
    const safe = projectSafeCause({
      cause: { format: 'pdf', code: 'PDF_READING_ORDER_INSUFFICIENT', pageNumber: 2 },
      validity: validPdfClaims(2), exception: new Error('Private resume text'),
    })
    expect(safe).toMatchObject({ code: 'PDF_READING_ORDER_INSUFFICIENT', stage: 'reading-order', pageNumber: 2 })
    expect(JSON.stringify(safe)).not.toContain('Private resume text')
  })
})
