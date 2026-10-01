export interface PdfJsPageFixture {
  readonly view: unknown
  readonly rotate: unknown
  readonly marker?: string
  readonly extractionError?: Error
  readonly defineForbiddenGeometryAccessors?: boolean
}

export interface PdfJsDocumentMock {
  readonly loadingTask: {
    readonly promise: Promise<{
      readonly numPages: number
      readonly getPage: (pageNumber: number) => Promise<unknown>
    }>
    readonly destroy: () => Promise<void>
  }
  readonly viewportReads: () => number
  readonly userUnitReads: () => number
}

const textRun = (marker: string, pageNumber: number) => ({
  str: marker,
  transform: [1, 0, 0, 1, 40, 800 - pageNumber * 20],
  width: marker.length * 6,
  height: 10,
  dir: 'ltr',
  fontName: 'AnonymousFont',
  hasEOL: true,
})

export function createPdfJsDocumentMock(
  pages: readonly PdfJsPageFixture[],
  calls: string[],
): PdfJsDocumentMock {
  let viewportReadCount = 0
  let userUnitReadCount = 0
  const document = {
    numPages: pages.length,
    getPage: async (pageNumber: number) => {
      calls.push(`getPage:${pageNumber}`)
      const specification = pages[pageNumber - 1]
      const page: Record<string, unknown> = {
        view: specification.view,
        rotate: specification.rotate,
        getTextContent: async () => {
          calls.push(`getTextContent:${pageNumber}`)
          if (specification.extractionError) throw specification.extractionError
          return { items: [textRun(specification.marker ?? `anonymous-page-${pageNumber}`, pageNumber)] }
        },
        cleanup: () => {
          calls.push(`cleanup:${pageNumber}`)
        },
      }
      if (specification.defineForbiddenGeometryAccessors) {
        Object.defineProperty(page, 'getViewport', {
          get: () => {
            viewportReadCount += 1
            throw new Error('getViewport must not be read')
          },
        })
        Object.defineProperty(page, 'userUnit', {
          get: () => {
            userUnitReadCount += 1
            throw new Error('userUnit must not be read')
          },
        })
      }
      return page
    },
  }

  return {
    loadingTask: {
      promise: Promise.resolve(document),
      destroy: async () => {
        calls.push('destroy')
      },
    },
    viewportReads: () => viewportReadCount,
    userUnitReads: () => userUnitReadCount,
  }
}

export function createRejectedPdfJsLoadingTask(error: Error, calls: string[]) {
  return {
    promise: Promise.reject(error),
    destroy: async () => {
      calls.push('destroy')
    },
  }
}
