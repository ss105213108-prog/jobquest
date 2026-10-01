import { normalizeTextRunGeometry, type GeometryRun, type PdfTextRun } from '../../src/parsers/pdfTextGeometry'
import type { RowEvidenceCandidate, RowEvidenceGraph } from '../../src/parsers/pdfRowEvidenceGraph'
import type { PhysicalPageBounds } from '../../src/parsers/pdfHorizontalLayoutEvidence'

export interface HorizontalLayoutFixture {
  readonly id: string
  readonly graph: RowEvidenceGraph
  readonly pageBounds: PhysicalPageBounds
}

interface RunSpec {
  readonly id: number
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height?: number
  readonly text?: string
  readonly fontName?: string
  readonly unsafe?: boolean
}

interface SliceSpec {
  readonly id: string
  readonly runIds: readonly number[]
}

export const defaultPageBounds: PhysicalPageBounds = {
  minX: 0,
  maxX: 600,
  width: 600,
  source: 'pdf-page-view',
}

const geometryRun = (spec: RunSpec): GeometryRun => {
  const source: PdfTextRun = {
    str: spec.text ?? `anonymous-${spec.id}`,
    transform: spec.unsafe ? [0, 1, -1, 0, spec.x, spec.y] : [1, 0, 0, 1, spec.x, spec.y],
    width: spec.width,
    height: spec.height ?? 10,
    dir: 'ltr',
    fontName: spec.fontName ?? 'AnonymousLayoutFont',
    hasEOL: false,
  }
  return normalizeTextRunGeometry(source, spec.id)
}

const graphFrom = (runSpecs: readonly RunSpec[], sliceSpecs: readonly SliceSpec[]): RowEvidenceGraph => {
  const runs = runSpecs.map(geometryRun)
  const runById = new Map(runs.map((run) => [run.originalIndex, run]))
  const candidates: RowEvidenceCandidate[] = sliceSpecs.map((slice) => ({
    id: slice.id,
    runIds: slice.runIds,
    geometryStatus: slice.runIds.some((runId) => !runById.get(runId)?.geometryComparable)
      ? 'isolated-unsafe'
      : 'comparable',
  }))
  return { runs, candidates, relations: [] }
}

const fixture = (
  id: string,
  runs: readonly RunSpec[],
  slices: readonly SliceSpec[],
  pageBounds: PhysicalPageBounds = defaultPageBounds,
): HorizontalLayoutFixture => ({ id, graph: graphFrom(runs, slices), pageBounds })

export const horizontalLayoutFixtures: readonly HorizontalLayoutFixture[] = [
  fixture('SINGLE_COLUMN_BASIC', [
    { id: 0, x: 60, y: 500, width: 180 },
    { id: 1, x: 60, y: 470, width: 220 },
    { id: 2, x: 60, y: 440, width: 160 },
  ], [
    { id: 'slice-a', runIds: [0] },
    { id: 'slice-b', runIds: [1] },
    { id: 'slice-c', runIds: [2] },
  ]),
  fixture('TWO_COLUMN_50_50', [
    { id: 0, x: 40, y: 500, width: 180 }, { id: 1, x: 340, y: 500, width: 180 },
    { id: 2, x: 40, y: 470, width: 180 }, { id: 3, x: 340, y: 470, width: 180 },
    { id: 4, x: 40, y: 440, width: 180 }, { id: 5, x: 340, y: 440, width: 180 },
  ], [
    { id: 'slice-a', runIds: [0, 1] },
    { id: 'slice-b', runIds: [2, 3] },
    { id: 'slice-c', runIds: [4, 5] },
  ]),
  fixture('TWO_COLUMN_30_70', [
    { id: 0, x: 30, y: 500, width: 120 }, { id: 1, x: 210, y: 500, width: 350 },
    { id: 2, x: 30, y: 470, width: 120 }, { id: 3, x: 210, y: 470, width: 350 },
  ], [
    { id: 'slice-a', runIds: [0, 1] },
    { id: 'slice-b', runIds: [2, 3] },
  ]),
  fixture('NARROW_SIDEBAR', [
    { id: 0, x: 20, y: 500, width: 80 }, { id: 1, x: 150, y: 500, width: 400 },
    { id: 2, x: 20, y: 470, width: 80 }, { id: 3, x: 150, y: 470, width: 400 },
  ], [
    { id: 'slice-a', runIds: [0, 1] },
    { id: 'slice-b', runIds: [2, 3] },
  ]),
  fixture('WIDE_SIDEBAR', [
    { id: 0, x: 20, y: 500, width: 170 }, { id: 1, x: 240, y: 500, width: 310 },
    { id: 2, x: 20, y: 470, width: 170 }, { id: 3, x: 240, y: 470, width: 310 },
  ], [
    { id: 'slice-a', runIds: [0, 1] },
    { id: 'slice-b', runIds: [2, 3] },
  ]),
  fixture('FULL_WIDTH_HEADER_PLUS_COLUMNS', [
    { id: 0, x: 40, y: 530, width: 480 },
    { id: 1, x: 40, y: 490, width: 180 }, { id: 2, x: 340, y: 490, width: 180 },
    { id: 3, x: 40, y: 460, width: 180 }, { id: 4, x: 340, y: 460, width: 180 },
  ], [
    { id: 'slice-header', runIds: [0] },
    { id: 'slice-row-a', runIds: [1, 2] },
    { id: 'slice-row-b', runIds: [3, 4] },
  ]),
  fixture('SINGLE_COLUMN_LARGE_INLINE_GAP', [
    { id: 0, x: 60, y: 500, width: 70 }, { id: 1, x: 360, y: 500, width: 150 },
  ], [{ id: 'slice-a', runIds: [0, 1] }]),
  fixture('REPEATED_LABEL_VALUE_ROWS', [
    { id: 0, x: 60, y: 500, width: 80 }, { id: 1, x: 260, y: 500, width: 220 },
    { id: 2, x: 60, y: 470, width: 80 }, { id: 3, x: 260, y: 470, width: 220 },
    { id: 4, x: 60, y: 440, width: 80 }, { id: 5, x: 260, y: 440, width: 220 },
  ], [
    { id: 'slice-a', runIds: [0, 1] },
    { id: 'slice-b', runIds: [2, 3] },
    { id: 'slice-c', runIds: [4, 5] },
  ]),
  fixture('MIXED_FONT_MIXED_HEIGHT', [
    { id: 0, x: 60, y: 500, width: 100, height: 8, fontName: 'Anonymous-A' },
    { id: 1, x: 180, y: 500, width: 160, height: 16, fontName: 'Anonymous-B' },
  ], [{ id: 'slice-a', runIds: [0, 1] }]),
  fixture('SPARSE_TWO_RUN_PAGE', [
    { id: 0, x: 80, y: 400, width: 100 }, { id: 1, x: 300, y: 400, width: 120 },
  ], [{ id: 'slice-a', runIds: [0, 1] }]),
  fixture('DENSE_MULTI_ROW_PAGE', [
    { id: 0, x: 20, y: 520, width: 60 }, { id: 1, x: 100, y: 520, width: 100 }, { id: 2, x: 300, y: 520, width: 240 },
    { id: 3, x: 20, y: 490, width: 180 }, { id: 4, x: 300, y: 490, width: 100 }, { id: 5, x: 420, y: 490, width: 120 },
    { id: 6, x: 20, y: 460, width: 60 }, { id: 7, x: 100, y: 460, width: 100 }, { id: 8, x: 300, y: 460, width: 240 },
  ], [
    { id: 'slice-a', runIds: [0, 1, 2] },
    { id: 'slice-b', runIds: [3, 4, 5] },
    { id: 'slice-c', runIds: [6, 7, 8] },
  ]),
  fixture('UNSAFE_ONLY_PAGE', [
    { id: 0, x: 60, y: 500, width: 100, unsafe: true },
    { id: 1, x: 200, y: 470, width: 100, unsafe: true },
  ], [
    { id: 'unsafe-0', runIds: [0] },
    { id: 'unsafe-1', runIds: [1] },
  ]),
  fixture('MIXED_SAFE_UNSAFE_PAGE', [
    { id: 0, x: 60, y: 500, width: 100 },
    { id: 1, x: 200, y: 500, width: 100, unsafe: true },
    { id: 2, x: 340, y: 500, width: 100 },
  ], [
    { id: 'slice-safe', runIds: [0, 2] },
    { id: 'unsafe-1', runIds: [1] },
  ]),
  fixture('NONZERO_PAGE_MIN_X', [
    { id: 0, x: 120, y: 500, width: 100 },
  ], [{ id: 'slice-a', runIds: [0] }], {
    minX: 100,
    maxX: 700,
    width: 600,
    source: 'pdf-page-view',
  }),
  fixture('OUT_OF_PAGE_INTERVAL', [
    { id: 0, x: -20, y: 500, width: 80 },
    { id: 1, x: 560, y: 470, width: 80 },
  ], [
    { id: 'slice-a', runIds: [0] },
    { id: 'slice-b', runIds: [1] },
  ]),
]

export const horizontalLayoutFixtureById = (id: string): HorizontalLayoutFixture => {
  const found = horizontalLayoutFixtures.find((candidate) => candidate.id === id)
  if (!found) throw new Error(`Unknown horizontal layout fixture: ${id}`)
  return found
}

export function scaledHorizontalLayoutFixture(source: HorizontalLayoutFixture, factor: number): HorizontalLayoutFixture {
  const runs = source.graph.runs.map((run) => ({
    ...run,
    x: run.x * factor,
    y: run.y * factor,
    baseline: run.baseline * factor,
    width: run.width * factor,
    height: run.height * factor,
    endX: run.endX === null ? null : run.endX * factor,
  }))
  return {
    id: `${source.id}_SCALED_${factor}`,
    graph: {
      runs,
      candidates: source.graph.candidates.map((candidate) => ({ ...candidate, runIds: [...candidate.runIds] })),
      relations: source.graph.relations.map((relation) => ({
        ...relation,
        evidence: {
          ...relation.evidence,
          baselineDifference: relation.evidence.baselineDifference === null
            ? null
            : relation.evidence.baselineDifference * factor,
        },
      })),
    },
    pageBounds: {
      ...source.pageBounds,
      minX: source.pageBounds.minX * factor,
      maxX: source.pageBounds.maxX * factor,
      width: source.pageBounds.width * factor,
    },
  }
}
