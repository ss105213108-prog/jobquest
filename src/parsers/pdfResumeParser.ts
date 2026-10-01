import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import pdfWorkerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'
import { adaptPdfPageGeometry } from './pdfPageGeometry'
import { reconstructPdfPage } from './pdfPageReconstructor'
import { PdfPageGeometryError } from './pdfParserErrors'
import type { ParsedResumeFile } from './resumeParserTypes'

GlobalWorkerOptions.workerSrc = pdfWorkerUrl

export async function parsePdfResume(file: File): Promise<ParsedResumeFile> {
  const loadingTask = getDocument({ data: new Uint8Array(await file.arrayBuffer()), stopAtErrors: true })
  try {
    const document = await loadingTask.promise
    const pages: string[] = []
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber)
      try {
        const admission = adaptPdfPageGeometry({ view: page.view, rotate: page.rotate })
        if (!admission.ok) throw new PdfPageGeometryError(pageNumber, admission)

        const content = await page.getTextContent()
        pages.push(reconstructPdfPage({
          items: content.items.filter((item) => 'str' in item),
          context: {
            pageNumber,
            pageBounds: admission.pageBounds,
          },
        }))
      } finally {
        page.cleanup()
      }
    }
    return { text: pages.join('\n\n'), fileName: file.name, fileType: 'pdf', pageCount: document.numPages, parserMessages: [] }
  } finally {
    await loadingTask.destroy()
  }
}
