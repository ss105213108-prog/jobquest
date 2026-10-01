import type { PdfTextRun } from '../../src/parsers/pdfLineReconstructor'
import type { AnonymousPdfTextRun } from '../fixtures/pdfReconstructionLayouts'

export function toPdfTextRuns(
  runs: readonly AnonymousPdfTextRun[],
): readonly PdfTextRun[] {
  return runs.map((item) => ({
    str: item.text,
    transform: [1, 0, 0, 1, item.x, item.y],
    width: item.width,
    height: item.height,
    dir: item.direction,
    fontName: item.fontName,
    hasEOL: item.hasEOL,
  }))
}
