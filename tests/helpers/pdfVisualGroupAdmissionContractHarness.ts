import type { InternalPageLayoutEvidenceResult } from '../../src/parsers/pdfPageLayoutEvidence'
import { observeHorizontalLayout } from '../../src/parsers/pdfHorizontalLayoutEvidence'
import type { RowEvidenceGraph } from '../../src/parsers/pdfRowEvidenceGraph'
import { normalizeTextRunGeometry } from '../../src/parsers/pdfTextGeometry'
import {
  isAvailablePageLayoutEvidence,
  type AvailablePageLayoutEvidence,
} from '../../src/parsers/pdfVisualGroupResult'

const pageBounds = {
  minX: 0,
  maxX: 600,
  width: 600,
  source: 'pdf-page-view' as const,
}

export const emptyRowEvidenceGraph = (): RowEvidenceGraph => ({
  runs: [],
  candidates: [],
  relations: [],
})

const availableEvidence = (
  graph: RowEvidenceGraph,
  pageNumber: number,
): AvailablePageLayoutEvidence => {
  const horizontal = observeHorizontalLayout({ graph, pageBounds })
  if (!horizontal.ok) throw new Error(`Invalid anonymous admission fixture: ${horizontal.code}`)
  return {
    status: 'AVAILABLE',
    pageNumber,
    graph,
    horizontalEvidence: horizontal.value,
  }
}

export const fabricatedEmptyAvailableEvidence = (
  pageNumber = 1,
): AvailablePageLayoutEvidence => availableEvidence(emptyRowEvidenceGraph(), pageNumber)

export const fabricatedSingleRunAvailableEvidence = (
  geometry: 'safe' | 'unsafe',
  pageNumber = 1,
): AvailablePageLayoutEvidence => {
  const run = normalizeTextRunGeometry({
    str: 'TOKEN000',
    transform: geometry === 'safe' ? [1, 0, 0, 1, 48, 700] : [0, 1, -1, 0, 48, 700],
    width: 72,
    height: 12,
    dir: 'ltr',
    fontName: 'SyntheticBody',
    hasEOL: false,
  }, 0)
  return availableEvidence({
    runs: [run],
    candidates: [{
      id: geometry === 'safe' ? 'candidate:0' : 'unsafe:0',
      runIds: [0],
      geometryStatus: geometry === 'safe' ? 'comparable' : 'isolated-unsafe',
    }],
    relations: [],
  }, pageNumber)
}

export function executeIfVisualGroupAdmitted<T>(
  evidence: InternalPageLayoutEvidenceResult,
  formation: (value: AvailablePageLayoutEvidence) => T,
): { readonly executed: false } | { readonly executed: true; readonly result: T } {
  if (!isAvailablePageLayoutEvidence(evidence)) return { executed: false }
  return { executed: true, result: formation(evidence) }
}
