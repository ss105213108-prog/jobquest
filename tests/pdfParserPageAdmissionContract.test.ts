import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const runtime = vi.hoisted(() => ({ calls: [] as string[] }))
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
      runtime.calls.push('adapt')
      return actual.adaptPdfPageGeometry(metadata)
    },
  }
})

vi.mock('../src/parsers/pdfLineReconstructor', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/parsers/pdfLineReconstructor')>()
  return {
    ...actual,
    reconstructPdfPage: (...args: Parameters<typeof actual.reconstructPdfPage>) => {
      runtime.calls.push(`reconstruct:${args[1]}`)
      return actual.reconstructPdfPage(...args)
    },
  }
})

import { PdfPageGeometryError } from '../src/parsers/pdfParserErrors'
import { parseResumeFile, ResumeFileError } from '../src/parsers/resumeFileParser'
import {
  createPdfJsDocumentMock,
  createRejectedPdfJsLoadingTask,
  type PdfJsPageFixture,
} from './helpers/pdfParserPageAdmissionContractHarness'

const validPage = (marker: string): PdfJsPageFixture => ({
  view: [0, 0, 612, 792],
  rotate: 0,
  marker,
})
const pdfFile = () => new File(['anonymous-pdf'], 'anonymous.pdf', { type: 'application/pdf' })

const installPdf = (pages: readonly PdfJsPageFixture[]) => {
  const mock = createPdfJsDocumentMock(pages, runtime.calls)
  pdfJsMock.getDocument.mockReturnValue(mock.loadingTask)
  return mock
}

const rejectWithResumeError = async (promise: Promise<unknown>): Promise<ResumeFileError> => {
  try {
    await promise
  } catch (error) {
    expect(error).toBeInstanceOf(ResumeFileError)
    return error as ResumeFileError
  }
  throw new Error('Expected production parser to reject')
}

beforeEach(() => {
  runtime.calls = []
  pdfJsMock.getDocument.mockReset()
})

describe('RP-048 production page-geometry admission ordering', () => {
  it('admits geometry before extraction and reconstructs before cleanup', async () => {
    installPdf([validPage('anonymous content long enough for parser validation')])
    await parseResumeFile(pdfFile())
    expect(runtime.calls).toEqual([
      'getPage:1', 'adapt', 'getTextContent:1', 'reconstruct:1', 'cleanup:1', 'destroy',
    ])
  })

  it('projects only page.view and page.rotate without viewport or userUnit access', async () => {
    const mock = installPdf([{
      ...validPage('anonymous geometry projection content long enough'),
      defineForbiddenGeometryAccessors: true,
    }])
    await parseResumeFile(pdfFile())
    expect(mock.viewportReads()).toBe(0)
    expect(mock.userUnitReads()).toBe(0)
  })

  it('keeps all-valid output equivalent and publishes only the complete document', async () => {
    installPdf([
      validPage('anonymous first page content long enough'),
      validPage('anonymous second page content long enough'),
      validPage('anonymous third page content long enough'),
    ])
    await expect(parseResumeFile(pdfFile())).resolves.toEqual({
      text: [
        'anonymous first page content long enough',
        'anonymous second page content long enough',
        'anonymous third page content long enough',
      ].join('\n\n'),
      fileName: 'anonymous.pdf',
      fileType: 'pdf',
      pageCount: 3,
      parserMessages: [],
    })
    expect(runtime.calls.filter((call) => call.startsWith('getPage:'))).toEqual([
      'getPage:1', 'getPage:2', 'getPage:3',
    ])
  })
})

describe('RP-048 production fail-fast and atomic failure', () => {
  it('rejects rotate 90 before extraction and guarantees both cleanup scopes', async () => {
    installPdf([{ view: [0, 0, 612, 792], rotate: 90 }])
    const error = await rejectWithResumeError(parseResumeFile(pdfFile()))
    expect(error.code).toBe('PDF_PAGE_GEOMETRY_UNSUPPORTED')
    expect(runtime.calls).toEqual(['getPage:1', 'adapt', 'cleanup:1', 'destroy'])
  })

  it('stops at a failing middle page and never returns previous-page text', async () => {
    installPdf([
      validPage('PRIVATE PREVIOUS PAGE MARKER'),
      { view: [0, 0, 612, 792], rotate: 90 },
      validPage('never loaded'),
    ])
    const error = await rejectWithResumeError(parseResumeFile(pdfFile()))
    expect(runtime.calls).not.toContain('getPage:3')
    expect(JSON.stringify(error)).not.toContain('PRIVATE PREVIOUS PAGE MARKER')
    expect(String(error.cause)).not.toContain('PRIVATE PREVIOUS PAGE MARKER')
  })

  it('returns only the first failure in deterministic ascending page order', async () => {
    installPdf([
      { view: [0, 0, Number.NaN, 792], rotate: 0 },
      { view: [0, 0, 612, 792], rotate: 90 },
    ])
    const error = await rejectWithResumeError(parseResumeFile(pdfFile()))
    const cause = error.cause as PdfPageGeometryError
    expect(cause.pageNumber).toBe(1)
    expect(cause.cause.code).toBe('INVALID_PDF_PAGE_VIEW')
    expect(runtime.calls).toEqual(['getPage:1', 'adapt', 'cleanup:1', 'destroy'])
  })

  it('cleans up the acquired page and document after text extraction failure', async () => {
    installPdf([{
      ...validPage('unused'),
      extractionError: new Error('anonymous extraction failure'),
    }])
    const error = await rejectWithResumeError(parseResumeFile(pdfFile()))
    expect(error.code).toBe('PARSE_FAILED')
    expect(runtime.calls).toEqual([
      'getPage:1', 'adapt', 'getTextContent:1', 'cleanup:1', 'destroy',
    ])
  })
})

describe('RP-048 production public error mapping', () => {
  it.each([
    [{ view: [0, 0, 612, 792], rotate: 90 }, 'UNSUPPORTED_PAGE_ROTATION', 'PDF_PAGE_GEOMETRY_UNSUPPORTED'],
    [{ view: [0, 0, Number.NaN, 792], rotate: 0 }, 'INVALID_PDF_PAGE_VIEW', 'PDF_PAGE_GEOMETRY_INVALID'],
    [{ view: [0, 0, 612, 792], rotate: 45 }, 'INVALID_PAGE_GEOMETRY_METADATA', 'PDF_PAGE_GEOMETRY_INVALID'],
  ] as const)('maps adapter failure to %s / %s', async (page, adapterCode, publicCode) => {
    installPdf([page])
    const error = await rejectWithResumeError(parseResumeFile(pdfFile()))
    expect(error.code).toBe(publicCode)
    expect(error.cause).toBeInstanceOf(PdfPageGeometryError)
    const cause = error.cause as PdfPageGeometryError
    expect(cause.pageNumber).toBe(1)
    expect(cause.category).toBe(publicCode)
    expect(cause.cause.code).toBe(adapterCode)
  })

  it('owns one-based page number in the parser and preserves immutable structured cause', async () => {
    installPdf([
      validPage('anonymous first page content long enough'),
      { view: [0, 0, 612, 792], rotate: 270 },
    ])
    const error = await rejectWithResumeError(parseResumeFile(pdfFile()))
    const cause = error.cause as PdfPageGeometryError
    expect(cause.pageNumber).toBe(2)
    expect(cause.cause).toMatchObject({ ok: false, code: 'UNSUPPORTED_PAGE_ROTATION' })
    expect(Object.getOwnPropertyDescriptor(cause, 'pageNumber')?.writable).toBe(false)
    expect(Object.getOwnPropertyDescriptor(cause, 'category')?.writable).toBe(false)
  })

  it('keeps diagnostics free of page text, resume fields, and raw page.view', async () => {
    const privateMarkers = ['PRIVATE NAME', 'private@example.test', 'Private Company', 'private section text']
    installPdf([
      validPage(privateMarkers.join(' ')),
      { view: [123, 456, 789, 999], rotate: 90 },
    ])
    const error = await rejectWithResumeError(parseResumeFile(pdfFile()))
    const serialized = [error.message, JSON.stringify(error), String(error.cause)].join(' ')
    for (const marker of privateMarkers) expect(serialized).not.toContain(marker)
    expect(serialized).not.toContain('123,456,789,999')
    expect(error.message).toContain('第 2 頁')
  })

  it('keeps PDF.js document failures on PARSE_FAILED and still destroys loading task', async () => {
    pdfJsMock.getDocument.mockReturnValue(createRejectedPdfJsLoadingTask(
      new Error('malformed PDF document'),
      runtime.calls,
    ))
    const error = await rejectWithResumeError(parseResumeFile(pdfFile()))
    expect(error.code).toBe('PARSE_FAILED')
    expect(runtime.calls).toEqual(['destroy'])
  })
})

describe('RP-048 production DOCX isolation', () => {
  it('parses a real DOCX without invoking the PDF geometry adapter', async () => {
    const bytes = readFileSync(resolve('tests/fixtures/resume-text.docx'))
    const file = new File([bytes], 'anonymous.docx', {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    })
    await expect(parseResumeFile(file)).resolves.toMatchObject({ fileType: 'docx' })
    expect(runtime.calls).toEqual([])
    expect(pdfJsMock.getDocument).not.toHaveBeenCalled()
  })

  it('keeps ordinary DOCX failures on PARSE_FAILED without PDF geometry codes', async () => {
    const file = new File(['not-a-docx'], 'anonymous.docx', {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    })
    const error = await rejectWithResumeError(parseResumeFile(file))
    expect(error.code).toBe('PARSE_FAILED')
    expect(runtime.calls).toEqual([])
    expect(pdfJsMock.getDocument).not.toHaveBeenCalled()
  })
})
