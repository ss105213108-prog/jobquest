import {
  adaptPdfPageGeometry,
  type PdfPageGeometryAdapterFailureCode,
  type PdfPageGeometryMetadata,
  type PhysicalPageBounds,
} from '../../src/parsers/pdfPageGeometry'

export type DocumentPageGeometryAdmissionResult =
  | {
      readonly ok: true
      readonly pageBounds: readonly PhysicalPageBounds[]
    }
  | {
      readonly ok: false
      readonly diagnostics: readonly {
        readonly pageNumber: number
        readonly adapterFailureCode: PdfPageGeometryAdapterFailureCode
      }[]
    }

export function admitDocumentPageGeometryForContract(
  pages: readonly PdfPageGeometryMetadata[],
): DocumentPageGeometryAdmissionResult {
  const pageBounds: PhysicalPageBounds[] = []
  const diagnostics: Array<{
    pageNumber: number
    adapterFailureCode: PdfPageGeometryAdapterFailureCode
  }> = []

  pages.forEach((metadata, index) => {
    const result = adaptPdfPageGeometry(metadata)
    if (result.ok) pageBounds.push({ ...result.pageBounds })
    else diagnostics.push({ pageNumber: index + 1, adapterFailureCode: result.code })
  })

  return diagnostics.length === 0
    ? { ok: true, pageBounds }
    : {
        ok: false,
        diagnostics: diagnostics.sort((left, right) => left.pageNumber - right.pageNumber
          || left.adapterFailureCode.localeCompare(right.adapterFailureCode)),
      }
}

