import { describe, expect, it } from 'vitest'
import { normalizeTextRunGeometry, type GeometryRun } from '../src/parsers/pdfTextGeometry'
import type { RowEvidenceGraph } from '../src/parsers/pdfRowEvidenceGraph'
import {
  observeHorizontalLayout,
  type HorizontalLayoutEvidence,
  type HorizontalLayoutObservationResult,
} from '../src/parsers/pdfHorizontalLayoutEvidence'
import {
  defaultPageBounds,
  horizontalLayoutFixtureById,
  horizontalLayoutFixtures,
  scaledHorizontalLayoutFixture,
  type HorizontalLayoutFixture,
} from './fixtures/pdfHorizontalLayoutEvidenceContract'
import {
  exactHorizontalEdgeEvents,
  scaleInvariantProjection,
} from './helpers/horizontalLayoutEvidenceContractHarness'

const expectSuccess = (result: HorizontalLayoutObservationResult): HorizontalLayoutEvidence => {
  expect(result.ok).toBe(true)
  if (!result.ok) throw new Error(`Expected observation success, received ${result.code}`)
  return result.value
}

const expectInvalid = (result: HorizontalLayoutObservationResult, issue?: string) => {
  expect(result.ok).toBe(false)
  if (result.ok) throw new Error('Expected invalid layout context')
  expect(result.code).toBe('INVALID_LAYOUT_CONTEXT')
  if (issue) {
    const [code, runId] = issue.split(':')
    expect(result.issues).toContainEqual(runId === undefined
      ? expect.objectContaining({ code })
      : expect.objectContaining({ code, runIds: [Number(runId)] }))
  }
}

const observeFixture = (fixture: HorizontalLayoutFixture) => expectSuccess(observeHorizontalLayout({
  graph: fixture.graph,
  pageBounds: fixture.pageBounds,
}))

const anonymousRun = (
  originalIndex: number,
  x: number,
  width: number,
  text = `fragment-${originalIndex}`,
): GeometryRun => normalizeTextRunGeometry({
  str: text,
  transform: [1, 0, 0, 1, x, 400],
  width,
  height: 10,
  dir: 'ltr',
  fontName: 'AnonymousContractFont',
  hasEOL: false,
}, originalIndex)

const graphForOneSlice = (runs: readonly GeometryRun[]): RowEvidenceGraph => ({
  runs,
  candidates: [{ id: 'slice-a', runIds: runs.map((run) => run.originalIndex), geometryStatus: 'comparable' }],
  relations: [],
})

const collectObjectKeys = (value: unknown): string[] => {
  if (Array.isArray(value)) return value.flatMap(collectObjectKeys)
  if (typeof value !== 'object' || value === null) return []
  return Object.entries(value).flatMap(([key, nested]) => [key, ...collectObjectKeys(nested)])
}

describe('RP-041 HorizontalLayoutEvidence fixture corpus', () => {
  it('contains all approved anonymous observation layouts', () => {
    expect(horizontalLayoutFixtures.map((fixture) => fixture.id)).toEqual([
      'SINGLE_COLUMN_BASIC',
      'TWO_COLUMN_50_50',
      'TWO_COLUMN_30_70',
      'NARROW_SIDEBAR',
      'WIDE_SIDEBAR',
      'FULL_WIDTH_HEADER_PLUS_COLUMNS',
      'SINGLE_COLUMN_LARGE_INLINE_GAP',
      'REPEATED_LABEL_VALUE_ROWS',
      'MIXED_FONT_MIXED_HEIGHT',
      'SPARSE_TWO_RUN_PAGE',
      'DENSE_MULTI_ROW_PAGE',
      'UNSAFE_ONLY_PAGE',
      'MIXED_SAFE_UNSAFE_PAGE',
      'NONZERO_PAGE_MIN_X',
      'OUT_OF_PAGE_INTERVAL',
    ])
  })

  it.each(horizontalLayoutFixtures)('$id is a valid observation context without layout classification', (fixture) => {
    const evidence = observeFixture(fixture)
    const serialized = JSON.stringify(evidence)
    for (const forbiddenPolicyField of [
      'shouldMerge', 'shouldSplit', 'isColumn', 'isSidebar', 'isGutter', 'isInline',
      'logicalLine', 'visualGroup', 'columnId', 'regionId', 'readingOrder', 'PersistentGutter',
    ]) {
      expect(serialized).not.toContain(forbiddenPolicyField)
    }
  })
})

describe('RP-041 physical page bounds and interval contract', () => {
  it('accepts finite, internally consistent PDF page bounds', () => {
    expect(observeHorizontalLayout({
      graph: horizontalLayoutFixtureById('SINGLE_COLUMN_BASIC').graph,
      pageBounds: defaultPageBounds,
    }).ok).toBe(true)
  })

  it.each([
    [{ ...defaultPageBounds, maxX: 0, width: 0 }, 'INVALID_PAGE_RANGE'],
    [{ ...defaultPageBounds, maxX: -1, width: -1 }, 'INVALID_PAGE_RANGE'],
    [{ ...defaultPageBounds, minX: Number.NaN }, 'NONFINITE_PAGE_MIN_X'],
    [{ ...defaultPageBounds, maxX: Number.POSITIVE_INFINITY }, 'NONFINITE_PAGE_MAX_X'],
    [{ ...defaultPageBounds, width: Number.NaN }, 'NONFINITE_PAGE_WIDTH'],
    [{ ...defaultPageBounds, width: 601 }, 'INCONSISTENT_PAGE_WIDTH'],
    [{ ...defaultPageBounds, width: 600.0000000001 }, 'INCONSISTENT_PAGE_WIDTH'],
  ] as const)('rejects invalid physical bounds %# without inventing numeric tolerance', (pageBounds, issue) => {
    expectInvalid(observeHorizontalLayout({
      graph: horizontalLayoutFixtureById('SINGLE_COLUMN_BASIC').graph,
      pageBounds,
    }), issue)
  })

  it('preserves raw intervals and derives physical-page-normalized coordinates', () => {
    const evidence = observeFixture(horizontalLayoutFixtureById('NONZERO_PAGE_MIN_X'))
    expect(evidence.runIntervals).toEqual([{
      intervalId: 'interval:0',
      runId: 0,
      sliceId: 'slice-a',
      raw: { startX: 120, endX: 220, width: 100 },
      pageNormalized: { start: 20 / 600, end: 120 / 600, width: 100 / 600 },
      estimatedGlyphAdvance: 100 / 'anonymous-0'.length,
    }])
  })

  it('keeps occupied bounds distinct from physical bounds', () => {
    const evidence = observeFixture(horizontalLayoutFixtureById('SINGLE_COLUMN_BASIC'))
    expect(evidence.pageGeometry.physical).toEqual(defaultPageBounds)
    expect(evidence.pageGeometry.occupied).toEqual({ startX: 60, endX: 280, width: 220 })
  })

  it('does not clamp safe intervals that extend outside the physical page', () => {
    const evidence = observeFixture(horizontalLayoutFixtureById('OUT_OF_PAGE_INTERVAL'))
    expect(evidence.runIntervals.map((interval) => interval.raw)).toEqual([
      { startX: -20, endX: 60, width: 80 },
      { startX: 560, endX: 640, width: 80 },
    ])
    expect(evidence.runIntervals.map((interval) => interval.pageNormalized)).toEqual([
      { start: -20 / 600, end: 60 / 600, width: 80 / 600 },
      { start: 560 / 600, end: 640 / 600, width: 80 / 600 },
    ])
  })
})

describe('RP-041 provisional slices, gaps, and candidate contamination', () => {
  it('maps candidates to deterministic slices without converting them to logical rows', () => {
    const evidence = observeFixture(horizontalLayoutFixtureById('TWO_COLUMN_50_50'))
    expect(evidence.slices).toEqual([
      { sliceId: 'slice-a', sourceCandidateId: 'slice-a', runIds: [0, 1], orderedIntervalIds: ['interval:0', 'interval:1'] },
      { sliceId: 'slice-b', sourceCandidateId: 'slice-b', runIds: [2, 3], orderedIntervalIds: ['interval:2', 'interval:3'] },
      { sliceId: 'slice-c', sourceCandidateId: 'slice-c', runIds: [4, 5], orderedIntervalIds: ['interval:4', 'interval:5'] },
    ])
    expect(JSON.stringify(evidence.slices)).not.toContain('logical')
  })

  it('retains separate same-candidate intervals and their middle gap', () => {
    const evidence = observeFixture(horizontalLayoutFixtureById('TWO_COLUMN_50_50'))
    expect(evidence.runIntervals.slice(0, 2).map((interval) => interval.raw)).toEqual([
      { startX: 40, endX: 220, width: 180 },
      { startX: 40, endX: 220, width: 180 },
    ])
    const firstSliceIntervals = evidence.slices[0].orderedIntervalIds.map((id) => (
      evidence.runIntervals.find((interval) => interval.intervalId === id)?.raw
    ))
    expect(firstSliceIntervals).toEqual([
      { startX: 40, endX: 220, width: 180 },
      { startX: 340, endX: 520, width: 180 },
    ])
    expect(evidence.sliceGaps[0]).toMatchObject({
      sliceId: 'slice-a', leftRunId: 0, rightRunId: 1, rawGap: 120,
    })
  })

  it.each([
    ['positive', [anonymousRun(0, 20, 20), anonymousRun(1, 60, 20)], 20],
    ['zero', [anonymousRun(0, 20, 20), anonymousRun(1, 40, 20)], 0],
    ['negative-overlap', [anonymousRun(0, 20, 30), anonymousRun(1, 40, 20)], -10],
  ] as const)('records a %s gap exactly without classifying it', (_caseName, runs, expectedGap) => {
    const evidence = expectSuccess(observeHorizontalLayout({
      graph: graphForOneSlice(runs),
      pageBounds: defaultPageBounds,
    }))
    expect(evidence.sliceGaps).toHaveLength(1)
    expect(evidence.sliceGaps[0].rawGap).toBe(expectedGap)
    expect(Object.keys(evidence.sliceGaps[0])).not.toEqual(expect.arrayContaining(['sizeClass', 'shouldSplit', 'shouldMerge']))
  })

  it('records a large inline gap without adding column semantics', () => {
    const evidence = observeFixture(horizontalLayoutFixtureById('SINGLE_COLUMN_LARGE_INLINE_GAP'))
    expect(evidence.sliceGaps).toHaveLength(1)
    expect(evidence.sliceGaps[0].rawGap).toBe(230)
    expect(JSON.stringify(evidence)).not.toMatch(/column|inline|gutter/i)
  })

  it('produces identical observations when only font metadata and hasEOL change', () => {
    const source = horizontalLayoutFixtureById('MIXED_FONT_MIXED_HEIGHT')
    const changed: HorizontalLayoutFixture = {
      ...source,
      graph: {
        ...source.graph,
        runs: source.graph.runs.map((run) => ({ ...run, fontName: 'EntirelyDifferentFont', hasEOL: !run.hasEOL })),
      },
    }
    expect(observeFixture(changed)).toEqual(observeFixture(source))
  })
})

describe('RP-041 exact sweep segmentation and provenance', () => {
  it('preserves a repeated empty segment with canonical source provenance', () => {
    const evidence = observeFixture(horizontalLayoutFixtureById('TWO_COLUMN_50_50'))
    expect(evidence.segments).toEqual([
      {
        segmentId: 'segment:40:220',
        raw: { startX: 40, endX: 220, width: 180 },
        pageNormalized: { start: 40 / 600, end: 220 / 600, width: 180 / 600 },
        occupiedByRunIds: [0, 2, 4],
        occupiedInSliceIds: ['slice-a', 'slice-b', 'slice-c'],
        emptyInSliceIds: [],
      },
      {
        segmentId: 'segment:220:340',
        raw: { startX: 220, endX: 340, width: 120 },
        pageNormalized: { start: 220 / 600, end: 340 / 600, width: 120 / 600 },
        occupiedByRunIds: [],
        occupiedInSliceIds: [],
        emptyInSliceIds: ['slice-a', 'slice-b', 'slice-c'],
      },
      {
        segmentId: 'segment:340:520',
        raw: { startX: 340, endX: 520, width: 180 },
        pageNormalized: { start: 340 / 600, end: 520 / 600, width: 180 / 600 },
        occupiedByRunIds: [1, 3, 5],
        occupiedInSliceIds: ['slice-a', 'slice-b', 'slice-c'],
        emptyInSliceIds: [],
      },
    ])
    expect(JSON.stringify(evidence.segments)).not.toContain('isGutter')
  })

  it('preserves a spanning occupancy exception without erasing other slices empty provenance', () => {
    const evidence = observeFixture(horizontalLayoutFixtureById('FULL_WIDTH_HEADER_PLUS_COLUMNS'))
    const middle = evidence.segments.find((segment) => segment.raw.startX === 220 && segment.raw.endX === 340)
    expect(middle).toEqual({
      segmentId: 'segment:220:340',
      raw: { startX: 220, endX: 340, width: 120 },
      pageNormalized: { start: 220 / 600, end: 340 / 600, width: 120 / 600 },
      occupiedByRunIds: [0],
      occupiedInSliceIds: ['slice-header'],
      emptyInSliceIds: ['slice-row-a', 'slice-row-b'],
    })
    expect(JSON.stringify(evidence)).not.toContain('FULL_WIDTH_HEADER')
  })

  it('derives exact edge events but does not collapse nearby coordinates', () => {
    const graph = graphForOneSlice([
      anonymousRun(0, 100, 20),
      anonymousRun(1, 100.0001, 20),
    ])
    const evidence = expectSuccess(observeHorizontalLayout({ graph, pageBounds: defaultPageBounds }))
    const startEvents = exactHorizontalEdgeEvents(evidence).filter((event) => event.edge === 'START')
    expect(startEvents.map((event) => event.rawX)).toEqual([100, 100.0001])
    expect(new Set(startEvents.map((event) => event.rawX)).size).toBe(2)
  })

  it('handles a dense page using exact event points rather than a fixed grid', () => {
    const evidence = observeFixture(horizontalLayoutFixtureById('DENSE_MULTI_ROW_PAGE'))
    const expectedEventPoints = [...new Set(evidence.runIntervals.flatMap((interval) => [interval.raw.startX, interval.raw.endX]))].sort((a, b) => a - b)
    expect(evidence.segments.map((segment) => segment.raw.startX)).toEqual(expectedEventPoints.slice(0, -1))
    expect(evidence.segments.map((segment) => segment.raw.endX)).toEqual(expectedEventPoints.slice(1))
    expect(JSON.stringify(evidence)).not.toMatch(/grid|raster|bucket/i)
  })
})

describe('RP-041 availability, unsafe geometry, and privacy', () => {
  it('treats a sparse single-slice page as a valid observation', () => {
    const evidence = observeFixture(horizontalLayoutFixtureById('SPARSE_TWO_RUN_PAGE'))
    expect(evidence.availability).toEqual({
      safeRunState: 'AVAILABLE',
      verticalContext: 'SINGLE_SLICE',
      physicalPageNormalization: 'AVAILABLE',
      excludedUnsafeRunIds: [],
    })
    expect(evidence.sliceGaps).toHaveLength(1)
    expect(JSON.stringify(evidence)).not.toContain('INSUFFICIENT_LAYOUT_EVIDENCE')
  })

  it('returns a valid empty horizontal observation for an unsafe-only page', () => {
    const evidence = observeFixture(horizontalLayoutFixtureById('UNSAFE_ONLY_PAGE'))
    expect(evidence.runIntervals).toEqual([])
    expect(evidence.slices).toEqual([])
    expect(evidence.sliceGaps).toEqual([])
    expect(evidence.segments).toEqual([])
    expect(evidence.pageGeometry.occupied).toBeNull()
    expect(evidence.availability).toEqual({
      safeRunState: 'NONE',
      verticalContext: 'NONE',
      physicalPageNormalization: 'AVAILABLE',
      excludedUnsafeRunIds: [0, 1],
    })
  })

  it('excludes unsafe runs from intervals, gaps, occupancy, bounds, and edge events', () => {
    const evidence = observeFixture(horizontalLayoutFixtureById('MIXED_SAFE_UNSAFE_PAGE'))
    expect(evidence.availability.excludedUnsafeRunIds).toEqual([1])
    expect(evidence.runIntervals.map((interval) => interval.runId)).toEqual([0, 2])
    expect(evidence.sliceGaps).toEqual([expect.objectContaining({ leftRunId: 0, rightRunId: 2, rawGap: 180 })])
    expect(evidence.segments.flatMap((segment) => segment.occupiedByRunIds)).not.toContain(1)
    expect(evidence.pageGeometry.occupied).toEqual({ startX: 60, endX: 440, width: 380 })
    expect(exactHorizontalEdgeEvents(evidence).map((event) => event.runId)).not.toContain(1)
  })

  it('serializes no source text or forbidden resume metadata', () => {
    const source = horizontalLayoutFixtureById('SINGLE_COLUMN_BASIC')
    const privateMarkers = [
      'PRIVATE PERSON',
      'PRIVATE COMPANY',
      'private@example.test',
      '0900-000-000',
      'WORK EXPERIENCE',
      'private-resume.pdf',
      'PrivateFontName',
    ]
    const graph: RowEvidenceGraph = {
      ...source.graph,
      runs: source.graph.runs.map((run, index) => ({
        ...run,
        text: privateMarkers[index] ?? privateMarkers[0],
        fontName: 'PrivateFontName',
        hasEOL: true,
      })),
    }
    const evidence = expectSuccess(observeHorizontalLayout({ graph, pageBounds: source.pageBounds }))
    const serialized = JSON.stringify(evidence)
    for (const marker of privateMarkers) expect(serialized).not.toContain(marker)
    const keys = collectObjectKeys(evidence)
    expect(keys).not.toContain('fontName')
    expect(keys).not.toContain('hasEOL')
    expect(keys).not.toContain('text')
  })

  it('exposes only structural availability states, never policy sufficiency', () => {
    const serialized = JSON.stringify(horizontalLayoutFixtures.map(observeFixture))
    expect(serialized).not.toMatch(/SUFFICIENT|INSUFFICIENT|confidence|qualityScore|supportThreshold/)
  })
})

describe('RP-041 scale and permutation invariance', () => {
  it.each(['SINGLE_COLUMN_BASIC', 'TWO_COLUMN_50_50', 'FULL_WIDTH_HEADER_PLUS_COLUMNS', 'DENSE_MULTI_ROW_PAGE']) (
    'keeps normalized evidence and provenance invariant when %s is uniformly scaled',
    (fixtureId) => {
      const source = horizontalLayoutFixtureById(fixtureId)
      const scaled = scaledHorizontalLayoutFixture(source, 2)
      const sourceEvidence = observeFixture(source)
      const scaledEvidence = observeFixture(scaled)
      expect(scaleInvariantProjection(scaledEvidence)).toEqual(scaleInvariantProjection(sourceEvidence))
      expect(scaledEvidence.runIntervals.map((interval) => interval.raw)).toEqual(sourceEvidence.runIntervals.map((interval) => ({
        startX: interval.raw.startX * 2,
        endX: interval.raw.endX * 2,
        width: interval.raw.width * 2,
      })))
    },
  )

  it('canonicalizes run, candidate, member, and relation permutations', () => {
    const source = horizontalLayoutFixtureById('DENSE_MULTI_ROW_PAGE')
    const relation = {
      leftRunId: 0,
      rightRunId: 1,
      state: 'SUPPORTED' as const,
      evidence: { baselineDifference: 0, heightRatio: 1, verticalOverlapRatio: 1, geometryComparable: true },
    }
    const graphWithRelations: RowEvidenceGraph = {
      ...source.graph,
      relations: [relation, { ...relation, leftRunId: 3, rightRunId: 4 }],
    }
    const permuted: HorizontalLayoutFixture = {
      ...source,
      graph: {
        runs: [...source.graph.runs].reverse(),
        candidates: [...source.graph.candidates].reverse().map((candidate) => ({
          ...candidate,
          runIds: [...candidate.runIds].reverse(),
        })),
        relations: [...graphWithRelations.relations].reverse(),
      },
    }
    expect(observeFixture(permuted)).toEqual(observeFixture({ ...source, graph: graphWithRelations }))
  })
})

describe('RP-041 invalid context contract', () => {
  it('accepts canonical fractional intervals without requiring reverse subtraction equality', () => {
    const run = anonymousRun(0, 0.1, 0.2)
    expect(run.endX).toBe(run.x + run.width)
    expect((run.endX as number) - run.x).not.toBe(run.width)

    const evidence = expectSuccess(observeHorizontalLayout({
      graph: graphForOneSlice([run]),
      pageBounds: defaultPageBounds,
    }))
    expect(evidence.runIntervals[0].raw).toEqual({
      startX: run.x, endX: run.endX, width: run.width,
    })
  })

  it.each<{ label: string; overrides: Partial<GeometryRun> }>([
    { label: 'NaN x', overrides: { x: Number.NaN } },
    { label: 'infinite x', overrides: { x: Number.POSITIVE_INFINITY } },
    { label: 'NaN width', overrides: { width: Number.NaN } },
    { label: 'infinite width', overrides: { width: Number.POSITIVE_INFINITY } },
    { label: 'null endpoint', overrides: { endX: null } },
    { label: 'NaN endpoint', overrides: { endX: Number.NaN } },
    { label: 'infinite endpoint', overrides: { endX: Number.POSITIVE_INFINITY } },
    { label: 'negative width', overrides: { width: -0.1, endX: 0 } },
    { label: 'reversed endpoints', overrides: { endX: 0 } },
    { label: 'inconsistent canonical endpoint', overrides: { endX: 0.5 } },
  ])('rejects a safe run with $label', ({ overrides }) => {
    const run = { ...anonymousRun(0, 0.1, 0.2), ...overrides }
    expectInvalid(observeHorizontalLayout({
      graph: graphForOneSlice([run]),
      pageBounds: defaultPageBounds,
    }), 'IMPOSSIBLE_SAFE_INTERVAL:0')
  })

  it('rejects an invalid RowEvidenceGraph without returning a partial snapshot', () => {
    const source = horizontalLayoutFixtureById('SINGLE_COLUMN_BASIC')
    const result = observeHorizontalLayout({
      graph: { ...source.graph, candidates: source.graph.candidates.slice(1) },
      pageBounds: source.pageBounds,
    })
    expectInvalid(result, 'RUN_WITHOUT_PRIMARY_CANDIDATE')
    expect(result).not.toHaveProperty('value')
  })

  it('rejects duplicate canonical runs', () => {
    const source = horizontalLayoutFixtureById('SINGLE_COLUMN_BASIC')
    expectInvalid(observeHorizontalLayout({
      graph: { ...source.graph, runs: [...source.graph.runs, source.graph.runs[0]] },
      pageBounds: source.pageBounds,
    }), 'DUPLICATE_CANONICAL_RUN_ID')
  })

  it('rejects duplicate candidate run references', () => {
    const source = horizontalLayoutFixtureById('SINGLE_COLUMN_BASIC')
    const candidates = source.graph.candidates.map((candidate, index) => index === 0
      ? { ...candidate, runIds: [candidate.runIds[0], candidate.runIds[0]] }
      : candidate)
    expectInvalid(observeHorizontalLayout({
      graph: { ...source.graph, candidates }, pageBounds: source.pageBounds,
    }), 'DUPLICATE_CANDIDATE_RUN_REFERENCE')
  })

  it('rejects graph references to an unknown run', () => {
    const source = horizontalLayoutFixtureById('SINGLE_COLUMN_BASIC')
    expectInvalid(observeHorizontalLayout({
      graph: {
        ...source.graph,
        candidates: [{ id: 'unknown-slice', runIds: [999], geometryStatus: 'comparable' }, ...source.graph.candidates],
      },
      pageBounds: source.pageBounds,
    }), 'UNKNOWN_CANDIDATE_RUN_ID')
  })

  it('rejects a safe run with an impossible interval', () => {
    const source = horizontalLayoutFixtureById('SINGLE_COLUMN_BASIC')
    const runs = source.graph.runs.map((run, index) => index === 0 ? { ...run, endX: run.x - 1 } : run)
    expectInvalid(observeHorizontalLayout({
      graph: { ...source.graph, runs }, pageBounds: source.pageBounds,
    }), 'IMPOSSIBLE_SAFE_INTERVAL:0')
  })
})
