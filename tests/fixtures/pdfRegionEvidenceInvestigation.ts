import type { Region } from '../../src/parsers/pdfRegionResolutionResult'

export interface AnonymousRegionRun {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

export interface RegionOwnershipIntent {
  readonly label: string
  readonly regions: readonly { readonly members: readonly number[]; readonly role?: Region['role'] }[]
}

export interface RegionEvidencePair {
  readonly id: string
  readonly family: string
  readonly challengedSignal: string
  readonly runs: readonly AnonymousRegionRun[]
  readonly positive: RegionOwnershipIntent
  readonly opposite: RegionOwnershipIntent
  readonly classification: 'EXACT_REGION_AMBIGUITY'
}

const run = (x: number, y: number, width: number): AnonymousRegionRun => ({ x, y, width, height: 10 })
const all = (count: number) => Array.from({ length: count }, (_, index) => index)

export const regionEvidencePairs: readonly RegionEvidencePair[] = [
  {
    id: 'SINGLE_COLUMN_CONTINUATION', family: 'single-column multi-group',
    challengedSignal: 'repeated x interval and vertical continuation',
    runs: [run(40, 740, 300), run(40, 700, 300), run(40, 660, 300), run(40, 620, 300)],
    positive: { label: 'one body Region', regions: [{ members: all(4) }] },
    opposite: { label: 'two stacked Regions', regions: [{ members: [0, 1] }, { members: [2, 3] }] },
    classification: 'EXACT_REGION_AMBIGUITY',
  },
  {
    id: 'PARALLEL_TRACKS', family: 'two separated vertical regions',
    challengedSignal: 'persistent horizontal gap and repeated tracks',
    runs: [run(30, 740, 120), run(280, 740, 250), run(30, 710, 120), run(280, 710, 250),
      run(30, 680, 120), run(280, 680, 250), run(30, 650, 120), run(280, 650, 250)],
    positive: { label: 'two Regions', regions: [
      { members: [0, 2, 4, 6], role: 'COLUMN_LIKE' }, { members: [1, 3, 5, 7], role: 'COLUMN_LIKE' },
    ] },
    opposite: { label: 'one multi-track Region', regions: [{ members: all(8) }] },
    classification: 'EXACT_REGION_AMBIGUITY',
  },
  {
    id: 'NARROW_SIDEBAR', family: 'narrow-left sidebar',
    challengedSignal: 'narrow left track beside wide right track',
    runs: [run(20, 740, 75), run(170, 740, 350), run(20, 700, 75), run(170, 700, 350),
      run(20, 660, 75), run(170, 660, 350)],
    positive: { label: 'narrow and main Regions', regions: [
      { members: [0, 2, 4], role: 'COLUMN_LIKE' }, { members: [1, 3, 5], role: 'COLUMN_LIKE' },
    ] },
    opposite: { label: 'one mixed-width Region', regions: [{ members: all(6) }] },
    classification: 'EXACT_REGION_AMBIGUITY',
  },
  {
    id: 'WIDE_SIDEBAR', family: 'wide-left sidebar',
    challengedSignal: 'unequal width ratio without a fixed proportion',
    runs: [run(20, 740, 190), run(260, 740, 280), run(20, 700, 190), run(260, 700, 280),
      run(20, 660, 190), run(260, 660, 280)],
    positive: { label: 'wide and main Regions', regions: [
      { members: [0, 2, 4], role: 'COLUMN_LIKE' }, { members: [1, 3, 5], role: 'COLUMN_LIKE' },
    ] },
    opposite: { label: 'one mixed-width Region', regions: [{ members: all(6) }] },
    classification: 'EXACT_REGION_AMBIGUITY',
  },
  {
    id: 'FULL_WIDTH_HEADER', family: 'spanning header above columns',
    challengedSignal: 'wide top group above horizontally separated lower tracks',
    runs: [run(30, 760, 500), run(30, 710, 130), run(290, 710, 240),
      run(30, 670, 130), run(290, 670, 240)],
    positive: { label: 'spanning header and two lower Regions', regions: [
      { members: [0], role: 'SPANNING' }, { members: [1, 3], role: 'COLUMN_LIKE' },
      { members: [2, 4], role: 'COLUMN_LIKE' },
    ] },
    opposite: { label: 'one Region with a wide first group', regions: [{ members: all(5) }] },
    classification: 'EXACT_REGION_AMBIGUITY',
  },
  {
    id: 'FULL_WIDTH_FOOTER', family: 'two Regions to full-width footer',
    challengedSignal: 'wide lower group after two upper tracks',
    runs: [run(30, 760, 130), run(290, 760, 240), run(30, 720, 130),
      run(290, 720, 240), run(30, 660, 500)],
    positive: { label: 'two upper Regions and spanning footer', regions: [
      { members: [0, 2], role: 'COLUMN_LIKE' }, { members: [1, 3], role: 'COLUMN_LIKE' },
      { members: [4], role: 'SPANNING' },
    ] },
    opposite: { label: 'one Region ending in a wide group', regions: [{ members: all(5) }] },
    classification: 'EXACT_REGION_AMBIGUITY',
  },
  {
    id: 'STACKED_FULL_WIDTH', family: 'stacked full-width sections',
    challengedSignal: 'same wide interval in vertically separated bands',
    runs: [run(40, 760, 470), run(40, 730, 470), run(40, 620, 470), run(40, 590, 470)],
    positive: { label: 'two stacked Regions', regions: [{ members: [0, 1] }, { members: [2, 3] }] },
    opposite: { label: 'one continuous Region', regions: [{ members: all(4) }] },
    classification: 'EXACT_REGION_AMBIGUITY',
  },
  {
    id: 'UNEQUAL_DENSITY', family: 'unequal-density columns',
    challengedSignal: 'persistent tracks with unequal row counts',
    runs: [run(25, 760, 130), run(260, 760, 280), run(260, 735, 280),
      run(260, 710, 280), run(25, 680, 130), run(260, 685, 280), run(260, 660, 280)],
    positive: { label: 'unequal Regions', regions: [
      { members: [0, 4], role: 'COLUMN_LIKE' }, { members: [1, 2, 3, 5, 6], role: 'COLUMN_LIKE' },
    ] },
    opposite: { label: 'one uneven Region', regions: [{ members: all(7) }] },
    classification: 'EXACT_REGION_AMBIGUITY',
  },
  {
    id: 'SPARSE_MISSING_SIDE', family: 'missing rows and sparse side',
    challengedSignal: 'one sparse left observation beside repeated right observations',
    runs: [run(25, 750, 100), run(230, 750, 300), run(230, 710, 300),
      run(230, 670, 300), run(230, 630, 300)],
    positive: { label: 'sparse side and main Regions', regions: [
      { members: [0], role: 'COLUMN_LIKE' }, { members: [1, 2, 3, 4], role: 'COLUMN_LIKE' },
    ] },
    opposite: { label: 'one Region with sparse left content', regions: [{ members: all(5) }] },
    classification: 'EXACT_REGION_AMBIGUITY',
  },
  {
    id: 'SPANNING_BETWEEN_BANDS', family: 'spanning group between column bands',
    challengedSignal: 'wide middle group with separated tracks above and below',
    runs: [run(30, 780, 130), run(290, 780, 240), run(30, 750, 130), run(290, 750, 240),
      run(30, 700, 500), run(30, 650, 130), run(290, 650, 240),
      run(30, 620, 130), run(290, 620, 240)],
    positive: { label: 'two continuing Regions with middle span', regions: [
      { members: [0, 2, 5, 7], role: 'COLUMN_LIKE' }, { members: [1, 3, 6, 8], role: 'COLUMN_LIKE' },
      { members: [4], role: 'SPANNING' },
    ] },
    opposite: { label: 'one Region through the transition', regions: [{ members: all(9) }] },
    classification: 'EXACT_REGION_AMBIGUITY',
  },
  {
    id: 'IDENTICAL_LOCAL_BOUNDS', family: 'same bounds with opposite ownership',
    challengedSignal: 'identical local VisualGroup bounds',
    runs: [run(40, 740, 220), run(40, 740, 220), run(40, 700, 220), run(40, 700, 220)],
    positive: { label: 'one Region with identical observations', regions: [{ members: all(4) }] },
    opposite: { label: 'two Regions with identical bounds', regions: [
      { members: [0, 2] }, { members: [1, 3] },
    ] },
    classification: 'EXACT_REGION_AMBIGUITY',
  },
  {
    id: 'NESTED_SIMILAR_BOUNDS', family: 'nested and overlapping bounds',
    challengedSignal: 'local overlap and near-identical horizontal extent',
    runs: [run(40, 740, 460), run(110, 740, 120), run(40, 700, 460), run(110, 700, 120)],
    positive: { label: 'one Region with nested observations', regions: [{ members: all(4) }] },
    opposite: { label: 'outer and inner Regions', regions: [
      { members: [0, 2] }, { members: [1, 3] },
    ] },
    classification: 'EXACT_REGION_AMBIGUITY',
  },
]
