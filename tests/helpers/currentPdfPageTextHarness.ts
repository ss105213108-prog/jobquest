import type { AnonymousPdfTextRun } from '../fixtures/pdfReconstructionLayouts'

// Frozen test-only characterization of pageText() before RP-015 extraction.
// Keep this independent from the production seam so equivalence remains observable.
export function reconstructWithLegacyPageText(runs: readonly AnonymousPdfTextRun[]): string {
  const lines: string[] = []
  let current: string[] = []
  let previousY: number | null = null

  const flush = () => {
    const value = current.join(' ').replace(/\s+/g, ' ').trim()
    if (value) lines.push(value)
    current = []
  }

  for (const item of runs) {
    if (previousY !== null && Math.abs(item.y - previousY) > 2) flush()
    const itemText = item.text.trim()
    if (itemText) current.push(itemText)
    previousY = item.y
    if (item.hasEOL) {
      flush()
      previousY = null
    }
  }
  flush()
  return lines.join('\n')
}
