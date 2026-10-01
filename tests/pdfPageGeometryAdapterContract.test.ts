import { describe, expect, it } from 'vitest'
import { observeHorizontalLayout } from '../src/parsers/pdfHorizontalLayoutEvidence'
import {
  adaptPdfPageGeometry,
  type PdfPageGeometryAdapterFailureCode,
  type PdfPageGeometryAdapterResult,
  type PdfPageGeometryMetadata,
} from '../src/parsers/pdfPageGeometry'
import { normalizeTextRunGeometry } from '../src/parsers/pdfTextGeometry'
import type { RowEvidenceGraph } from '../src/parsers/pdfRowEvidenceGraph'
import {
  projectAdapterMetadata,
  sourceWithUserUnit,
  successCases,
} from './fixtures/pdfPageGeometryAdapterContract'
import {
  admitDocumentPageGeometryForContract,
} from './helpers/pdfPageGeometryAdapterContractHarness'

const expectFailure = (
  result: PdfPageGeometryAdapterResult,
  code: PdfPageGeometryAdapterFailureCode,
) => {
  expect(result).toMatchObject({ ok: false, code })
  expect(result).not.toHaveProperty('pageBounds')
  expect(result).not.toHaveProperty('minX')
  expect(result).not.toHaveProperty('maxX')
  expect(result).not.toHaveProperty('width')
}

const malformed = (value: unknown): PdfPageGeometryMetadata => value as PdfPageGeometryMetadata

describe('RP-045 PDF page geometry adapter success contract', () => {
  it.each(successCases)('$id derives the only width from page.view endpoints', ({ metadata, expected }) => {
    expect(adaptPdfPageGeometry(metadata)).toEqual({
      ok: true,
      pageBounds: {
        ...expected,
        source: 'pdf-page-view',
      },
    })
  })

  it('ignores an undeclared runtime width instead of accepting a second source of truth', () => {
    const metadata = { view: [100, 0, 700, 800], rotate: 0, declaredWidth: 999 }
    const result = adaptPdfPageGeometry(metadata)
    expect(result).toEqual({
      ok: true,
      pageBounds: { minX: 100, maxX: 700, width: 600, source: 'pdf-page-view' },
    })
    expect(JSON.stringify(result)).not.toContain('declaredWidth')
  })

  it('does not normalize a negative page origin to zero', () => {
    const result = adaptPdfPageGeometry({ view: [-50, 0, 550, 800], rotate: 0 })
    expect(result).toMatchObject({ ok: true, pageBounds: { minX: -50, maxX: 550, width: 600 } })
  })
})

describe('RP-045 rotation admission contract', () => {
  it('admits rotation zero as the only supported orientation', () => {
    expect(adaptPdfPageGeometry({ view: [0, 0, 612, 792], rotate: 0 }).ok).toBe(true)
  })

  it.each([90, 180, 270])('rejects valid PDF rotation %s as explicitly unsupported', (rotate) => {
    const result = adaptPdfPageGeometry({ view: [0, 0, 612, 792], rotate })
    expectFailure(result, 'UNSUPPORTED_PAGE_ROTATION')
  })

  it.each([
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    45,
    360,
    -90,
    1.5,
    '90',
  ])('rejects malformed rotation %s without normalizing, rounding, or coercing', (rotate) => {
    const result = adaptPdfPageGeometry(malformed({ view: [0, 0, 612, 792], rotate }))
    expectFailure(result, 'INVALID_PAGE_GEOMETRY_METADATA')
  })
})

describe('RP-045 page.view validation contract', () => {
  it.each([
    [],
    [0, 0, 612],
    [0, 0, 612, 792, 900],
  ])('rejects page.view shape %#', (view) => {
    expectFailure(adaptPdfPageGeometry({ view, rotate: 0 }), 'INVALID_PDF_PAGE_VIEW')
  })

  it.each([
    [Number.NaN, 0, 612, 792],
    [0, Number.POSITIVE_INFINITY, 612, 792],
    [0, 0, Number.NEGATIVE_INFINITY, 792],
    [0, 0, 612, Number.NaN],
    [0, '0', 612, 792],
  ])('rejects nonnumeric or nonfinite coordinate set %#', (view) => {
    expectFailure(adaptPdfPageGeometry(malformed({ view, rotate: 0 })), 'INVALID_PDF_PAGE_VIEW')
  })

  it('rejects zero-width horizontal bounds', () => {
    expectFailure(
      adaptPdfPageGeometry({ view: [100, 0, 100, 800], rotate: 0 }),
      'INVALID_PDF_PAGE_VIEW',
    )
  })

  it('rejects reversed horizontal bounds without swapping endpoints', () => {
    expectFailure(
      adaptPdfPageGeometry({ view: [700, 0, 100, 800], rotate: 0 }),
      'INVALID_PDF_PAGE_VIEW',
    )
  })

  it('accepts positive horizontal width without imposing Y ordering', () => {
    expect(adaptPdfPageGeometry({ view: [100, 800, 700, 0], rotate: 0 })).toEqual({
      ok: true,
      pageBounds: { minX: 100, maxX: 700, width: 600, source: 'pdf-page-view' },
    })
  })

  it('returns deterministic failure issues', () => {
    const metadata = malformed({ view: [Number.NaN, 'bad', Number.POSITIVE_INFINITY, null], rotate: 0 })
    const first = adaptPdfPageGeometry(metadata)
    const second = adaptPdfPageGeometry(metadata)
    expect(first).toEqual(second)
    if (first.ok) throw new Error('Expected invalid view')
    expect(first.issues.map((issue) => issue.code)).toEqual(
      [...first.issues.map((issue) => issue.code)].sort(),
    )
  })
})

describe('RP-045 page-space independence and downstream compatibility', () => {
  it('projects userUnit out of the adapter seam', () => {
    const unitOne = sourceWithUserUnit(1)
    const unitTwo = sourceWithUserUnit(2)
    expect(projectAdapterMetadata(unitOne)).toEqual(projectAdapterMetadata(unitTwo))
    expect(adaptPdfPageGeometry(projectAdapterMetadata(unitOne))).toEqual(
      adaptPdfPageGeometry(projectAdapterMetadata(unitTwo)),
    )
    expect(JSON.stringify(projectAdapterMetadata(unitTwo))).not.toContain('userUnit')
  })

  it('does not require or emit viewport/display-space metadata', () => {
    const result = adaptPdfPageGeometry({ view: [0, 0, 612, 792], rotate: 0 })
    const serialized = JSON.stringify(result)
    expect(serialized).not.toMatch(/viewport|scale|render|canvas|display/i)
  })

  it('passes valid adapter output directly to the production HorizontalLayoutEvidence observer', () => {
    const run = normalizeTextRunGeometry({
      str: 'anonymous',
      transform: [1, 0, 0, 1, 120, 400],
      width: 80,
      height: 10,
      dir: 'ltr',
      fontName: 'AnonymousFont',
      hasEOL: false,
    }, 0)
    const graph: RowEvidenceGraph = {
      runs: [run],
      candidates: [{ id: 'slice-a', runIds: [0], geometryStatus: 'comparable' }],
      relations: [],
    }
    const adapted = adaptPdfPageGeometry({ view: [100, 200, 700, 1000], rotate: 0 })
    expect(adapted.ok).toBe(true)
    if (!adapted.ok) throw new Error('Expected valid page geometry')

    expect(observeHorizontalLayout({ graph, pageBounds: adapted.pageBounds })).toMatchObject({
      ok: true,
      value: {
        pageGeometry: {
          physical: { minX: 100, maxX: 700, width: 600, source: 'pdf-page-view' },
        },
      },
    })
  })

  it('leaves defensive bounds validation owned by the horizontal observer', () => {
    const run = normalizeTextRunGeometry({
      str: 'anonymous',
      transform: [1, 0, 0, 1, 120, 400],
      width: 80,
      height: 10,
      dir: 'ltr',
      fontName: 'AnonymousFont',
      hasEOL: false,
    }, 0)
    const graph: RowEvidenceGraph = {
      runs: [run],
      candidates: [{ id: 'slice-a', runIds: [0], geometryStatus: 'comparable' }],
      relations: [],
    }
    expect(observeHorizontalLayout({
      graph,
      pageBounds: { minX: 100, maxX: 700, width: 999, source: 'pdf-page-view' },
    })).toMatchObject({ ok: false, code: 'INVALID_LAYOUT_CONTEXT' })
  })
})

describe('RP-045 adapter determinism and mutation safety', () => {
  it('returns deep-equal results for semantically equal metadata objects', () => {
    expect(adaptPdfPageGeometry({ view: [100, 200, 700, 1000], rotate: 0 })).toEqual(
      adaptPdfPageGeometry({ view: [100, 200, 700, 1000], rotate: 0 }),
    )
  })

  it('does not mutate a frozen metadata object or view array', () => {
    const view = Object.freeze([100, 200, 700, 1000])
    const metadata = Object.freeze({ view, rotate: 0 })
    const before = JSON.stringify(metadata)
    expect(() => adaptPdfPageGeometry(metadata)).not.toThrow()
    expect(JSON.stringify(metadata)).toBe(before)
    expect(metadata.view).toBe(view)
  })
})

describe('RP-045 document-level atomic failure specification', () => {
  const valid = (minX = 0): PdfPageGeometryMetadata => ({ view: [minX, 0, minX + 600, 800], rotate: 0 })

  it('treats one invalid page as document failure with no partial bounds', () => {
    const result = admitDocumentPageGeometryForContract([
      malformed({ view: [0, 0, Number.NaN, 800], rotate: 0 }),
    ])
    expect(result).toEqual({
      ok: false,
      diagnostics: [{ pageNumber: 1, adapterFailureCode: 'INVALID_PDF_PAGE_VIEW' }],
    })
    expect(result).not.toHaveProperty('pageBounds')
  })

  it('does not skip a middle unsupported page or return surrounding pages as partial success', () => {
    const result = admitDocumentPageGeometryForContract([
      valid(0),
      { view: [0, 0, 600, 800], rotate: 90 },
      valid(100),
    ])
    expect(result).toEqual({
      ok: false,
      diagnostics: [{ pageNumber: 2, adapterFailureCode: 'UNSUPPORTED_PAGE_ROTATION' }],
    })
    expect(result).not.toHaveProperty('pageBounds')
  })

  it('reports multiple failed pages in deterministic page order', () => {
    const result = admitDocumentPageGeometryForContract([
      { view: [0, 0, 600, 800], rotate: 270 },
      valid(),
      malformed({ view: [100, 0, 100, 800], rotate: 0 }),
    ])
    expect(result).toEqual({
      ok: false,
      diagnostics: [
        { pageNumber: 1, adapterFailureCode: 'UNSUPPORTED_PAGE_ROTATION' },
        { pageNumber: 3, adapterFailureCode: 'INVALID_PDF_PAGE_VIEW' },
      ],
    })
  })

  it('admits the document only when every page geometry is valid', () => {
    expect(admitDocumentPageGeometryForContract([valid(0), valid(100), valid(-50)])).toEqual({
      ok: true,
      pageBounds: [
        { minX: 0, maxX: 600, width: 600, source: 'pdf-page-view' },
        { minX: 100, maxX: 700, width: 600, source: 'pdf-page-view' },
        { minX: -50, maxX: 550, width: 600, source: 'pdf-page-view' },
      ],
    })
  })
})
