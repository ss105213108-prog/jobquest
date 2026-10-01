import { normalizeTextRunGeometry, type GeometryRun } from '../../src/parsers/pdfTextGeometry'

export interface CandidateRunOptions {
  text?: string
  x?: number
  width?: number
  height?: number
  fontName?: string
  hasEOL?: boolean
  direction?: string
  transform?: ArrayLike<number>
}

export const candidateRun = (
  originalIndex: number,
  baseline: number,
  options: CandidateRunOptions = {},
): GeometryRun => normalizeTextRunGeometry({
  str: options.text ?? `fragment-${originalIndex}`,
  transform: options.transform ?? [1, 0, 0, 1, options.x ?? originalIndex * 20, baseline],
  width: options.width ?? 12,
  height: options.height ?? 10,
  dir: options.direction ?? 'ltr',
  fontName: options.fontName ?? 'AnonymousSans',
  hasEOL: options.hasEOL ?? false,
}, originalIndex)

export const exactBaselineRuns = (): readonly GeometryRun[] => [
  candidateRun(0, 100, { text: '左段' }),
  candidateRun(1, 100, { text: '右段', x: 40 }),
]

export const farApartExactBaselineRuns = (): readonly GeometryRun[] => [
  candidateRun(0, 100, { x: 10 }),
  candidateRun(1, 100, { x: 1000 }),
]

export const tinyJitterRuns = (): readonly GeometryRun[] => [
  candidateRun(0, 100),
  candidateRun(1, 100 + 1e-9),
]

export const mixedHeightRuns = (offset = 0): readonly GeometryRun[] => [
  candidateRun(0, 100, { height: 8 }),
  candidateRun(1, 100 + offset, { height: 18 }),
]

export const splitCjkRuns = (jitter = 0): readonly GeometryRun[] => [
  candidateRun(0, 100, { text: '工', width: 10 }),
  candidateRun(1, 100 + jitter, { text: '作', x: 20, width: 10 }),
  candidateRun(2, 100, { text: '經', x: 30, width: 10 }),
  candidateRun(3, 100, { text: '驗', x: 40, width: 10 }),
]

export const splitLatinRuns = (): readonly GeometryRun[] => [
  candidateRun(0, 100, { text: 'Software', width: 42 }),
  candidateRun(1, 100, { text: 'Engineer', x: 50, width: 40 }),
]

export const scaleRuns = (runs: readonly GeometryRun[], factor: number): readonly GeometryRun[] => runs.map((run) => (
  candidateRun(run.originalIndex, run.baseline * factor, {
    text: run.text,
    x: run.x * factor,
    width: run.width * factor,
    height: run.height * factor,
    fontName: run.fontName,
    hasEOL: run.hasEOL,
  })
))

