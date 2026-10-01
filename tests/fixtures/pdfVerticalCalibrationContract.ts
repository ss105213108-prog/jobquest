import { normalizeTextRunGeometry, type GeometryRun, type PdfTextRun } from '../../src/parsers/pdfTextGeometry'

export function calibrationRun(
  originalIndex: number,
  baseline: number,
  height: number,
  overrides: Partial<PdfTextRun> = {},
): GeometryRun {
  return normalizeTextRunGeometry({
    str: `anonymous-calibration-${originalIndex}`,
    transform: [1, 0, 0, 1, 20 + originalIndex * 32, baseline],
    width: 24,
    height,
    dir: 'ltr',
    fontName: 'AnonymousCalibrationFont',
    hasEOL: false,
    ...overrides,
  }, originalIndex)
}

export const validCalibrationFamily = (): GeometryRun[] => [
  calibrationRun(2, 132, 14),
  calibrationRun(0, 100, 10),
  calibrationRun(1, 116, 12),
]

export const uniformlyScaledCalibrationFamily = (scale: number): GeometryRun[] => validCalibrationFamily().map((run) => ({
  ...run,
  x: run.x * scale,
  y: run.y * scale,
  baseline: run.baseline * scale,
  width: run.width * scale,
  height: run.height * scale,
  endX: run.endX === null ? null : run.endX * scale,
}))

export const equalHeightPairFamily = (scale = 1): readonly [GeometryRun, GeometryRun] => [
  calibrationRun(0, 100 * scale, 10 * scale),
  calibrationRun(1, 105 * scale, 10 * scale),
]
