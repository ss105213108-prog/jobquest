import { normalizeTextRunGeometry, type GeometryRun, type PdfTextRun } from '../../src/parsers/pdfTextGeometry'
import type { VerticalEvidence, VerticalRelationState } from '../../src/parsers/pdfRowEvidenceGraph'
import type { MissingRelationReason } from '../../src/parsers/pdfRowEvidenceGraphBuilder'

export const anonymousVerticalEvidence: VerticalEvidence = Object.freeze({
  baselineDifference: 0,
  heightRatio: 1,
  verticalOverlapRatio: 1,
  geometryComparable: true,
})

export function anonymousGeometryRun(
  originalIndex: number,
  overrides: Partial<PdfTextRun> = {},
): GeometryRun {
  return normalizeTextRunGeometry({
    str: `anonymous-fragment-${originalIndex}`,
    transform: [1, 0, 0, 1, 24 + originalIndex * 28, 120],
    width: 20,
    height: 10,
    dir: 'ltr',
    fontName: 'AnonymousBuilderFont',
    hasEOL: false,
    ...overrides,
  }, originalIndex)
}

export const rotatedGeometryRun = (originalIndex: number): GeometryRun => anonymousGeometryRun(originalIndex, {
  transform: [0, 1, -1, 0, 120, 80],
})

export const nonFiniteGeometryRun = (originalIndex: number): GeometryRun => anonymousGeometryRun(originalIndex, {
  transform: [1, 0, 0, 1, Number.NaN, 80],
})

export const anonymousRelation = (
  leftRunId: number,
  rightRunId: number,
  state: VerticalRelationState,
) => ({
  outcome: 'RELATION' as const,
  leftRunId,
  rightRunId,
  state,
  evidence: anonymousVerticalEvidence,
})

export const anonymousMissingDecision = (
  leftRunId: number,
  rightRunId: number,
  reason: MissingRelationReason = 'UNUSABLE_VERTICAL_EVIDENCE',
) => ({ outcome: 'MISSING' as const, leftRunId, rightRunId, reason })
