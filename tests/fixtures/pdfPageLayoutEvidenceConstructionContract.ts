import type { PdfTextRun } from '../../src/parsers/pdfTextGeometry'
import type { PhysicalPageBounds } from '../../src/parsers/pdfPageGeometry'
import { layoutById } from './pdfReconstructionLayouts'
import { toPdfTextRuns } from '../helpers/pdfPageReconstructionHandoffContractHarness'

export interface IsolatedEvidenceFixture {
  readonly id: string
  readonly items: readonly PdfTextRun[]
  readonly pageBounds: PhysicalPageBounds
}

const standardBounds: PhysicalPageBounds = {
  minX: 0,
  maxX: 600,
  width: 600,
  source: 'pdf-page-view',
}

const run = (
  str: string,
  x: number,
  y: number,
  width: number,
  options: { readonly height?: number; readonly rotated?: boolean } = {},
): PdfTextRun => ({
  str,
  transform: options.rotated ? [0, 1, -1, 0, x, y] : [1, 0, 0, 1, x, y],
  width,
  height: options.height ?? 10,
  dir: 'ltr',
  fontName: 'AnonymousEvidenceFont',
  hasEOL: false,
})

const existingLayout = (
  id: string,
  layoutId: string,
  pageBounds: PhysicalPageBounds = standardBounds,
): IsolatedEvidenceFixture => ({
  id,
  items: toPdfTextRuns(layoutById(layoutId).runs),
  pageBounds,
})

export const availableEvidenceFixtures: readonly IsolatedEvidenceFixture[] = [
  existingLayout('SINGLE_COLUMN', 'single-column'),
  existingLayout('TWO_COLUMN_50_50', 'two-column'),
  {
    id: 'TWO_COLUMN_30_70',
    items: [
      run('anonymous-left-a', 30, 500, 120), run('anonymous-right-a', 210, 500, 350),
      run('anonymous-left-b', 30, 470, 120), run('anonymous-right-b', 210, 470, 350),
    ],
    pageBounds: standardBounds,
  },
  existingLayout('SIDEBAR', 'sidebar'),
  existingLayout('SAME_Y_SEPARATE_COLUMNS', 'same-y-separate-columns'),
  existingLayout('SPLIT_CJK_HEADING', 'split-cjk-heading'),
  existingLayout('ENGLISH_LATIN', 'english-headings'),
  {
    id: 'SPARSE_PAGE',
    items: [run('anonymous-sparse', 80, 400, 100)],
    pageBounds: standardBounds,
  },
  {
    id: 'MIXED_SAFE_UNSAFE',
    items: [
      run('anonymous-safe-left', 60, 500, 100),
      run('anonymous-unsafe', 200, 500, 100, { rotated: true }),
      run('anonymous-safe-right', 340, 500, 100),
    ],
    pageBounds: standardBounds,
  },
  existingLayout('NONZERO_PAGE_MIN_X', 'single-column', {
    minX: 100,
    maxX: 700,
    width: 600,
    source: 'pdf-page-view',
  }),
]

export const unavailableCalibrationFixture: IsolatedEvidenceFixture = {
  id: 'NO_POSITIVE_HEIGHT',
  items: [run('anonymous-zero-height', 60, 500, 100, { height: 0 })],
  pageBounds: standardBounds,
}

export const invalidGeometryFixture: IsolatedEvidenceFixture = {
  id: 'NEGATIVE_HEIGHT',
  items: [run('anonymous-invalid-height', 60, 500, 100, { height: -1 })],
  pageBounds: standardBounds,
}
