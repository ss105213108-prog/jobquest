import { normalizeTextRunGeometry, type GeometryRun } from '../../src/parsers/pdfTextGeometry'
import type {
  VerticalEvidence,
  VerticalRelationState,
} from '../../src/parsers/pdfRowEvidenceGraph'
import type {
  MissingRelationReason,
  VerticalPairDecision,
} from '../helpers/verticalPairDecisionContractHarness'

export const decisionRun = (
  originalIndex: number,
  baseline = 100,
  geometryComparable = true,
): GeometryRun => {
  const run = normalizeTextRunGeometry({
    str: `anonymous-${originalIndex}`,
    transform: [1, 0, 0, 1, originalIndex * 20, baseline],
    width: 12,
    height: 10,
    dir: 'ltr',
    fontName: 'AnonymousSans',
    hasEOL: false,
  }, originalIndex)
  return geometryComparable ? run : { ...run, geometryComparable: false, endX: null }
}

export const anonymousVerticalEvidence = (): VerticalEvidence => ({
  baselineDifference: 0,
  heightRatio: 1,
  verticalOverlapRatio: 1,
  geometryComparable: true,
})

export const relationDecision = (
  leftRunId: number,
  rightRunId: number,
  state: VerticalRelationState = 'SUPPORTED',
  evidence: VerticalEvidence = anonymousVerticalEvidence(),
): VerticalPairDecision => ({
  outcome: 'RELATION',
  leftRunId,
  rightRunId,
  state,
  evidence,
})

export const missingDecision = (
  leftRunId: number,
  rightRunId: number,
  reason: MissingRelationReason = 'UNUSABLE_VERTICAL_EVIDENCE',
): VerticalPairDecision => ({ outcome: 'MISSING', leftRunId, rightRunId, reason })

