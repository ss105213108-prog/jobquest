import { beforeEach, describe, expect, it, vi } from 'vitest'

const runtime = vi.hoisted(() => ({
  admittedBounds: [] as unknown[],
  reconstructionInputs: [] as unknown[],
  horizontalObserver: vi.fn(),
  graphBuilder: vi.fn(),
}))
const pdfJsMock = vi.hoisted(() => ({
  getDocument: vi.fn(),
  GlobalWorkerOptions: { workerSrc: '' },
}))

vi.mock('pdfjs-dist/legacy/build/pdf.mjs', () => pdfJsMock)

vi.mock('../src/parsers/pdfPageGeometry', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/parsers/pdfPageGeometry')>()
  return {
    ...actual,
    adaptPdfPageGeometry: (metadata: Parameters<typeof actual.adaptPdfPageGeometry>[0]) => {
      const result = actual.adaptPdfPageGeometry(metadata)
      if (result.ok) runtime.admittedBounds.push(result.pageBounds)
      return result
    },
  }
})

vi.mock('../src/parsers/pdfPageReconstructor', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/parsers/pdfPageReconstructor')>()
  return {
    ...actual,
    reconstructPdfPage: (input: Parameters<typeof actual.reconstructPdfPage>[0]) => {
      runtime.reconstructionInputs.push(input)
      return actual.reconstructPdfPage(input)
    },
  }
})

vi.mock('../src/parsers/pdfHorizontalLayoutEvidence', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/parsers/pdfHorizontalLayoutEvidence')>()
  return { ...actual, observeHorizontalLayout: runtime.horizontalObserver }
})

vi.mock('../src/parsers/pdfRowEvidenceGraphBuilder', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/parsers/pdfRowEvidenceGraphBuilder')>()
  return { ...actual, buildRowEvidenceGraph: runtime.graphBuilder }
})

import { reconstructPdfPage as reconstructLegacyPdfPage } from '../src/parsers/pdfLineReconstructor'
import {
  reconstructPdfPage,
  type PdfPageReconstructionInput,
} from '../src/parsers/pdfPageReconstructor'
import type { PhysicalPageBounds } from '../src/parsers/pdfPageGeometry'
import { parseResumeFile, type ResumeFileError } from '../src/parsers/resumeFileParser'
import { anonymousPdfLayouts, layoutById } from './fixtures/pdfReconstructionLayouts'
import { createPdfJsDocumentMock } from './helpers/pdfParserPageAdmissionContractHarness'
import { toPdfTextRuns } from './helpers/pdfPageReconstructionHandoffContractHarness'

const standardBounds: PhysicalPageBounds = {
  minX: 0,
  maxX: 612,
  width: 612,
  source: 'pdf-page-view',
}
const calls: string[] = []
const validPage = (marker: string, view: readonly number[] = [0, 0, 612, 792]) => ({
  view,
  rotate: 0,
  marker,
})
const pdfFile = () => new File(['anonymous-pdf'], 'anonymous.pdf', { type: 'application/pdf' })

const installPdf = (pages: Parameters<typeof createPdfJsDocumentMock>[0]) => {
  const mock = createPdfJsDocumentMock(pages, calls)
  pdfJsMock.getDocument.mockReturnValue(mock.loadingTask)
}

const reject = async (promise: Promise<unknown>): Promise<ResumeFileError> => {
  try {
    await promise
  } catch (error) {
    return error as ResumeFileError
  }
  throw new Error('Expected parser failure')
}

beforeEach(() => {
  calls.length = 0
  runtime.admittedBounds = []
  runtime.reconstructionInputs = []
  runtime.horizontalObserver.mockClear()
  runtime.graphBuilder.mockClear()
  pdfJsMock.getDocument.mockReset()
})

describe('RP-051 production page reconstruction context contract', () => {
  it('passes the exact admitted bounds in a context containing only approved fields', async () => {
    installPdf([validPage('anonymous content long enough for parser validation')])
    await parseResumeFile(pdfFile())
    const input = runtime.reconstructionInputs[0] as PdfPageReconstructionInput

    expect(input.context.pageBounds).toBe(runtime.admittedBounds[0])
    expect(Object.keys(input.context).sort()).toEqual(['pageBounds', 'pageNumber'])
    expect(Object.keys(input.context.pageBounds).sort()).toEqual(['maxX', 'minX', 'source', 'width'])
    expect(input.context).not.toHaveProperty('page')
    expect(input.context).not.toHaveProperty('view')
    expect(input.context).not.toHaveProperty('rotate')
    expect(input.context).not.toHaveProperty('viewport')
    expect(input.context).not.toHaveProperty('userUnit')
    expect(input.context).not.toHaveProperty('graph')
  })

  it.each([
    [[100, 0, 700, 800], { minX: 100, maxX: 700, width: 600, source: 'pdf-page-view' }],
    [[-50, 0, 550, 800], { minX: -50, maxX: 550, width: 600, source: 'pdf-page-view' }],
  ] as const)('preserves the admitted origin for page.view %#', async (view, expected) => {
    installPdf([validPage('anonymous origin content long enough for validation', view)])
    await parseResumeFile(pdfFile())
    const input = runtime.reconstructionInputs[0] as PdfPageReconstructionInput
    expect(input.context.pageBounds).toBe(runtime.admittedBounds[0])
    expect(input.context.pageBounds).toEqual(expected)
  })

  it('creates isolated one-based contexts for consecutive pages', async () => {
    installPdf([
      validPage('anonymous first page content long enough', [0, 0, 600, 800]),
      validPage('anonymous second page content long enough', [100, 0, 700, 800]),
    ])
    await parseResumeFile(pdfFile())
    const inputs = runtime.reconstructionInputs as PdfPageReconstructionInput[]
    expect(inputs.map((input) => input.context.pageNumber)).toEqual([1, 2])
    expect(inputs[0].context).not.toBe(inputs[1].context)
    expect(inputs[0].context.pageBounds).toBe(runtime.admittedBounds[0])
    expect(inputs[1].context.pageBounds).toBe(runtime.admittedBounds[1])
    expect(inputs[0].context.pageBounds).not.toBe(inputs[1].context.pageBounds)
  })

  it('does not call the page reconstruction seam after admission failure', async () => {
    installPdf([{ view: [0, 0, 612, 792], rotate: 90 }])
    const error = await reject(parseResumeFile(pdfFile()))
    expect(error.code).toBe('PDF_PAGE_GEOMETRY_UNSUPPORTED')
    expect(runtime.reconstructionInputs).toEqual([])
  })
})

describe('RP-051 production behavior-neutral orchestrator contract', () => {
  const equivalenceLayouts = [
    'single-column',
    'two-column',
    'sidebar',
    'same-y-separate-columns',
    'split-cjk-heading',
    'english-headings',
  ]

  it.each(equivalenceLayouts)('%s delegates to byte-equivalent legacy output', (layoutId) => {
    const items = toPdfTextRuns(layoutById(layoutId).runs)
    const legacyOutput = reconstructLegacyPdfPage(items.slice(), 1)
    const output = reconstructPdfPage({
      items,
      context: { pageNumber: 1, pageBounds: standardBounds },
    })
    expect(output).toBe(legacyOutput)
  })

  it('does not mutate frozen input, items, context, bounds, or text runs', () => {
    const frozenItems = Object.freeze(toPdfTextRuns(layoutById('inline-heading-content').runs)
      .map((item) => Object.freeze({ ...item, transform: Object.freeze([...item.transform]) })))
    const pageBounds = Object.freeze({ ...standardBounds })
    const context = Object.freeze({ pageNumber: 1, pageBounds })
    const input = Object.freeze({ items: frozenItems, context })
    const before = JSON.stringify(input)

    expect(() => reconstructPdfPage(input)).not.toThrow()
    expect(JSON.stringify(input)).toBe(before)
  })

  it('does not invoke HorizontalLayoutEvidence or RowEvidenceGraph', () => {
    reconstructPdfPage({
      items: toPdfTextRuns(layoutById('single-column').runs),
      context: { pageNumber: 1, pageBounds: standardBounds },
    })
    expect(runtime.horizontalObserver).not.toHaveBeenCalled()
    expect(runtime.graphBuilder).not.toHaveBeenCalled()
  })

  it('carries page bounds without consuming them as a Stage 1 output signal', () => {
    const items = toPdfTextRuns(layoutById('single-column').runs)
    const nonzeroOrigin = reconstructPdfPage({
      items,
      context: {
        pageNumber: 1,
        pageBounds: { minX: 100, maxX: 700, width: 600, source: 'pdf-page-view' },
      },
    })
    const negativeOrigin = reconstructPdfPage({
      items,
      context: {
        pageNumber: 1,
        pageBounds: { minX: -50, maxX: 550, width: 600, source: 'pdf-page-view' },
      },
    })
    expect(negativeOrigin).toBe(nonzeroOrigin)
  })

  it('keeps page number diagnostic-only and preserves every anonymous legacy result', () => {
    for (const layout of anonymousPdfLayouts) {
      const items = toPdfTextRuns(layout.runs)
      const first = reconstructPdfPage({
        items,
        context: { pageNumber: 1, pageBounds: standardBounds },
      })
      const later = reconstructPdfPage({
        items,
        context: { pageNumber: 7, pageBounds: standardBounds },
      })
      expect(first, layout.id).toBe(reconstructLegacyPdfPage(items.slice(), 1))
      expect(later, layout.id).toBe(first)
    }
  })
})
