import { estimatedGlyphAdvance, type GeometryRun } from './pdfTextGeometry'
import type { PhysicalPageBounds } from './pdfPageGeometry'
import {
  validateRowEvidenceGraph,
  type RowEvidenceGraph,
  type RunId,
} from './pdfRowEvidenceGraph'

export type { PhysicalPageBounds } from './pdfPageGeometry'

export interface HorizontalInterval {
  readonly startX: number
  readonly endX: number
  readonly width: number
}

export interface NormalizedHorizontalInterval {
  readonly start: number
  readonly end: number
  readonly width: number
}

export interface PageGeometryObservation {
  readonly physical: PhysicalPageBounds
  readonly occupied: HorizontalInterval | null
}

export interface RunIntervalObservation {
  readonly intervalId: string
  readonly runId: RunId
  readonly sliceId: string
  readonly raw: HorizontalInterval
  readonly pageNormalized: NormalizedHorizontalInterval
  readonly estimatedGlyphAdvance: number | null
}

export interface VerticalObservationSlice {
  readonly sliceId: string
  readonly sourceCandidateId: string
  readonly runIds: readonly RunId[]
  readonly orderedIntervalIds: readonly string[]
}

export interface HorizontalGapObservation {
  readonly sliceId: string
  readonly leftRunId: RunId
  readonly rightRunId: RunId
  readonly rawGap: number
  readonly pageNormalizedGap: number
  readonly leftGlyphNormalizedGap: number | null
}

export interface HorizontalSweepSegment {
  readonly segmentId: string
  readonly raw: HorizontalInterval
  readonly pageNormalized: NormalizedHorizontalInterval
  readonly occupiedByRunIds: readonly RunId[]
  readonly occupiedInSliceIds: readonly string[]
  readonly emptyInSliceIds: readonly string[]
}

export interface HorizontalEvidenceAvailability {
  readonly safeRunState: 'NONE' | 'AVAILABLE'
  readonly verticalContext: 'NONE' | 'SINGLE_SLICE' | 'MULTIPLE_SLICES'
  readonly physicalPageNormalization: 'AVAILABLE'
  readonly excludedUnsafeRunIds: readonly RunId[]
}

export interface HorizontalLayoutEvidence {
  readonly schemaVersion: 1
  readonly scope: 'page'
  readonly pageGeometry: PageGeometryObservation
  readonly runIntervals: readonly RunIntervalObservation[]
  readonly slices: readonly VerticalObservationSlice[]
  readonly sliceGaps: readonly HorizontalGapObservation[]
  readonly segments: readonly HorizontalSweepSegment[]
  readonly availability: HorizontalEvidenceAvailability
}

export interface HorizontalLayoutIssue {
  readonly code: string
  readonly runIds?: readonly RunId[]
}

export type HorizontalLayoutObservationResult =
  | { readonly ok: true; readonly value: HorizontalLayoutEvidence }
  | {
      readonly ok: false
      readonly code: 'INVALID_LAYOUT_CONTEXT'
      readonly issues: readonly HorizontalLayoutIssue[]
    }

const sortedUniqueNumbers = (values: readonly number[]) => [...new Set(values)].sort((left, right) => left - right)
const sortedUniqueStrings = (values: readonly string[]) => [...new Set(values)].sort()
const intervalId = (runId: RunId) => `interval:${runId}`

const issueKey = (issue: HorizontalLayoutIssue) => [issue.code, ...(issue.runIds ?? [])].join('|')

const failure = (inputIssues: readonly HorizontalLayoutIssue[]): HorizontalLayoutObservationResult => {
  const issues = new Map<string, HorizontalLayoutIssue>()
  for (const issue of inputIssues) {
    const normalized = {
      ...issue,
      ...(issue.runIds ? { runIds: sortedUniqueNumbers(issue.runIds) } : {}),
    }
    issues.set(issueKey(normalized), normalized)
  }
  return {
    ok: false,
    code: 'INVALID_LAYOUT_CONTEXT',
    issues: [...issues.values()].sort((left, right) => issueKey(left).localeCompare(issueKey(right))),
  }
}

const normalizedInterval = (
  startX: number,
  endX: number,
  pageBounds: PhysicalPageBounds,
): NormalizedHorizontalInterval => ({
  start: (startX - pageBounds.minX) / pageBounds.width,
  end: (endX - pageBounds.minX) / pageBounds.width,
  width: (endX - startX) / pageBounds.width,
})

const pageBoundsIssues = (pageBounds: PhysicalPageBounds): HorizontalLayoutIssue[] => {
  const issues: HorizontalLayoutIssue[] = []
  if (pageBounds.source !== 'pdf-page-view') issues.push({ code: 'INVALID_PAGE_BOUNDS_SOURCE' })
  if (!Number.isFinite(pageBounds.minX)) issues.push({ code: 'NONFINITE_PAGE_MIN_X' })
  if (!Number.isFinite(pageBounds.maxX)) issues.push({ code: 'NONFINITE_PAGE_MAX_X' })
  if (!Number.isFinite(pageBounds.width)) issues.push({ code: 'NONFINITE_PAGE_WIDTH' })
  if (Number.isFinite(pageBounds.minX) && Number.isFinite(pageBounds.maxX) && pageBounds.maxX <= pageBounds.minX) {
    issues.push({ code: 'INVALID_PAGE_RANGE' })
  }
  if (Number.isFinite(pageBounds.minX)
    && Number.isFinite(pageBounds.maxX)
    && Number.isFinite(pageBounds.width)
    && pageBounds.width !== pageBounds.maxX - pageBounds.minX) {
    issues.push({ code: 'INCONSISTENT_PAGE_WIDTH' })
  }
  return issues
}

const safeRunIntervalIssues = (run: GeometryRun): HorizontalLayoutIssue[] => {
  if (!run.geometryComparable) return []
  if (!Number.isFinite(run.x)
    || !Number.isFinite(run.width)
    || run.endX === null
    || !Number.isFinite(run.endX)
    || run.width < 0
    || run.endX < run.x
    || run.endX !== run.x + run.width) {
    return [{ code: 'IMPOSSIBLE_SAFE_INTERVAL', runIds: [run.originalIndex] }]
  }
  return []
}

export function observeHorizontalLayout(input: {
  readonly graph: RowEvidenceGraph
  readonly pageBounds: PhysicalPageBounds
}): HorizontalLayoutObservationResult {
  const graphValidation = validateRowEvidenceGraph(input.graph)
  const issues: HorizontalLayoutIssue[] = [
    ...graphValidation.issues.map((issue) => ({
      code: issue.code,
      ...(issue.runIds ? { runIds: [...issue.runIds] } : {}),
    })),
    ...pageBoundsIssues(input.pageBounds),
    ...input.graph.runs.flatMap(safeRunIntervalIssues),
  ]
  if (issues.length > 0) return failure(issues)

  const safeRuns = input.graph.runs
    .filter((run) => run.geometryComparable)
    .slice()
    .sort((left, right) => left.x - right.x
      || (left.endX ?? left.x) - (right.endX ?? right.x)
      || left.originalIndex - right.originalIndex)
  const excludedUnsafeRunIds = input.graph.runs
    .filter((run) => !run.geometryComparable)
    .map((run) => run.originalIndex)
    .sort((left, right) => left - right)

  const comparableCandidates = input.graph.candidates
    .filter((candidate) => candidate.geometryStatus === 'comparable')
    .slice()
    .sort((left, right) => left.id.localeCompare(right.id))
  const sliceIdByRunId = new Map<RunId, string>()
  for (const candidate of comparableCandidates) {
    for (const runId of candidate.runIds) sliceIdByRunId.set(runId, candidate.id)
  }

  const runIntervals: RunIntervalObservation[] = safeRuns.map((run) => {
    const endX = run.endX as number
    return {
      intervalId: intervalId(run.originalIndex),
      runId: run.originalIndex,
      sliceId: sliceIdByRunId.get(run.originalIndex) as string,
      raw: { startX: run.x, endX, width: run.width },
      pageNormalized: normalizedInterval(run.x, endX, input.pageBounds),
      estimatedGlyphAdvance: estimatedGlyphAdvance(run),
    }
  })
  const intervalByRunId = new Map(runIntervals.map((interval) => [interval.runId, interval]))
  const intervalById = new Map(runIntervals.map((interval) => [interval.intervalId, interval]))

  const slices: VerticalObservationSlice[] = comparableCandidates.map((candidate) => {
    const orderedIntervals = candidate.runIds
      .map((runId) => intervalByRunId.get(runId))
      .filter((interval): interval is RunIntervalObservation => interval !== undefined)
      .sort((left, right) => left.raw.startX - right.raw.startX
        || left.raw.endX - right.raw.endX
        || left.runId - right.runId)
    return {
      sliceId: candidate.id,
      sourceCandidateId: candidate.id,
      runIds: [...candidate.runIds].sort((left, right) => left - right),
      orderedIntervalIds: orderedIntervals.map((interval) => interval.intervalId),
    }
  })

  const sliceGaps: HorizontalGapObservation[] = []
  for (const slice of slices) {
    const orderedIntervals = slice.orderedIntervalIds.map((id) => intervalById.get(id) as RunIntervalObservation)
    for (let index = 0; index < orderedIntervals.length - 1; index += 1) {
      const left = orderedIntervals[index]
      const right = orderedIntervals[index + 1]
      const rawGap = right.raw.startX - left.raw.endX
      sliceGaps.push({
        sliceId: slice.sliceId,
        leftRunId: left.runId,
        rightRunId: right.runId,
        rawGap,
        pageNormalizedGap: rawGap / input.pageBounds.width,
        leftGlyphNormalizedGap: left.estimatedGlyphAdvance === null || left.estimatedGlyphAdvance === 0
          ? null
          : rawGap / left.estimatedGlyphAdvance,
      })
    }
  }
  sliceGaps.sort((left, right) => left.sliceId.localeCompare(right.sliceId)
    || left.leftRunId - right.leftRunId
    || left.rightRunId - right.rightRunId)

  const eventPoints = sortedUniqueNumbers(runIntervals.flatMap((interval) => [
    interval.raw.startX,
    interval.raw.endX,
  ]))
  const sliceIds = slices.map((slice) => slice.sliceId)
  const segments: HorizontalSweepSegment[] = []
  for (let index = 0; index < eventPoints.length - 1; index += 1) {
    const startX = eventPoints[index]
    const endX = eventPoints[index + 1]
    if (endX <= startX) continue
    const occupiedIntervals = runIntervals.filter((interval) => (
      interval.raw.startX < endX && interval.raw.endX > startX
    ))
    const occupiedInSliceIds = sortedUniqueStrings(occupiedIntervals.map((interval) => interval.sliceId))
    const occupiedSliceSet = new Set(occupiedInSliceIds)
    segments.push({
      segmentId: `segment:${startX}:${endX}`,
      raw: { startX, endX, width: endX - startX },
      pageNormalized: normalizedInterval(startX, endX, input.pageBounds),
      occupiedByRunIds: occupiedIntervals.map((interval) => interval.runId).sort((left, right) => left - right),
      occupiedInSliceIds,
      emptyInSliceIds: sliceIds.filter((sliceId) => !occupiedSliceSet.has(sliceId)).sort(),
    })
  }

  const occupied = runIntervals.length === 0
    ? null
    : (() => {
        const startX = Math.min(...runIntervals.map((interval) => interval.raw.startX))
        const endX = Math.max(...runIntervals.map((interval) => interval.raw.endX))
        return { startX, endX, width: endX - startX }
      })()

  return {
    ok: true,
    value: {
      schemaVersion: 1,
      scope: 'page',
      pageGeometry: {
        physical: { ...input.pageBounds },
        occupied,
      },
      runIntervals,
      slices,
      sliceGaps,
      segments,
      availability: {
        safeRunState: runIntervals.length === 0 ? 'NONE' : 'AVAILABLE',
        verticalContext: slices.length === 0 ? 'NONE' : slices.length === 1 ? 'SINGLE_SLICE' : 'MULTIPLE_SLICES',
        physicalPageNormalization: 'AVAILABLE',
        excludedUnsafeRunIds,
      },
    },
  }
}
