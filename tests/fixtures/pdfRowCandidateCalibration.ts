import {
  baselineDifference,
  heightRatio,
  normalizeTextRunGeometry,
  verticalOverlapRatio,
  type GeometryRun,
  type PdfTextRun,
} from '../../src/parsers/pdfTextGeometry'

export type RowCalibrationClassification = 'MUST_GROUP' | 'MUST_SEPARATE' | 'AMBIGUOUS'

export interface RowPairEvidence {
  baselineDifference: number | null
  normalizedBaselineDifference: number | null
  heightRatio: number | null
  verticalOverlapRatio: number | null
  orientationCompatible: boolean
}

export interface RowCalibrationCase {
  id: string
  classification: RowCalibrationClassification
  description: string
  runs: readonly [GeometryRun, GeometryRun]
  evidence: RowPairEvidence
  scaleFamily?: string
}

const sourceRun = (
  text: string,
  originalIndex: number,
  x: number,
  baseline: number,
  width: number,
  height: number,
  overrides: Partial<PdfTextRun> = {},
) => normalizeTextRunGeometry({
  str: text,
  transform: [1, 0, 0, 1, x, baseline],
  width,
  height,
  dir: 'ltr',
  fontName: 'AnonymousCalibrationFont',
  hasEOL: false,
  ...overrides,
}, originalIndex)

export const measureRowPair = (first: GeometryRun, second: GeometryRun): RowPairEvidence => {
  const difference = baselineDifference(first, second)
  const averageHeight = Number.isFinite(first.height) && Number.isFinite(second.height)
    && first.height > 0 && second.height > 0
    ? (first.height + second.height) / 2
    : null
  return {
    baselineDifference: difference,
    normalizedBaselineDifference: difference !== null && averageHeight !== null ? difference / averageHeight : null,
    heightRatio: heightRatio(first, second),
    verticalOverlapRatio: verticalOverlapRatio(first, second),
    orientationCompatible: first.geometryComparable
      && second.geometryComparable
      && first.orientation === second.orientation,
  }
}

const pairCase = (
  id: string,
  classification: RowCalibrationClassification,
  description: string,
  first: GeometryRun,
  second: GeometryRun,
  scaleFamily?: string,
): RowCalibrationCase => ({
  id,
  classification,
  description,
  runs: [first, second],
  evidence: measureRowPair(first, second),
  ...(scaleFamily ? { scaleFamily } : {}),
})

const sameBaselineBase = pairCase(
  'same-baseline-same-height-base',
  'MUST_GROUP',
  'Equal baseline and height at the base scale.',
  sourceRun('Alpha', 0, 24, 120, 30, 12),
  sourceRun('Beta', 1, 60, 120, 28, 12),
  'same-baseline',
)

const sameBaselineScaled = pairCase(
  'same-baseline-same-height-scaled',
  'MUST_GROUP',
  'Uniformly scaled version of the equal-baseline case.',
  sourceRun('Alpha', 0, 72, 360, 90, 36),
  sourceRun('Beta', 1, 180, 360, 84, 36),
  'same-baseline',
)

const separatedRowsBase = pairCase(
  'clearly-separated-rows-base',
  'MUST_SEPARATE',
  'Distinct vertical rows with no vertical overlap.',
  sourceRun('Upper', 0, 24, 120, 30, 12),
  sourceRun('Lower', 1, 24, 84, 30, 12),
  'separated-rows',
)

const separatedRowsScaled = pairCase(
  'clearly-separated-rows-scaled',
  'MUST_SEPARATE',
  'Uniformly scaled version of the distinct-row case.',
  sourceRun('Upper', 0, 72, 360, 90, 36),
  sourceRun('Lower', 1, 72, 252, 90, 36),
  'separated-rows',
)

const jitterBase = pairCase(
  'exporter-jitter-base',
  'AMBIGUOUS',
  'Small relative baseline displacement without an approved tolerance policy.',
  sourceRun('Gamma', 0, 24, 120, 36, 12),
  sourceRun('Delta', 1, 66, 121.2, 34, 12),
  'exporter-jitter',
)

const jitterScaled = pairCase(
  'exporter-jitter-scaled',
  'AMBIGUOUS',
  'Uniformly scaled exporter-jitter geometry.',
  sourceRun('Gamma', 0, 72, 360, 108, 36),
  sourceRun('Delta', 1, 198, 363.6, 102, 36),
  'exporter-jitter',
)

export const rowCalibrationCases: readonly RowCalibrationCase[] = [
  sameBaselineBase,
  sameBaselineScaled,
  pairCase(
    'same-baseline-far-apart-x',
    'MUST_GROUP',
    'X separation does not affect vertical row candidacy.',
    sourceRun('Left', 0, 20, 200, 30, 12),
    sourceRun('Right', 1, 520, 200, 34, 12),
  ),
  pairCase(
    'same-y-left-right-columns',
    'MUST_GROUP',
    'Left and right columns share a row candidate; Visual Group separates them later.',
    sourceRun('Sidebar', 0, 24, 240, 46, 14),
    sourceRun('Main', 1, 330, 240, 38, 14),
  ),
  pairCase(
    'shared-baseline-mixed-heights',
    'MUST_GROUP',
    'Reasonable mixed text heights share the same visual baseline.',
    sourceRun('Label', 0, 24, 180, 34, 10),
    sourceRun('Value', 1, 64, 180, 62, 15),
  ),
  separatedRowsBase,
  separatedRowsScaled,
  jitterBase,
  jitterScaled,
  pairCase(
    'superscript-small-label',
    'AMBIGUOUS',
    'A small raised label cannot be classified without a membership policy.',
    sourceRun('Body', 0, 24, 140, 42, 14),
    sourceRun('Tag', 1, 70, 150, 14, 5),
  ),
  pairCase(
    'mixed-height-offset-baseline',
    'AMBIGUOUS',
    'Mixed heights and offset baselines provide conflicting vertical signals.',
    sourceRun('Primary', 0, 24, 160, 48, 16),
    sourceRun('Secondary', 1, 78, 166, 42, 9),
  ),
]

export const chainingFixture = {
  id: 'pairwise-chaining-trap',
  classification: 'AMBIGUOUS' as const,
  description: 'Adjacent pairs are closer than the endpoints; endpoint evidence must remain visible.',
  runs: [
    sourceRun('A', 0, 24, 100, 12, 10),
    sourceRun('B', 1, 42, 106, 12, 10),
    sourceRun('C', 2, 60, 112, 12, 10),
  ] as const,
}

export const permutationFixture = {
  id: 'input-permutation',
  original: [
    sourceRun('One', 0, 24, 220, 24, 12),
    sourceRun('Two', 1, 54, 220, 24, 12),
    sourceRun('Three', 2, 84, 198, 30, 12),
  ] as const,
  order: [2, 0, 1] as const,
}

export const unsafeGeometryCases = [
  {
    id: 'rotated-transform',
    run: sourceRun('Rotated', 0, 20, 100, 40, 12, { transform: [0, 1, -1, 0, 20, 100] }),
    expected: 'isolated-unsafe' as const,
  },
  {
    id: 'non-finite-x',
    run: sourceRun('Invalid X', 1, 20, 100, 40, 12, { transform: [1, 0, 0, 1, Number.NaN, 100] }),
    expected: 'isolated-unsafe' as const,
  },
  {
    id: 'non-finite-baseline',
    run: sourceRun('Invalid Y', 2, 20, 100, 40, 12, { transform: [1, 0, 0, 1, 20, Number.POSITIVE_INFINITY] }),
    expected: 'isolated-unsafe' as const,
  },
] as const

export const calibrationCaseById = (id: string): RowCalibrationCase => {
  const calibrationCase = rowCalibrationCases.find((candidate) => candidate.id === id)
  if (!calibrationCase) throw new Error(`Unknown row calibration case: ${id}`)
  return calibrationCase
}
