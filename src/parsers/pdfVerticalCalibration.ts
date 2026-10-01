import {
  heightRatio,
  verticalOverlapRatio,
  type GeometryRun,
} from './pdfTextGeometry'
import type { RunId } from './pdfRowEvidenceGraph'

export interface VerticalRunCalibrationEvidence {
  readonly runId: RunId
  readonly heightToRepresentativeRatio: number | null
}

export interface VerticalCalibrationSnapshot {
  readonly schemaVersion: 1
  readonly scope: 'page'
  readonly sample: {
    readonly comparableRunCount: number
    readonly usableHeightCount: number
    readonly unusableHeightCount: number
    readonly usablePairCount: number
  }
  readonly normalization: {
    readonly representativeHeight: number
    readonly lowerQuartileHeightRatio: number
    readonly upperQuartileHeightRatio: number
    readonly heightDispersionRatio: number
  }
  readonly runs: readonly VerticalRunCalibrationEvidence[]
}

export type VerticalCalibrationFailureCode = 'INSUFFICIENT_CALIBRATION' | 'INVALID_GEOMETRY_CONTEXT'

export type VerticalCalibrationResult =
  | { ok: true; value: VerticalCalibrationSnapshot }
  | { ok: false; code: VerticalCalibrationFailureCode; runIds?: readonly RunId[] }

export interface NormalizedVerticalPairEvidence {
  readonly baselineDifferenceToRepresentativeHeight: number | null
  readonly baselineDifferenceToPairHeight: number | null
  readonly verticalOverlapRatio: number | null
  readonly heightRatio: number | null
}

const quantile = (sortedValues: readonly number[], fraction: number): number => {
  const position = (sortedValues.length - 1) * fraction
  const lowerIndex = Math.floor(position)
  const upperIndex = Math.ceil(position)
  if (lowerIndex === upperIndex) return sortedValues[lowerIndex]
  const weight = position - lowerIndex
  return sortedValues[lowerIndex] * (1 - weight) + sortedValues[upperIndex] * weight
}

const freezeSnapshot = (snapshot: VerticalCalibrationSnapshot): VerticalCalibrationSnapshot => {
  for (const run of snapshot.runs) Object.freeze(run)
  Object.freeze(snapshot.runs)
  Object.freeze(snapshot.sample)
  Object.freeze(snapshot.normalization)
  return Object.freeze(snapshot)
}

const invalidContext = (runIds: readonly RunId[]): VerticalCalibrationResult => ({
  ok: false,
  code: 'INVALID_GEOMETRY_CONTEXT',
  runIds: [...new Set(runIds)].sort((left, right) => left - right),
})

export function calibrateVerticalEvidence(
  inputRuns: readonly GeometryRun[],
): VerticalCalibrationResult {
  const canonicalRuns = [...inputRuns].sort((left, right) => left.originalIndex - right.originalIndex)
  const seenIds = new Set<RunId>()
  const invalidRunIds = new Set<RunId>()

  for (const run of canonicalRuns) {
    if (seenIds.has(run.originalIndex)) invalidRunIds.add(run.originalIndex)
    seenIds.add(run.originalIndex)
    if (!run.geometryComparable
      || !Number.isFinite(run.baseline)
      || !Number.isFinite(run.y)
      || !Number.isFinite(run.height)
      || run.height < 0) {
      invalidRunIds.add(run.originalIndex)
    }
  }
  if (invalidRunIds.size > 0) return invalidContext([...invalidRunIds])

  const usableHeights = canonicalRuns
    .map((run) => run.height)
    .filter((height) => height > 0)
    .sort((left, right) => left - right)
  if (usableHeights.length === 0) return { ok: false, code: 'INSUFFICIENT_CALIBRATION' }

  const representativeHeight = quantile(usableHeights, 0.5)
  const lowerQuartileHeight = quantile(usableHeights, 0.25)
  const upperQuartileHeight = quantile(usableHeights, 0.75)
  const usableHeightCount = usableHeights.length
  const snapshot: VerticalCalibrationSnapshot = {
    schemaVersion: 1,
    scope: 'page',
    sample: {
      comparableRunCount: canonicalRuns.length,
      usableHeightCount,
      unusableHeightCount: canonicalRuns.length - usableHeightCount,
      usablePairCount: usableHeightCount * (usableHeightCount - 1) / 2,
    },
    normalization: {
      representativeHeight,
      lowerQuartileHeightRatio: lowerQuartileHeight / representativeHeight,
      upperQuartileHeightRatio: upperQuartileHeight / representativeHeight,
      heightDispersionRatio: (upperQuartileHeight - lowerQuartileHeight) / representativeHeight,
    },
    runs: canonicalRuns.map((run) => ({
      runId: run.originalIndex,
      heightToRepresentativeRatio: run.height > 0 ? run.height / representativeHeight : null,
    })),
  }

  return { ok: true, value: freezeSnapshot(snapshot) }
}

export function observeNormalizedVerticalPair(
  first: GeometryRun,
  second: GeometryRun,
  calibration: VerticalCalibrationSnapshot,
): NormalizedVerticalPairEvidence {
  const baselineDifference = Number.isFinite(first.baseline) && Number.isFinite(second.baseline)
    ? Math.abs(first.baseline - second.baseline)
    : null
  const usablePairHeight = first.height > 0 && second.height > 0
    && Number.isFinite(first.height) && Number.isFinite(second.height)
    ? (first.height + second.height) / 2
    : null

  return Object.freeze({
    baselineDifferenceToRepresentativeHeight: baselineDifference === null
      ? null
      : baselineDifference / calibration.normalization.representativeHeight,
    baselineDifferenceToPairHeight: baselineDifference === null || usablePairHeight === null
      ? null
      : baselineDifference / usablePairHeight,
    verticalOverlapRatio: verticalOverlapRatio(first, second),
    heightRatio: heightRatio(first, second),
  })
}
