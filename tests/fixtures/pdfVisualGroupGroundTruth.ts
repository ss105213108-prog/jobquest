import type { PhysicalPageBounds } from '../../src/parsers/pdfPageGeometry'
import type { PdfTextRun } from '../../src/parsers/pdfTextGeometry'

export type VisualGroupFixtureFamily =
  | 'single-column-inline'
  | 'two-column'
  | 'sidebar'
  | 'full-width-header'
  | 'cjk-fragmentation'
  | 'latin-fragmentation'
  | 'mixed-font-height'
  | 'overlap-touching'
  | 'candidate-boundary'
  | 'unsafe'
  | 'variant'

export type KnownReconstructionFailure =
  | 'Two-column'
  | 'Sidebar'
  | 'Same-Y separate columns'
  | 'Split CJK heading'

export interface VisualGroupFixtureRun {
  readonly key: string
  readonly item: PdfTextRun
}

export interface VisualGroupGroundTruthFixture {
  readonly id: string
  readonly family: VisualGroupFixtureFamily
  readonly intent: string
  readonly runs: readonly VisualGroupFixtureRun[]
  readonly pageBounds: PhysicalPageBounds
  readonly expectedGroups: readonly (readonly string[])[]
  readonly tags?: readonly string[]
  readonly knownFailures?: readonly KnownReconstructionFailure[]
  readonly variantOf?: string
  readonly evidenceExpectation?: 'DISTINGUISHABLE' | 'EXPECTED_AMBIGUOUS'
}

export interface VisualGroupAmbiguityPair {
  readonly id: string
  readonly groupedFixtureId: string
  readonly groupedRunKeys: readonly string[]
  readonly splitFixtureId: string
  readonly splitRunKeys: readonly string[]
  readonly evidenceExpectation?: 'DISTINGUISHABLE' | 'EXPECTED_AMBIGUOUS'
}

const pageBounds = (
  minX = 0,
  width = 600,
): PhysicalPageBounds => ({
  minX,
  maxX: minX + width,
  width,
  source: 'pdf-page-view',
})

const run = (
  key: string,
  x: number,
  y: number,
  width: number,
  options: {
    readonly height?: number
    readonly fontName?: string
    readonly text?: string
    readonly unsafe?: boolean
  } = {},
): VisualGroupFixtureRun => ({
  key,
  item: {
    str: options.text ?? `fragment:${key}`,
    transform: options.unsafe ? [0, 1, -1, 0, x, y] : [1, 0, 0, 1, x, y],
    width,
    height: options.height ?? 12,
    dir: 'ltr',
    fontName: options.fontName ?? 'SyntheticBody',
    hasEOL: false,
  },
})

// A fixture-only, exactly representable binary fraction. It models exporter
// coordinate drift without requiring tolerance in production geometry checks.
const syntheticCoordinateJitter = 1 / 1024

const fixture = (
  value: Omit<VisualGroupGroundTruthFixture, 'pageBounds'> & {
    readonly pageBounds?: PhysicalPageBounds
  },
): VisualGroupGroundTruthFixture => ({
  ...value,
  pageBounds: value.pageBounds ?? pageBounds(),
})

const sparseOppositeRuns = [
  run('sparse-opposite-left', 50, 700, 80, { text: 'TOKEN000' }),
  run('sparse-opposite-right', 270, 700, 100, { text: 'TOKEN111' }),
] as const

const repeatedNoSpanRuns = [
  run('no-span-left-1', 40, 730, 120, { text: 'TOKEN000' }),
  run('no-span-right-1', 320, 730, 180, { text: 'TOKEN111' }),
  run('no-span-left-2', 40, 700, 120, { text: 'TOKEN222' }),
  run('no-span-right-2', 320, 700, 180, { text: 'TOKEN333' }),
  run('no-span-left-3', 40, 670, 120, { text: 'TOKEN444' }),
  run('no-span-right-3', 320, 670, 180, { text: 'TOKEN555' }),
] as const

const strengthenedHeadingRuns = [
  run('strong-heading-left', 40, 730, 120, { text: 'TOKEN000' }),
  run('strong-heading-right', 320, 730, 180, { text: 'TOKEN111' }),
  run('strong-heading-context-left-1', 40, 700, 120, { text: 'TOKEN222' }),
  run('strong-heading-context-right-1', 320, 700, 180, { text: 'TOKEN333' }),
  run('strong-heading-context-left-2', 40, 670, 120, { text: 'TOKEN444' }),
  run('strong-heading-context-right-2', 320, 670, 180, { text: 'TOKEN555' }),
] as const

const crossSliceOppositeRuns = [
  run('cross-slice-left', 50, 700, 80, { text: 'TOKEN000' }),
  run('cross-slice-right', 134, 702, 100, { text: 'TOKEN111' }),
] as const

const strengthenedCjkRuns = [
  run('strong-cjk-1', 50, 730, 12, { text: '甲' }),
  run('strong-cjk-2', 80, 730, 12, { text: '乙' }),
  run('strong-cjk-3', 300, 730, 12, { text: '丙' }),
  run('strong-cjk-4', 330, 730, 12, { text: '丁' }),
  run('strong-cjk-context-left', 50, 700, 42, { text: '匿名甲' }),
  run('strong-cjk-context-right', 300, 700, 42, { text: '匿名乙' }),
] as const

const strengthenedLatinRuns = [
  run('strong-latin-1', 50, 730, 60, { text: 'TOKEN000' }),
  run('strong-latin-2', 180, 730, 60, { text: 'TOKEN111' }),
  run('strong-latin-3', 310, 730, 60, { text: 'TOKEN222' }),
  run('strong-latin-context-left', 50, 700, 100, { text: 'TOKEN333' }),
  run('strong-latin-context-right', 310, 700, 100, { text: 'TOKEN444' }),
] as const

const baseFixtures: readonly VisualGroupGroundTruthFixture[] = [
  fixture({
    id: 'SINGLE_LATIN_FRAGMENTS',
    family: 'single-column-inline',
    intent: 'Two adjacent Latin fragments form one visual unit.',
    runs: [run('latin-a', 48, 700, 42), run('latin-b', 94, 700, 58)],
    expectedGroups: [['latin-a', 'latin-b']],
    tags: ['single-column', 'latin'],
  }),
  fixture({
    id: 'INLINE_LARGE_GAP',
    family: 'single-column-inline',
    intent: 'A wide label/value separation remains one unit in inline context.',
    runs: [
      run('inline-context', 50, 730, 320),
      run('inline-left-1', 50, 700, 50), run('inline-right-1', 260, 700, 110),
      run('inline-left-2', 50, 675, 50), run('inline-right-2', 260, 675, 110),
    ],
    expectedGroups: [
      ['inline-context'],
      ['inline-left-1', 'inline-right-1'],
      ['inline-left-2', 'inline-right-2'],
    ],
    tags: ['single-column', 'large-inline-gap', 'matched-ambiguity'],
  }),
  fixture({
    id: 'REPEATED_LABEL_VALUE',
    family: 'single-column-inline',
    intent: 'Repeated aligned label/value rows remain row-local visual units.',
    runs: [
      run('label-context', 40, 760, 460),
      run('label-1', 40, 730, 120), run('value-1', 320, 730, 180),
      run('label-2', 40, 700, 120), run('value-2', 320, 700, 180),
      run('label-3', 40, 670, 120), run('value-3', 320, 670, 180),
    ],
    expectedGroups: [
      ['label-context'],
      ['label-1', 'value-1'],
      ['label-2', 'value-2'],
      ['label-3', 'value-3'],
    ],
    tags: ['label-value', 'dense', 'matched-ambiguity'],
  }),
  fixture({
    id: 'TWO_COLUMN_50_50',
    family: 'two-column',
    intent: 'Aligned left and right regions are independent visual groups.',
    runs: [
      run('col50-left-1', 40, 730, 120), run('col50-right-1', 320, 730, 180),
      run('col50-left-2', 40, 700, 120), run('col50-right-2', 320, 700, 180),
      run('col50-left-3', 40, 670, 120), run('col50-right-3', 320, 670, 180),
    ],
    expectedGroups: [
      ['col50-left-1'], ['col50-right-1'],
      ['col50-left-2'], ['col50-right-2'],
      ['col50-left-3'], ['col50-right-3'],
    ],
    tags: ['two-column', 'dense', 'matched-ambiguity'],
    knownFailures: ['Two-column'],
  }),
  fixture({
    id: 'TWO_COLUMN_30_70',
    family: 'two-column',
    intent: 'Asymmetric left and right regions remain independent.',
    runs: [
      run('col30-left-1', 35, 720, 90), run('col30-right-1', 190, 720, 350),
      run('col30-left-2', 35, 690, 90), run('col30-right-2', 190, 690, 350),
      run('col30-left-3', 35, 660, 90), run('col30-right-3', 190, 660, 350),
    ],
    expectedGroups: [
      ['col30-left-1'], ['col30-right-1'],
      ['col30-left-2'], ['col30-right-2'],
      ['col30-left-3'], ['col30-right-3'],
    ],
    tags: ['two-column', 'asymmetric'],
    knownFailures: ['Two-column'],
  }),
  fixture({
    id: 'TWO_COLUMN_UNEQUAL_DENSITY',
    family: 'two-column',
    intent: 'A right-only middle row does not join matched outer column rows.',
    runs: [
      run('unequal-left-1', 50, 700, 50), run('unequal-right-1', 260, 700, 110),
      run('unequal-right-2', 260, 675, 110),
      run('unequal-left-3', 50, 650, 50), run('unequal-right-3', 260, 650, 110),
    ],
    expectedGroups: [
      ['unequal-left-1'], ['unequal-right-1'], ['unequal-right-2'],
      ['unequal-left-3'], ['unequal-right-3'],
    ],
    tags: ['two-column', 'unequal-density', 'matched-ambiguity'],
    knownFailures: ['Two-column'],
  }),
  fixture({
    id: 'NARROW_SIDEBAR',
    family: 'sidebar',
    intent: 'Narrow sidebar and main content remain separate on shared baselines.',
    runs: [
      run('narrow-side-1', 30, 720, 90), run('narrow-main-1', 180, 720, 350),
      run('narrow-side-2', 30, 690, 90), run('narrow-main-2', 180, 690, 350),
      run('narrow-main-3', 180, 660, 350),
    ],
    expectedGroups: [
      ['narrow-side-1'], ['narrow-main-1'], ['narrow-side-2'],
      ['narrow-main-2'], ['narrow-main-3'],
    ],
    tags: ['sidebar', 'narrow'],
    knownFailures: ['Sidebar'],
  }),
  fixture({
    id: 'WIDE_SIDEBAR',
    family: 'sidebar',
    intent: 'A wider sidebar remains independent from main content.',
    runs: [
      run('wide-side-1', 30, 720, 170), run('wide-main-1', 245, 720, 285),
      run('wide-side-2', 30, 690, 170), run('wide-main-2', 245, 690, 285),
      run('wide-main-3', 245, 660, 285),
    ],
    expectedGroups: [
      ['wide-side-1'], ['wide-main-1'], ['wide-side-2'], ['wide-main-2'], ['wide-main-3'],
    ],
    tags: ['sidebar', 'wide'],
    knownFailures: ['Sidebar'],
  }),
  fixture({
    id: 'SPARSE_SIDEBAR',
    family: 'sidebar',
    intent: 'A sparse sidebar item does not join the main item on the same baseline.',
    runs: [run('sparse-side', 35, 700, 80), run('sparse-main', 210, 700, 300)],
    expectedGroups: [['sparse-side'], ['sparse-main']],
    tags: ['sidebar', 'sparse'],
    knownFailures: ['Sidebar'],
  }),
  fixture({
    id: 'FULL_WIDTH_HEADER_COLUMNS',
    family: 'full-width-header',
    intent: 'Header fragments form one unit while lower column runs stay separate.',
    runs: [
      run('header-left', 40, 730, 120, { fontName: 'SyntheticHeading' }),
      run('header-right', 320, 730, 180, { fontName: 'SyntheticHeading' }),
      run('header-col-left-1', 40, 690, 120), run('header-col-right-1', 320, 690, 180),
      run('header-col-left-2', 40, 660, 120), run('header-col-right-2', 320, 660, 180),
    ],
    expectedGroups: [
      ['header-left', 'header-right'],
      ['header-col-left-1'], ['header-col-right-1'],
      ['header-col-left-2'], ['header-col-right-2'],
    ],
    tags: ['full-width-header', 'two-column', 'matched-ambiguity'],
  }),
  fixture({
    id: 'SPLIT_CJK_TIGHT',
    family: 'cjk-fragmentation',
    intent: 'Four tightly split CJK fragments form one heading unit.',
    runs: [
      run('cjk-tight-1', 50, 700, 12, { text: '工' }),
      run('cjk-tight-2', 62, 700, 12, { text: '作' }),
      run('cjk-tight-3', 74, 700, 12, { text: '經' }),
      run('cjk-tight-4', 86, 700, 12, { text: '歷' }),
    ],
    expectedGroups: [['cjk-tight-1', 'cjk-tight-2', 'cjk-tight-3', 'cjk-tight-4']],
    tags: ['cjk', 'split-heading'],
    knownFailures: ['Split CJK heading'],
  }),
  fixture({
    id: 'SPLIT_CJK_LOOSE',
    family: 'cjk-fragmentation',
    intent: 'Widely distributed fragments are intentionally one full-width heading.',
    runs: [
      run('cjk-loose-context', 50, 735, 292, { height: 16 }),
      run('cjk-loose-1', 50, 700, 12, { text: '工' }),
      run('cjk-loose-2', 80, 700, 12, { text: '作' }),
      run('cjk-loose-3', 300, 700, 12, { text: '經' }),
      run('cjk-loose-4', 330, 700, 12, { text: '歷' }),
    ],
    expectedGroups: [
      ['cjk-loose-context'],
      ['cjk-loose-1', 'cjk-loose-2', 'cjk-loose-3', 'cjk-loose-4'],
    ],
    tags: ['cjk', 'split-heading', 'matched-ambiguity'],
    knownFailures: ['Split CJK heading'],
  }),
  fixture({
    id: 'CJK_SEPARATE_REGIONS',
    family: 'cjk-fragmentation',
    intent: 'Two CJK units occupy distinct visual regions.',
    runs: [
      run('cjk-region-left-1', 50, 700, 12, { text: '技' }),
      run('cjk-region-left-2', 80, 700, 12, { text: '能' }),
      run('cjk-region-right-1', 300, 700, 12, { text: '經' }),
      run('cjk-region-right-2', 330, 700, 12, { text: '歷' }),
      run('cjk-region-left-context', 50, 670, 42),
      run('cjk-region-right-context', 300, 670, 42),
    ],
    expectedGroups: [
      ['cjk-region-left-1', 'cjk-region-left-2'],
      ['cjk-region-right-1', 'cjk-region-right-2'],
      ['cjk-region-left-context'], ['cjk-region-right-context'],
    ],
    tags: ['cjk', 'separate-regions', 'matched-ambiguity'],
    knownFailures: ['Same-Y separate columns'],
  }),
  fixture({
    id: 'LATIN_PHRASE_FRAGMENTS',
    family: 'latin-fragmentation',
    intent: 'Three Latin fragments form one visual phrase.',
    runs: [
      run('latin-phrase-1', 50, 700, 45),
      run('latin-phrase-2', 100, 700, 32),
      run('latin-phrase-3', 138, 700, 72),
    ],
    expectedGroups: [['latin-phrase-1', 'latin-phrase-2', 'latin-phrase-3']],
    tags: ['latin', 'fragmentation'],
  }),
  fixture({
    id: 'LATIN_TRUE_COLUMNS',
    family: 'latin-fragmentation',
    intent: 'Latin fragments in separate regions remain separate groups.',
    runs: [run('latin-column-left', 50, 700, 85), run('latin-column-right', 320, 700, 90)],
    expectedGroups: [['latin-column-left'], ['latin-column-right']],
    tags: ['latin', 'two-column'],
    knownFailures: ['Same-Y separate columns'],
  }),
  fixture({
    id: 'MIXED_FONT_HEIGHT_SAME_GROUP',
    family: 'mixed-font-height',
    intent: 'Different font and height fragments remain one intended unit.',
    runs: [
      run('mixed-small', 50, 700, 55, { height: 10, fontName: 'SyntheticSmall' }),
      run('mixed-large', 112, 700, 95, { height: 16, fontName: 'SyntheticLarge' }),
    ],
    expectedGroups: [['mixed-small', 'mixed-large']],
    tags: ['mixed-font', 'mixed-height'],
  }),
  fixture({
    id: 'SIMILAR_FONT_DIFFERENT_GROUPS',
    family: 'mixed-font-height',
    intent: 'Matching fonts do not force independent regions into one group.',
    runs: [run('font-left', 45, 700, 110), run('font-right', 330, 700, 110)],
    expectedGroups: [['font-left'], ['font-right']],
    tags: ['same-font', 'two-column'],
  }),
  fixture({
    id: 'TOUCHING_INTERVALS_SAME_GROUP',
    family: 'overlap-touching',
    intent: 'Touching fragments form one visual unit.',
    runs: [run('touch-left', 50, 700, 60), run('touch-right', 110, 700, 70)],
    expectedGroups: [['touch-left', 'touch-right']],
    tags: ['touching'],
  }),
  fixture({
    id: 'OVERLAPPING_INTERVALS_SAME_GROUP',
    family: 'overlap-touching',
    intent: 'Slightly overlapping fragments form one visual unit.',
    runs: [run('overlap-left', 50, 700, 70), run('overlap-right', 115, 700, 70)],
    expectedGroups: [['overlap-left', 'overlap-right']],
    tags: ['overlap'],
  }),
  fixture({
    id: 'OVERLAPPING_DECORATIVE_SEPARATE',
    family: 'overlap-touching',
    intent: 'Overlapping independent layout fragments remain separate groups.',
    runs: [run('decorative-a', 50, 700, 90), run('decorative-b', 125, 700, 90)],
    expectedGroups: [['decorative-a'], ['decorative-b']],
    tags: ['overlap', 'independent'],
  }),
  fixture({
    id: 'SAME_Y_FALSE_CANDIDATE_MERGE',
    family: 'candidate-boundary',
    intent: 'One provisional same-baseline candidate must be split into two groups.',
    runs: [run('false-merge-left', 40, 700, 120), run('false-merge-right', 330, 700, 180)],
    expectedGroups: [['false-merge-left'], ['false-merge-right']],
    tags: ['candidate-split', 'same-y'],
    knownFailures: ['Same-Y separate columns'],
  }),
  fixture({
    id: 'CROSS_CANDIDATE_RECOVERY',
    family: 'candidate-boundary',
    intent: 'Overlapping-baseline fragments in separate candidates form one group with direct permission.',
    runs: [run('recovery-left', 50, 700, 70), run('recovery-right', 124, 702, 90)],
    expectedGroups: [['recovery-left', 'recovery-right']],
    tags: ['cross-candidate', 'deferred-permission'],
  }),
  fixture({
    id: 'UNSAFE_SINGLETON',
    family: 'unsafe',
    intent: 'Unsafe geometry remains a singleton beside safe evidence.',
    runs: [
      run('unsafe-safe-left', 40, 700, 100),
      run('unsafe-run', 210, 700, 80, { unsafe: true }),
      run('unsafe-safe-right', 340, 700, 120),
    ],
    expectedGroups: [['unsafe-safe-left'], ['unsafe-run'], ['unsafe-safe-right']],
    tags: ['unsafe', 'singleton'],
  }),
  fixture({
    id: 'DENSE_INLINE_ROWS',
    family: 'single-column-inline',
    intent: 'A dense set of row-local fragment pairs remains complete and non-overlapping.',
    runs: [
      run('dense-a1', 45, 740, 70), run('dense-a2', 120, 740, 100),
      run('dense-b1', 45, 720, 70), run('dense-b2', 120, 720, 100),
      run('dense-c1', 45, 700, 70), run('dense-c2', 120, 700, 100),
      run('dense-d1', 45, 680, 70), run('dense-d2', 120, 680, 100),
    ],
    expectedGroups: [
      ['dense-a1', 'dense-a2'], ['dense-b1', 'dense-b2'],
      ['dense-c1', 'dense-c2'], ['dense-d1', 'dense-d2'],
    ],
    tags: ['dense', 'single-column'],
  }),
  fixture({
    id: 'NONZERO_PAGE_ORIGIN',
    family: 'single-column-inline',
    intent: 'Nonzero physical page origin does not alter intended grouping.',
    runs: [run('origin-left', 150, 700, 60), run('origin-right', 215, 700, 90)],
    pageBounds: pageBounds(100, 600),
    expectedGroups: [['origin-left', 'origin-right']],
    tags: ['nonzero-origin'],
  }),
  fixture({
    id: 'SPARSE_INLINE_EXACT',
    family: 'single-column-inline',
    intent: 'One sparse row is intentionally one visual group.',
    runs: sparseOppositeRuns,
    expectedGroups: [['sparse-opposite-left', 'sparse-opposite-right']],
    tags: ['rp060', 'sparse', 'exact-opposite'],
    evidenceExpectation: 'EXPECTED_AMBIGUOUS',
  }),
  fixture({
    id: 'SPARSE_SEPARATE_REGIONS_EXACT',
    family: 'two-column',
    intent: 'The same sparse evidence intentionally represents separate visual regions.',
    runs: sparseOppositeRuns,
    expectedGroups: [['sparse-opposite-left'], ['sparse-opposite-right']],
    tags: ['rp060', 'sparse', 'exact-opposite'],
    evidenceExpectation: 'EXPECTED_AMBIGUOUS',
  }),
  fixture({
    id: 'SPARSE_CONTEXT_B0',
    family: 'two-column',
    intent: 'The ambiguous target row is separate with no supporting context.',
    runs: sparseOppositeRuns,
    expectedGroups: [['sparse-opposite-left'], ['sparse-opposite-right']],
    tags: ['rp060', 'context-escalation', 'b0'],
  }),
  fixture({
    id: 'SPARSE_CONTEXT_B1',
    family: 'two-column',
    intent: 'The same target row is separate with one supporting row.',
    runs: [
      ...sparseOppositeRuns,
      run('context-b1-left', 50, 670, 80, { text: 'TOKEN222' }),
      run('context-b1-right', 270, 670, 100, { text: 'TOKEN333' }),
    ],
    expectedGroups: [
      ['sparse-opposite-left'], ['sparse-opposite-right'],
      ['context-b1-left'], ['context-b1-right'],
    ],
    tags: ['rp060', 'context-escalation', 'b1'],
  }),
  fixture({
    id: 'SPARSE_CONTEXT_B2',
    family: 'two-column',
    intent: 'The same target row is separate with two supporting rows.',
    runs: [
      ...sparseOppositeRuns,
      run('context-b2-left-1', 50, 670, 80, { text: 'TOKEN222' }),
      run('context-b2-right-1', 270, 670, 100, { text: 'TOKEN333' }),
      run('context-b2-left-2', 50, 640, 80, { text: 'TOKEN444' }),
      run('context-b2-right-2', 270, 640, 100, { text: 'TOKEN555' }),
    ],
    expectedGroups: [
      ['sparse-opposite-left'], ['sparse-opposite-right'],
      ['context-b2-left-1'], ['context-b2-right-1'],
      ['context-b2-left-2'], ['context-b2-right-2'],
    ],
    tags: ['rp060', 'context-escalation', 'b2'],
  }),
  fixture({
    id: 'SPARSE_CONTEXT_B3_SPANNING',
    family: 'two-column',
    intent: 'The same target row is separate with a spanning exception row.',
    runs: [
      ...sparseOppositeRuns,
      run('context-b3-left', 50, 670, 80, { text: 'TOKEN222' }),
      run('context-b3-right', 270, 670, 100, { text: 'TOKEN333' }),
      run('context-b3-span', 50, 640, 320, { text: 'TOKEN444' }),
    ],
    expectedGroups: [
      ['sparse-opposite-left'], ['sparse-opposite-right'],
      ['context-b3-left'], ['context-b3-right'], ['context-b3-span'],
    ],
    tags: ['rp060', 'context-escalation', 'b3', 'spanning-exception'],
  }),
  fixture({
    id: 'SPARSE_CONTEXT_B4_MISSING_SIDE',
    family: 'two-column',
    intent: 'The same target row is separate with a missing-side context row.',
    runs: [
      ...sparseOppositeRuns,
      run('context-b4-left', 50, 670, 80, { text: 'TOKEN222' }),
      run('context-b4-right', 270, 670, 100, { text: 'TOKEN333' }),
      run('context-b4-right-only', 270, 640, 100, { text: 'TOKEN444' }),
    ],
    expectedGroups: [
      ['sparse-opposite-left'], ['sparse-opposite-right'],
      ['context-b4-left'], ['context-b4-right'], ['context-b4-right-only'],
    ],
    tags: ['rp060', 'context-escalation', 'b4', 'missing-side'],
  }),
  fixture({
    id: 'REPEATED_INLINE_NO_SPAN',
    family: 'single-column-inline',
    intent: 'Repeated paired rows are inline without a spanning helper.',
    runs: repeatedNoSpanRuns,
    expectedGroups: [
      ['no-span-left-1', 'no-span-right-1'],
      ['no-span-left-2', 'no-span-right-2'],
      ['no-span-left-3', 'no-span-right-3'],
    ],
    tags: ['rp060', 'no-span', 'exporter-exact'],
    evidenceExpectation: 'EXPECTED_AMBIGUOUS',
  }),
  fixture({
    id: 'REPEATED_COLUMNS_NO_SPAN',
    family: 'two-column',
    intent: 'The identical repeated rows are independent columns without a spanning helper.',
    runs: repeatedNoSpanRuns,
    expectedGroups: repeatedNoSpanRuns.map(({ key }) => [key]),
    tags: ['rp060', 'no-span', 'exact-opposite'],
    evidenceExpectation: 'EXPECTED_AMBIGUOUS',
  }),
  fixture({
    id: 'HEADING_FRAGMENTS_STRONG',
    family: 'full-width-header',
    intent: 'The top matched fragments intentionally form one heading group.',
    runs: strengthenedHeadingRuns,
    expectedGroups: [
      ['strong-heading-left', 'strong-heading-right'],
      ['strong-heading-context-left-1'], ['strong-heading-context-right-1'],
      ['strong-heading-context-left-2'], ['strong-heading-context-right-2'],
    ],
    tags: ['rp060', 'heading-strong', 'exact-opposite'],
    evidenceExpectation: 'EXPECTED_AMBIGUOUS',
  }),
  fixture({
    id: 'COLUMN_FRAGMENTS_STRONG',
    family: 'two-column',
    intent: 'The identical top fragments intentionally remain separate column groups.',
    runs: strengthenedHeadingRuns,
    expectedGroups: strengthenedHeadingRuns.map(({ key }) => [key]),
    tags: ['rp060', 'column-strong', 'exact-opposite'],
    evidenceExpectation: 'EXPECTED_AMBIGUOUS',
  }),
  fixture({
    id: 'REPEATED_INLINE_TINY_JITTER',
    family: 'variant',
    intent: 'Repeated inline rows retain their visual intent under deterministic tiny coordinate drift.',
    runs: [
      run('no-span-left-1', 40 + syntheticCoordinateJitter, 730, 120, { text: 'TOKEN000' }),
      run('no-span-right-1', 320 - syntheticCoordinateJitter * 2, 730, 180, { text: 'TOKEN111' }),
      run('no-span-left-2', 40 - syntheticCoordinateJitter, 700, 120, { text: 'TOKEN222' }),
      run('no-span-right-2', 320 + syntheticCoordinateJitter * 2, 700, 180, { text: 'TOKEN333' }),
      run('no-span-left-3', 40 + syntheticCoordinateJitter * 2, 670, 120, { text: 'TOKEN444' }),
      run('no-span-right-3', 320 - syntheticCoordinateJitter, 670, 180, { text: 'TOKEN555' }),
    ],
    expectedGroups: [
      ['no-span-left-1', 'no-span-right-1'],
      ['no-span-left-2', 'no-span-right-2'],
      ['no-span-left-3', 'no-span-right-3'],
    ],
    tags: ['rp060', 'jitter', 'tiny-deterministic', 'exporter-drift'],
    variantOf: 'REPEATED_INLINE_NO_SPAN',
  }),
  fixture({
    id: 'REPEATED_LABEL_VALUE_TINY_JITTER',
    family: 'variant',
    intent: 'The existing label/value layout retains its visual intent under deterministic tiny coordinate drift.',
    runs: [
      run('label-context', 40 + syntheticCoordinateJitter, 760, 460 - syntheticCoordinateJitter * 2),
      run('label-1', 40 - syntheticCoordinateJitter, 730, 120 + syntheticCoordinateJitter * 2),
      run('value-1', 320 + syntheticCoordinateJitter * 2, 730, 180 - syntheticCoordinateJitter * 2),
      run('label-2', 40 + syntheticCoordinateJitter * 2, 700, 120 - syntheticCoordinateJitter),
      run('value-2', 320 - syntheticCoordinateJitter * 2, 700, 180 + syntheticCoordinateJitter),
      run('label-3', 40 - syntheticCoordinateJitter * 2, 670, 120 + syntheticCoordinateJitter),
      run('value-3', 320 + syntheticCoordinateJitter, 670, 180 - syntheticCoordinateJitter),
    ],
    expectedGroups: [
      ['label-context'],
      ['label-1', 'value-1'],
      ['label-2', 'value-2'],
      ['label-3', 'value-3'],
    ],
    tags: ['rp060', 'jitter', 'tiny-deterministic', 'label-value'],
    variantOf: 'REPEATED_LABEL_VALUE',
  }),
  fixture({
    id: 'TWO_COLUMN_MIXED_WIDTH_JITTER',
    family: 'variant',
    intent: 'Two-column intent remains under mixed positive and negative width drift.',
    runs: [
      run('no-span-left-1', 40 + syntheticCoordinateJitter, 730, 120 - syntheticCoordinateJitter * 2, { text: 'TOKEN000' }),
      run('no-span-right-1', 320 - syntheticCoordinateJitter, 730, 180 + syntheticCoordinateJitter * 2, { text: 'TOKEN111' }),
      run('no-span-left-2', 40 - syntheticCoordinateJitter * 2, 700, 120 + syntheticCoordinateJitter * 2, { text: 'TOKEN222' }),
      run('no-span-right-2', 320 + syntheticCoordinateJitter * 2, 700, 180 - syntheticCoordinateJitter * 2, { text: 'TOKEN333' }),
      run('no-span-left-3', 40 + syntheticCoordinateJitter * 2, 670, 120 - syntheticCoordinateJitter, { text: 'TOKEN444' }),
      run('no-span-right-3', 320 - syntheticCoordinateJitter * 2, 670, 180 + syntheticCoordinateJitter, { text: 'TOKEN555' }),
    ],
    expectedGroups: repeatedNoSpanRuns.map(({ key }) => [key]),
    tags: ['rp060', 'jitter', 'mixed-width', 'exporter-drift'],
    variantOf: 'REPEATED_COLUMNS_NO_SPAN',
  }),
  fixture({
    id: 'SIDEBAR_ROW_SPECIFIC_JITTER',
    family: 'variant',
    intent: 'Sidebar intent remains under row-specific coordinate drift.',
    runs: [
      run('narrow-side-1', 30 + syntheticCoordinateJitter, 720, 90, { text: 'TOKEN000' }),
      run('narrow-main-1', 180 - syntheticCoordinateJitter * 2, 720, 350, { text: 'TOKEN111' }),
      run('narrow-side-2', 30 - syntheticCoordinateJitter, 690, 90, { text: 'TOKEN222' }),
      run('narrow-main-2', 180 + syntheticCoordinateJitter * 2, 690, 350, { text: 'TOKEN333' }),
      run('narrow-main-3', 180 - syntheticCoordinateJitter * 3, 660, 350, { text: 'TOKEN444' }),
    ],
    expectedGroups: [
      ['narrow-side-1'], ['narrow-main-1'], ['narrow-side-2'],
      ['narrow-main-2'], ['narrow-main-3'],
    ],
    tags: ['rp060', 'jitter', 'row-specific', 'sidebar'],
    variantOf: 'NARROW_SIDEBAR',
  }),
  fixture({
    id: 'REPEATED_INLINE_BASELINE_JITTER',
    family: 'variant',
    intent: 'Inline row intent remains under tiny within-row baseline variation.',
    runs: [
      run('no-span-left-1', 40, 730, 120, { text: 'TOKEN000' }),
      run('no-span-right-1', 320, 730.0001, 180, { text: 'TOKEN111' }),
      run('no-span-left-2', 40, 700, 120, { text: 'TOKEN222' }),
      run('no-span-right-2', 320, 699.9999, 180, { text: 'TOKEN333' }),
      run('no-span-left-3', 40, 670, 120, { text: 'TOKEN444' }),
      run('no-span-right-3', 320, 670.0002, 180, { text: 'TOKEN555' }),
    ],
    expectedGroups: [
      ['no-span-left-1', 'no-span-right-1'],
      ['no-span-left-2', 'no-span-right-2'],
      ['no-span-left-3', 'no-span-right-3'],
    ],
    tags: ['rp060', 'jitter', 'baseline', 'exporter-drift'],
    variantOf: 'REPEATED_INLINE_NO_SPAN',
  }),
  fixture({
    id: 'CROSS_SLICE_ADJACENT_SAME',
    family: 'candidate-boundary',
    intent: 'Two cross-candidate fragments are one visual group.',
    runs: crossSliceOppositeRuns,
    expectedGroups: [['cross-slice-left', 'cross-slice-right']],
    tags: ['rp060', 'cross-slice', 'exact-opposite'],
    evidenceExpectation: 'EXPECTED_AMBIGUOUS',
  }),
  fixture({
    id: 'CROSS_SLICE_ADJACENT_SEPARATE',
    family: 'candidate-boundary',
    intent: 'The identical cross-candidate fragments are separate visual groups.',
    runs: crossSliceOppositeRuns,
    expectedGroups: [['cross-slice-left'], ['cross-slice-right']],
    tags: ['rp060', 'cross-slice', 'exact-opposite'],
    evidenceExpectation: 'EXPECTED_AMBIGUOUS',
  }),
  fixture({
    id: 'CANDIDATE_SPLIT_WITH_CONTEXT',
    family: 'candidate-boundary',
    intent: 'The target candidate is split with repeated separated context.',
    runs: [
      run('candidate-target-left', 40, 730, 120, { text: 'TOKEN000' }),
      run('candidate-target-right', 320, 730, 180, { text: 'TOKEN111' }),
      run('candidate-context-left-1', 40, 700, 120, { text: 'TOKEN222' }),
      run('candidate-context-right-1', 320, 700, 180, { text: 'TOKEN333' }),
      run('candidate-context-left-2', 40, 670, 120, { text: 'TOKEN444' }),
      run('candidate-context-right-2', 320, 670, 180, { text: 'TOKEN555' }),
    ],
    expectedGroups: [
      ['candidate-target-left'], ['candidate-target-right'],
      ['candidate-context-left-1'], ['candidate-context-right-1'],
      ['candidate-context-left-2'], ['candidate-context-right-2'],
    ],
    tags: ['rp060', 'candidate-context', 'split'],
    evidenceExpectation: 'DISTINGUISHABLE',
  }),
  fixture({
    id: 'CANDIDATE_REMAIN_WITH_CONTEXT',
    family: 'candidate-boundary',
    intent: 'The matched target candidate remains one group with spanning context.',
    runs: [
      run('candidate-target-left', 40, 730, 120, { text: 'TOKEN000' }),
      run('candidate-target-right', 320, 730, 180, { text: 'TOKEN111' }),
      run('candidate-context-span-1', 40, 700, 460, { text: 'TOKEN222' }),
      run('candidate-context-span-2', 40, 670, 460, { text: 'TOKEN333' }),
    ],
    expectedGroups: [
      ['candidate-target-left', 'candidate-target-right'],
      ['candidate-context-span-1'], ['candidate-context-span-2'],
    ],
    tags: ['rp060', 'candidate-context', 'remain'],
    evidenceExpectation: 'DISTINGUISHABLE',
  }),
  fixture({
    id: 'CJK_STRONG_SAME',
    family: 'cjk-fragmentation',
    intent: 'Matched CJK fragments form one visual group.',
    runs: strengthenedCjkRuns,
    expectedGroups: [
      ['strong-cjk-1', 'strong-cjk-2', 'strong-cjk-3', 'strong-cjk-4'],
      ['strong-cjk-context-left'], ['strong-cjk-context-right'],
    ],
    tags: ['rp060', 'cjk-strong', 'exact-opposite'],
    evidenceExpectation: 'EXPECTED_AMBIGUOUS',
  }),
  fixture({
    id: 'CJK_STRONG_SEPARATE',
    family: 'cjk-fragmentation',
    intent: 'The identical CJK fragments form two separate regional groups.',
    runs: strengthenedCjkRuns,
    expectedGroups: [
      ['strong-cjk-1', 'strong-cjk-2'],
      ['strong-cjk-3', 'strong-cjk-4'],
      ['strong-cjk-context-left'], ['strong-cjk-context-right'],
    ],
    tags: ['rp060', 'cjk-strong', 'exact-opposite'],
    evidenceExpectation: 'EXPECTED_AMBIGUOUS',
  }),
  fixture({
    id: 'LATIN_STRONG_SAME',
    family: 'latin-fragmentation',
    intent: 'Matched Latin fragments form one visual group.',
    runs: strengthenedLatinRuns,
    expectedGroups: [
      ['strong-latin-1', 'strong-latin-2', 'strong-latin-3'],
      ['strong-latin-context-left'], ['strong-latin-context-right'],
    ],
    tags: ['rp060', 'latin-strong', 'exact-opposite'],
    evidenceExpectation: 'EXPECTED_AMBIGUOUS',
  }),
  fixture({
    id: 'LATIN_STRONG_SEPARATE',
    family: 'latin-fragmentation',
    intent: 'The identical Latin fragments remain separate regional groups.',
    runs: strengthenedLatinRuns,
    expectedGroups: strengthenedLatinRuns.map(({ key }) => [key]),
    tags: ['rp060', 'latin-strong', 'exact-opposite'],
    evidenceExpectation: 'EXPECTED_AMBIGUOUS',
  }),
]

const rp073Run = (key: string, x: number, y: number, width: number, token: number) => (
  run(key, x, y, width, { text: `TOKEN${String(token).padStart(3, '0')}` })
)

const rp073CorePairs = [
  {
    id: 'INDEPENDENT_CONTINUATION',
    separatedId: 'TRUE_SEPARATED_CONTINUATION',
    inlineId: 'INLINE_CONTINUATION_MATCHED',
    runs: [
      rp073Run('target-left', 40, 730, 120, 0), rp073Run('target-right', 320, 730, 180, 1),
      rp073Run('left-b', 40, 700, 120, 2), rp073Run('right-b', 320, 700, 180, 3),
      rp073Run('left-c', 40, 670, 120, 4), rp073Run('right-c', 320, 670, 180, 5),
      rp073Run('left-only', 40, 640, 120, 6),
      rp073Run('right-only', 320, 610, 180, 7),
    ],
    separatedGroups: [
      ['target-left'], ['target-right'], ['left-b'], ['right-b'],
      ['left-c'], ['right-c'], ['left-only'], ['right-only'],
    ],
    inlineGroups: [
      ['target-left', 'target-right'], ['left-b', 'right-b'],
      ['left-c', 'right-c'], ['left-only'], ['right-only'],
    ],
  },
  {
    id: 'ASYMMETRIC_DENSITY',
    separatedId: 'TRUE_COLUMNS_ASYMMETRIC',
    inlineId: 'INLINE_ASYMMETRIC_MATCHED',
    runs: [
      rp073Run('target-left', 40, 730, 120, 0), rp073Run('target-right', 320, 730, 180, 1),
      rp073Run('left-b', 40, 700, 120, 2), rp073Run('right-b', 320, 700, 180, 3),
      rp073Run('right-c', 320, 670, 180, 4),
      rp073Run('right-d', 320, 640, 180, 5),
      rp073Run('right-e', 320, 610, 180, 6),
    ],
    separatedGroups: [
      ['target-left'], ['target-right'], ['left-b'], ['right-b'],
      ['right-c'], ['right-d'], ['right-e'],
    ],
    inlineGroups: [
      ['target-left', 'target-right'], ['left-b', 'right-b'],
      ['right-c'], ['right-d'], ['right-e'],
    ],
  },
  {
    id: 'INTERLEAVED_CONTINUATION',
    separatedId: 'SEPARATED_INTERLEAVED',
    inlineId: 'INLINE_INTERLEAVED_MATCHED',
    runs: [
      rp073Run('target-left', 40, 730, 120, 0), rp073Run('target-right', 320, 730, 180, 1),
      rp073Run('left-only', 40, 700, 120, 2),
      rp073Run('right-only', 320, 670, 180, 3),
      rp073Run('left-c', 40, 640, 120, 4), rp073Run('right-c', 320, 640, 180, 5),
    ],
    separatedGroups: [
      ['target-left'], ['target-right'], ['left-only'], ['right-only'],
      ['left-c'], ['right-c'],
    ],
    inlineGroups: [
      ['target-left', 'target-right'], ['left-only'], ['right-only'],
      ['left-c', 'right-c'],
    ],
  },
  {
    id: 'SPANNING_CONTEXT',
    separatedId: 'SEPARATED_WITH_SPANNING_CONTEXT',
    inlineId: 'INLINE_WITH_SPANNING_CONTEXT',
    runs: [
      rp073Run('target-left', 40, 730, 120, 0), rp073Run('target-right', 320, 730, 180, 1),
      rp073Run('span', 40, 700, 460, 2),
      rp073Run('left-b', 40, 670, 120, 3), rp073Run('right-b', 320, 670, 180, 4),
    ],
    separatedGroups: [
      ['target-left'], ['target-right'], ['span'], ['left-b'], ['right-b'],
    ],
    inlineGroups: [
      ['target-left', 'target-right'], ['span'], ['left-b', 'right-b'],
    ],
  },
  {
    id: 'NESTED_FRAGMENTS',
    separatedId: 'TRUE_COLUMNS_NESTED',
    inlineId: 'INLINE_NESTED_MATCHED',
    runs: [
      rp073Run('target-left', 40, 730, 120, 0), rp073Run('target-right', 320, 730, 180, 1),
      rp073Run('left-a', 40, 700, 50, 2), rp073Run('left-b', 95, 700, 55, 3),
      rp073Run('right-a', 320, 700, 70, 4), rp073Run('right-b', 395, 700, 75, 5),
    ],
    separatedGroups: [
      ['target-left'], ['target-right'], ['left-a', 'left-b'], ['right-a', 'right-b'],
    ],
    inlineGroups: [
      ['target-left', 'target-right'], ['left-a', 'left-b', 'right-a', 'right-b'],
    ],
  },
  {
    id: 'CROSS_CANDIDATE_CONTROL',
    separatedId: 'SEPARATED_CROSS_CANDIDATE_CONTEXT',
    inlineId: 'INLINE_CROSS_CANDIDATE_CONTEXT',
    runs: [
      rp073Run('target-left', 50, 730, 80, 0), rp073Run('target-right', 134, 732, 100, 1),
      rp073Run('left-b', 50, 700, 80, 2), rp073Run('right-b', 134, 700, 100, 3),
    ],
    separatedGroups: [['target-left'], ['target-right'], ['left-b'], ['right-b']],
    inlineGroups: [['target-left', 'target-right'], ['left-b', 'right-b']],
  },
] as const

const rp073CoreFixtures: readonly VisualGroupGroundTruthFixture[] = rp073CorePairs.flatMap((pair) => [
  fixture({
    id: pair.separatedId,
    family: 'candidate-boundary',
    intent: `Anonymous ${pair.id} layout has independent visual structures.`,
    runs: pair.runs,
    expectedGroups: pair.separatedGroups,
    tags: ['rp073', 'separated', pair.id],
  }),
  fixture({
    id: pair.inlineId,
    family: 'single-column-inline',
    intent: `Anonymous ${pair.id} layout has row-local inline visual units.`,
    runs: pair.runs,
    expectedGroups: pair.inlineGroups,
    tags: ['rp073', 'inline', pair.id],
  }),
])

const rp073ExistingControls = [
  {
    id: 'TWO_COLUMN_50_50_MATCHED', sourceId: 'TWO_COLUMN_50_50',
    inlineId: 'INLINE_50_50_MATCHED',
    inlineGroups: [
      ['col50-left-1', 'col50-right-1'], ['col50-left-2', 'col50-right-2'],
      ['col50-left-3', 'col50-right-3'],
    ],
    targetKeys: ['col50-left-1', 'col50-right-1'],
  },
  {
    id: 'TWO_COLUMN_30_70_MATCHED', sourceId: 'TWO_COLUMN_30_70',
    inlineId: 'INLINE_30_70_MATCHED',
    inlineGroups: [
      ['col30-left-1', 'col30-right-1'], ['col30-left-2', 'col30-right-2'],
      ['col30-left-3', 'col30-right-3'],
    ],
    targetKeys: ['col30-left-1', 'col30-right-1'],
  },
  {
    id: 'TWO_COLUMN_UNEQUAL_DENSITY_MATCHED', sourceId: 'TWO_COLUMN_UNEQUAL_DENSITY',
    inlineId: 'INLINE_UNEQUAL_DENSITY_MATCHED',
    inlineGroups: [
      ['unequal-left-1', 'unequal-right-1'], ['unequal-right-2'],
      ['unequal-left-3', 'unequal-right-3'],
    ],
    targetKeys: ['unequal-left-1', 'unequal-right-1'],
  },
  {
    id: 'NARROW_SIDEBAR_MATCHED', sourceId: 'NARROW_SIDEBAR',
    inlineId: 'INLINE_NARROW_SIDEBAR_MATCHED',
    inlineGroups: [
      ['narrow-side-1', 'narrow-main-1'], ['narrow-side-2', 'narrow-main-2'],
      ['narrow-main-3'],
    ],
    targetKeys: ['narrow-side-1', 'narrow-main-1'],
  },
  {
    id: 'WIDE_SIDEBAR_MATCHED', sourceId: 'WIDE_SIDEBAR',
    inlineId: 'INLINE_WIDE_SIDEBAR_MATCHED',
    inlineGroups: [
      ['wide-side-1', 'wide-main-1'], ['wide-side-2', 'wide-main-2'],
      ['wide-main-3'],
    ],
    targetKeys: ['wide-side-1', 'wide-main-1'],
  },
  {
    id: 'SPARSE_SIDEBAR_MATCHED', sourceId: 'SPARSE_SIDEBAR',
    inlineId: 'INLINE_SPARSE_SIDEBAR_MATCHED',
    inlineGroups: [['sparse-side', 'sparse-main']],
    targetKeys: ['sparse-side', 'sparse-main'],
  },
] as const

const rp073ExistingInlineFixtures: readonly VisualGroupGroundTruthFixture[] = rp073ExistingControls.map((control) => {
  const source = baseFixtures.find((candidate) => candidate.id === control.sourceId)
  if (!source) throw new Error(`Unknown RP-073 source fixture: ${control.sourceId}`)
  return fixture({
    id: control.inlineId,
    family: 'single-column-inline',
    intent: `Matched inline interpretation of anonymous ${control.id} geometry.`,
    runs: source.runs,
    pageBounds: source.pageBounds,
    expectedGroups: control.inlineGroups,
    tags: ['rp073', 'inline', control.id],
  })
})

export const RP073_CANDIDATE_SPLIT_PAIRS = [
  ...rp073CorePairs.map((pair) => ({
    id: pair.id,
    separatedFixtureId: pair.separatedId,
    inlineFixtureId: pair.inlineId,
    separatedTargetRunKeys: ['target-left', 'target-right'],
    inlineTargetRunKeys: ['target-left', 'target-right'],
    evidenceExpectation: 'EXACT_EVIDENCE_EQUIVALENT' as const,
  })),
  ...rp073ExistingControls.map((control) => ({
    id: control.id,
    separatedFixtureId: control.sourceId,
    inlineFixtureId: control.inlineId,
    separatedTargetRunKeys: control.targetKeys,
    inlineTargetRunKeys: control.targetKeys,
    evidenceExpectation: 'EXACT_EVIDENCE_EQUIVALENT' as const,
  })),
]

const rp073BaseFixtures = [...rp073CoreFixtures, ...rp073ExistingInlineFixtures]
const rp073ById = (id: string) => {
  const found = rp073BaseFixtures.find((candidate) => candidate.id === id)
  if (!found) throw new Error(`Unknown RP-073 fixture: ${id}`)
  return found
}

const scaleFixture = (
  source: VisualGroupGroundTruthFixture,
  id: string,
  factor: number,
): VisualGroupGroundTruthFixture => ({
  ...source,
  id,
  family: 'variant',
  intent: `${source.intent} Uniform scale variant.`,
  variantOf: source.id,
  tags: [...(source.tags ?? []), 'scale-variant'],
  pageBounds: pageBounds(source.pageBounds.minX * factor, source.pageBounds.width * factor),
  runs: source.runs.map(({ key, item }) => ({
    key,
    item: {
      ...item,
      transform: [
        item.transform[0], item.transform[1], item.transform[2], item.transform[3],
        item.transform[4] * factor, item.transform[5] * factor,
      ],
      width: item.width * factor,
      height: item.height * factor,
    },
  })),
  expectedGroups: source.expectedGroups.map((group) => [...group]),
})

const permuteFixture = (
  source: VisualGroupGroundTruthFixture,
  id: string,
  order: readonly number[],
): VisualGroupGroundTruthFixture => ({
  ...source,
  id,
  family: 'variant',
  intent: `${source.intent} Input permutation variant.`,
  variantOf: source.id,
  tags: [...(source.tags ?? []), 'permutation-variant'],
  runs: order.map((index) => source.runs[index]),
  expectedGroups: source.expectedGroups.map((group) => [...group]),
})

const byId = (id: string) => {
  const found = baseFixtures.find((candidate) => candidate.id === id)
  if (!found) throw new Error(`Unknown base VisualGroup fixture: ${id}`)
  return found
}

const variants: readonly VisualGroupGroundTruthFixture[] = [
  scaleFixture(byId('INLINE_LARGE_GAP'), 'INLINE_LARGE_GAP_SCALE_2X', 2),
  scaleFixture(byId('TWO_COLUMN_50_50'), 'TWO_COLUMN_50_50_SCALE_HALF', 0.5),
  scaleFixture(byId('SPLIT_CJK_TIGHT'), 'SPLIT_CJK_TIGHT_SCALE_2X', 2),
  permuteFixture(byId('REPEATED_LABEL_VALUE'), 'REPEATED_LABEL_VALUE_PERMUTED', [6, 2, 4, 0, 5, 1, 3]),
  permuteFixture(byId('TWO_COLUMN_50_50'), 'TWO_COLUMN_50_50_PERMUTED', [5, 0, 3, 2, 1, 4]),
  permuteFixture(byId('FULL_WIDTH_HEADER_COLUMNS'), 'FULL_WIDTH_HEADER_COLUMNS_PERMUTED', [4, 1, 3, 0, 5, 2]),
  scaleFixture(byId('SPARSE_INLINE_EXACT'), 'SPARSE_INLINE_EXACT_SCALE_2X', 2),
  scaleFixture(byId('SPARSE_SEPARATE_REGIONS_EXACT'), 'SPARSE_SEPARATE_REGIONS_EXACT_SCALE_2X', 2),
  scaleFixture(byId('TWO_COLUMN_MIXED_WIDTH_JITTER'), 'TWO_COLUMN_MIXED_WIDTH_JITTER_SCALE_2X', 2),
  scaleFixture(byId('CJK_STRONG_SAME'), 'CJK_STRONG_SAME_SCALE_HALF', 0.5),
  scaleFixture(byId('CJK_STRONG_SEPARATE'), 'CJK_STRONG_SEPARATE_SCALE_HALF', 0.5),
  permuteFixture(byId('SPARSE_INLINE_EXACT'), 'SPARSE_INLINE_EXACT_PERMUTED', [1, 0]),
  permuteFixture(byId('SPARSE_SEPARATE_REGIONS_EXACT'), 'SPARSE_SEPARATE_REGIONS_EXACT_PERMUTED', [1, 0]),
  permuteFixture(
    byId('REPEATED_COLUMNS_NO_SPAN'),
    'REPEATED_COLUMNS_NO_SPAN_PERMUTED',
    [5, 0, 3, 2, 1, 4],
  ),
  permuteFixture(byId('CJK_STRONG_SAME'), 'CJK_STRONG_SAME_PERMUTED', [5, 0, 3, 2, 1, 4]),
  permuteFixture(byId('CJK_STRONG_SEPARATE'), 'CJK_STRONG_SEPARATE_PERMUTED', [4, 1, 3, 0, 5, 2]),
  scaleFixture(rp073ById('TRUE_SEPARATED_CONTINUATION'), 'TRUE_SEPARATED_CONTINUATION_SCALE_2X', 2),
  scaleFixture(rp073ById('INLINE_CONTINUATION_MATCHED'), 'INLINE_CONTINUATION_MATCHED_SCALE_2X', 2),
  permuteFixture(
    rp073ById('TRUE_SEPARATED_CONTINUATION'),
    'TRUE_SEPARATED_CONTINUATION_PERMUTED',
    [7, 0, 3, 6, 1, 5, 2, 4],
  ),
  permuteFixture(
    rp073ById('INLINE_CONTINUATION_MATCHED'),
    'INLINE_CONTINUATION_MATCHED_PERMUTED',
    [7, 0, 3, 6, 1, 5, 2, 4],
  ),
]

export const visualGroupGroundTruthFixtures: readonly VisualGroupGroundTruthFixture[] = [
  ...baseFixtures,
  ...rp073BaseFixtures,
  ...variants,
]

export const VISUAL_GROUP_AMBIGUITY_SET: readonly VisualGroupAmbiguityPair[] = [
  {
    id: 'LARGE_INLINE_GAP_VS_TRUE_COLUMNS',
    groupedFixtureId: 'INLINE_LARGE_GAP',
    groupedRunKeys: ['inline-left-1', 'inline-right-1'],
    splitFixtureId: 'TWO_COLUMN_UNEQUAL_DENSITY',
    splitRunKeys: ['unequal-left-1', 'unequal-right-1'],
  },
  {
    id: 'REPEATED_LABEL_VALUE_VS_REPEATED_COLUMNS',
    groupedFixtureId: 'REPEATED_LABEL_VALUE',
    groupedRunKeys: ['label-1', 'value-1'],
    splitFixtureId: 'TWO_COLUMN_50_50',
    splitRunKeys: ['col50-left-1', 'col50-right-1'],
  },
  {
    id: 'SPLIT_CJK_HEADING_VS_CJK_REGIONS',
    groupedFixtureId: 'SPLIT_CJK_LOOSE',
    groupedRunKeys: ['cjk-loose-1', 'cjk-loose-2', 'cjk-loose-3', 'cjk-loose-4'],
    splitFixtureId: 'CJK_SEPARATE_REGIONS',
    splitRunKeys: [
      'cjk-region-left-1', 'cjk-region-left-2',
      'cjk-region-right-1', 'cjk-region-right-2',
    ],
  },
  {
    id: 'FULL_WIDTH_HEADER_FRAGMENTS_VS_COLUMN_FRAGMENTS',
    groupedFixtureId: 'FULL_WIDTH_HEADER_COLUMNS',
    groupedRunKeys: ['header-left', 'header-right'],
    splitFixtureId: 'TWO_COLUMN_50_50',
    splitRunKeys: ['col50-left-1', 'col50-right-1'],
  },
]

export const VISUAL_GROUP_STRENGTHENED_AMBIGUITY_SET: readonly VisualGroupAmbiguityPair[] = [
  {
    id: 'SPARSE_EXACT_GEOMETRY_OPPOSITE',
    groupedFixtureId: 'SPARSE_INLINE_EXACT',
    groupedRunKeys: ['sparse-opposite-left', 'sparse-opposite-right'],
    splitFixtureId: 'SPARSE_SEPARATE_REGIONS_EXACT',
    splitRunKeys: ['sparse-opposite-left', 'sparse-opposite-right'],
    evidenceExpectation: 'EXPECTED_AMBIGUOUS',
  },
  {
    id: 'REPEATED_NO_SPAN_OPPOSITE',
    groupedFixtureId: 'REPEATED_INLINE_NO_SPAN',
    groupedRunKeys: ['no-span-left-1', 'no-span-right-1'],
    splitFixtureId: 'REPEATED_COLUMNS_NO_SPAN',
    splitRunKeys: ['no-span-left-1', 'no-span-right-1'],
    evidenceExpectation: 'EXPECTED_AMBIGUOUS',
  },
  {
    id: 'FULL_WIDTH_VERTICAL_MATCHED_OPPOSITE',
    groupedFixtureId: 'HEADING_FRAGMENTS_STRONG',
    groupedRunKeys: ['strong-heading-left', 'strong-heading-right'],
    splitFixtureId: 'COLUMN_FRAGMENTS_STRONG',
    splitRunKeys: ['strong-heading-left', 'strong-heading-right'],
    evidenceExpectation: 'EXPECTED_AMBIGUOUS',
  },
  {
    id: 'CROSS_SLICE_ADJACENCY_OPPOSITE',
    groupedFixtureId: 'CROSS_SLICE_ADJACENT_SAME',
    groupedRunKeys: ['cross-slice-left', 'cross-slice-right'],
    splitFixtureId: 'CROSS_SLICE_ADJACENT_SEPARATE',
    splitRunKeys: ['cross-slice-left', 'cross-slice-right'],
    evidenceExpectation: 'EXPECTED_AMBIGUOUS',
  },
  {
    id: 'CANDIDATE_CONTEXT_OPPOSITE',
    groupedFixtureId: 'CANDIDATE_REMAIN_WITH_CONTEXT',
    groupedRunKeys: ['candidate-target-left', 'candidate-target-right'],
    splitFixtureId: 'CANDIDATE_SPLIT_WITH_CONTEXT',
    splitRunKeys: ['candidate-target-left', 'candidate-target-right'],
    evidenceExpectation: 'DISTINGUISHABLE',
  },
  {
    id: 'CJK_STRONG_EXACT_OPPOSITE',
    groupedFixtureId: 'CJK_STRONG_SAME',
    groupedRunKeys: ['strong-cjk-1', 'strong-cjk-2', 'strong-cjk-3', 'strong-cjk-4'],
    splitFixtureId: 'CJK_STRONG_SEPARATE',
    splitRunKeys: ['strong-cjk-1', 'strong-cjk-2', 'strong-cjk-3', 'strong-cjk-4'],
    evidenceExpectation: 'EXPECTED_AMBIGUOUS',
  },
  {
    id: 'LATIN_STRONG_EXACT_OPPOSITE',
    groupedFixtureId: 'LATIN_STRONG_SAME',
    groupedRunKeys: ['strong-latin-1', 'strong-latin-2', 'strong-latin-3'],
    splitFixtureId: 'LATIN_STRONG_SEPARATE',
    splitRunKeys: ['strong-latin-1', 'strong-latin-2', 'strong-latin-3'],
    evidenceExpectation: 'EXPECTED_AMBIGUOUS',
  },
]

export const rp060GroundTruthFixtures = visualGroupGroundTruthFixtures.filter((candidate) => (
  candidate.tags?.includes('rp060') || candidate.variantOf?.includes('SPARSE_')
  || candidate.variantOf?.includes('CJK_STRONG')
  || candidate.variantOf === 'REPEATED_COLUMNS_NO_SPAN'
  || candidate.variantOf === 'TWO_COLUMN_MIXED_WIDTH_JITTER'
))

export const visualGroupFixtureById = (id: string): VisualGroupGroundTruthFixture => {
  const found = visualGroupGroundTruthFixtures.find((candidate) => candidate.id === id)
  if (!found) throw new Error(`Unknown VisualGroup fixture: ${id}`)
  return found
}
