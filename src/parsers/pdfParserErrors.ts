import type { PdfPageGeometryAdapterResult } from './pdfPageGeometry'

export type PdfPageGeometryFailureCategory =
  | 'PDF_PAGE_GEOMETRY_UNSUPPORTED'
  | 'PDF_PAGE_GEOMETRY_INVALID'

export type PdfPageGeometryAdapterFailure = Extract<
  PdfPageGeometryAdapterResult,
  { readonly ok: false }
>

const failureCategory = (
  failure: PdfPageGeometryAdapterFailure,
): PdfPageGeometryFailureCategory => failure.code === 'UNSUPPORTED_PAGE_ROTATION'
  ? 'PDF_PAGE_GEOMETRY_UNSUPPORTED'
  : 'PDF_PAGE_GEOMETRY_INVALID'

export class PdfPageGeometryError extends Error {
  public readonly pageNumber: number
  public readonly category: PdfPageGeometryFailureCategory
  public override readonly cause: PdfPageGeometryAdapterFailure

  constructor(pageNumber: number, cause: PdfPageGeometryAdapterFailure) {
    const category = failureCategory(cause)
    super(`PDF page ${pageNumber} geometry admission failed.`, { cause })
    this.name = 'PdfPageGeometryError'
    this.pageNumber = pageNumber
    this.category = category
    this.cause = cause
    Object.defineProperties(this, {
      pageNumber: { value: pageNumber, enumerable: true, writable: false },
      category: { value: category, enumerable: true, writable: false },
      cause: { value: cause, enumerable: false, writable: false },
    })
  }
}
