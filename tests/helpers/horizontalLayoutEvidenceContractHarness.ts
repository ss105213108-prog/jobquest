import type { HorizontalLayoutEvidence } from '../../src/parsers/pdfHorizontalLayoutEvidence'

interface ExactHorizontalEdgeEvent {
  readonly runId: number
  readonly sliceId: string
  readonly edge: 'START' | 'END'
  readonly rawX: number
  readonly pageNormalizedX: number
}

export function exactHorizontalEdgeEvents(evidence: HorizontalLayoutEvidence): readonly ExactHorizontalEdgeEvent[] {
  return evidence.runIntervals.flatMap((interval) => ([
    {
      runId: interval.runId,
      sliceId: interval.sliceId,
      edge: 'START' as const,
      rawX: interval.raw.startX,
      pageNormalizedX: interval.pageNormalized.start,
    },
    {
      runId: interval.runId,
      sliceId: interval.sliceId,
      edge: 'END' as const,
      rawX: interval.raw.endX,
      pageNormalizedX: interval.pageNormalized.end,
    },
  ])).sort((left, right) => left.rawX - right.rawX
    || left.edge.localeCompare(right.edge)
    || left.runId - right.runId)
}

export function scaleInvariantProjection(evidence: HorizontalLayoutEvidence) {
  return {
    intervals: evidence.runIntervals.map((interval) => ({
      runId: interval.runId,
      sliceId: interval.sliceId,
      pageNormalized: interval.pageNormalized,
    })),
    slices: evidence.slices,
    gaps: evidence.sliceGaps.map((gap) => ({
      sliceId: gap.sliceId,
      leftRunId: gap.leftRunId,
      rightRunId: gap.rightRunId,
      pageNormalizedGap: gap.pageNormalizedGap,
      leftGlyphNormalizedGap: gap.leftGlyphNormalizedGap,
    })),
    segments: evidence.segments.map((segment) => ({
      pageNormalized: segment.pageNormalized,
      occupiedByRunIds: segment.occupiedByRunIds,
      occupiedInSliceIds: segment.occupiedInSliceIds,
      emptyInSliceIds: segment.emptyInSliceIds,
    })),
    availability: evidence.availability,
  }
}
