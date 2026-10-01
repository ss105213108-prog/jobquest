import type { PdfPageGeometryMetadata } from '../../src/parsers/pdfPageGeometry'

export interface AnonymousPdfPageMetadataSource {
  readonly view: readonly number[]
  readonly rotate: number
  readonly userUnit?: number
}

export interface PdfPageGeometrySuccessCase {
  readonly id: string
  readonly metadata: PdfPageGeometryMetadata
  readonly expected: {
    readonly minX: number
    readonly maxX: number
    readonly width: number
  }
}

export const successCases: readonly PdfPageGeometrySuccessCase[] = [
  {
    id: 'standard-page',
    metadata: { view: [0, 0, 612, 792], rotate: 0 },
    expected: { minX: 0, maxX: 612, width: 612 },
  },
  {
    id: 'nonzero-origin',
    metadata: { view: [100, 200, 700, 1000], rotate: 0 },
    expected: { minX: 100, maxX: 700, width: 600 },
  },
  {
    id: 'negative-horizontal-origin',
    metadata: { view: [-50, 0, 550, 800], rotate: 0 },
    expected: { minX: -50, maxX: 550, width: 600 },
  },
  {
    id: 'reversed-y-remains-horizontal-contract-valid',
    metadata: { view: [100, 800, 700, 0], rotate: 0 },
    expected: { minX: 100, maxX: 700, width: 600 },
  },
]

export const sourceWithUserUnit = (
  userUnit: number,
): AnonymousPdfPageMetadataSource => ({
  view: [100, 200, 700, 1000],
  rotate: 0,
  userUnit,
})

export const projectAdapterMetadata = (
  source: AnonymousPdfPageMetadataSource,
): PdfPageGeometryMetadata => ({
  view: source.view,
  rotate: source.rotate,
})
