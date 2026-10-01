import {
  reconstructPdfPage as reconstructLegacyPdfPage,
  type PdfTextRun,
} from './pdfLineReconstructor'
import type { PhysicalPageBounds } from './pdfPageGeometry'

export interface PdfPageReconstructionContext {
  readonly pageNumber: number
  readonly pageBounds: PhysicalPageBounds
}

export interface PdfPageReconstructionInput {
  readonly items: readonly PdfTextRun[]
  readonly context: PdfPageReconstructionContext
}

export function reconstructPdfPage(input: PdfPageReconstructionInput): string {
  return reconstructLegacyPdfPage([...input.items], input.context.pageNumber)
}
