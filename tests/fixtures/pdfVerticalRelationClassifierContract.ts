import { normalizeTextRunGeometry, type GeometryRun } from '../../src/parsers/pdfTextGeometry'
import type { RowEvidenceCandidate } from '../../src/parsers/pdfRowEvidenceGraph'

export interface ClassifierRunOptions {
  text?: string
  x?: number
  width?: number
  height?: number
  fontName?: string
  hasEOL?: boolean
  geometryComparable?: boolean
}

export const classifierRun = (
  originalIndex: number,
  baseline: number,
  options: ClassifierRunOptions = {},
): GeometryRun => {
  const run = normalizeTextRunGeometry({
    str: options.text ?? `anonymous-relation-${originalIndex}`,
    transform: [1, 0, 0, 1, options.x ?? originalIndex * 24, baseline],
    width: options.width ?? 12,
    height: options.height ?? 10,
    dir: 'ltr',
    fontName: options.fontName ?? 'AnonymousRelationFont',
    hasEOL: options.hasEOL ?? false,
  }, originalIndex)
  return options.geometryComparable === false ? { ...run, geometryComparable: false, endX: null } : run
}

export const singletonCandidates = (runs: readonly GeometryRun[]): readonly RowEvidenceCandidate[] => (
  [...runs]
    .sort((left, right) => left.originalIndex - right.originalIndex)
    .map((run) => ({
      id: `candidate:${run.originalIndex}`,
      runIds: [run.originalIndex],
      geometryStatus: 'comparable',
    }))
)

export const oneCandidate = (runs: readonly GeometryRun[]): readonly RowEvidenceCandidate[] => [{
  id: `candidate:${runs.map((run) => run.originalIndex).sort((left, right) => left - right).join('.')}`,
  runIds: runs.map((run) => run.originalIndex),
  geometryStatus: 'comparable',
}]

export const scaleClassifierRuns = (
  runs: readonly GeometryRun[],
  factor: number,
): readonly GeometryRun[] => runs.map((run) => classifierRun(run.originalIndex, run.baseline * factor, {
  text: run.text,
  x: run.x * factor,
  width: run.width * factor,
  height: run.height * factor,
  fontName: run.fontName,
  hasEOL: run.hasEOL,
}))

