import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { normalizeTextRunGeometry } from '../src/parsers/pdfTextGeometry'
import type { RowEvidenceGraph, VerticalRelation } from '../src/parsers/pdfRowEvidenceGraph'
import {
  VISUAL_GROUP_AMBIGUITY_SET,
  visualGroupFixtureById,
  visualGroupGroundTruthFixtures,
} from './fixtures/pdfVisualGroupGroundTruth'
import {
  canonicalExpectedGroups,
  materializeVisualGroupGroundTruth,
  validateMaterializedGroundTruth,
  validateVisualGroupGroundTruth,
} from './helpers/pdfVisualGroupGroundTruthHarness'

const groupContaining = (groups: readonly (readonly string[])[], key: string) => (
  groups.find((group) => group.includes(key))
)

const localGeometry = (fixtureId: string, runKeys: readonly string[]) => {
  const fixture = visualGroupFixtureById(fixtureId)
  const runByKey = new Map(fixture.runs.map((candidate) => [candidate.key, candidate.item]))
  const selected = runKeys.map((key) => {
    const item = runByKey.get(key)
    if (!item) throw new Error(`Unknown ${fixtureId} run: ${key}`)
    return {
      x: item.transform[4],
      y: item.transform[5],
      width: item.width,
      height: item.height,
      endX: item.transform[4] + item.width,
    }
  })
  const anchorX = Math.min(...selected.map((item) => item.x))
  const anchorY = selected[0]?.y ?? 0
  return selected.map((item) => ({
    relativeX: item.x - anchorX,
    relativeY: item.y - anchorY,
    width: item.width,
    height: item.height,
    relativeEndX: item.endX - anchorX,
  }))
}

describe('RP-058 anonymous VisualGroup ground-truth corpus', () => {
  it.each(visualGroupGroundTruthFixtures)('$id constructs production evidence and has a legal complete partition', (fixture) => {
    const materialized = materializeVisualGroupGroundTruth(fixture)
    expect(materialized.result.status).toBe('AVAILABLE')
    expect(materialized.result.graph.runs).toHaveLength(fixture.runs.length)
    expect(materialized.result.horizontalEvidence).toMatchObject({ schemaVersion: 1, scope: 'page' })
    expect(validateMaterializedGroundTruth(materialized)).toEqual({ valid: true, issues: [] })
  })

  it('covers every required layout family without deriving expected groups from evidence', () => {
    const ids = new Set(visualGroupGroundTruthFixtures.map((fixture) => fixture.id))
    for (const required of [
      'SINGLE_LATIN_FRAGMENTS',
      'INLINE_LARGE_GAP',
      'REPEATED_LABEL_VALUE',
      'TWO_COLUMN_50_50',
      'TWO_COLUMN_30_70',
      'TWO_COLUMN_UNEQUAL_DENSITY',
      'NARROW_SIDEBAR',
      'WIDE_SIDEBAR',
      'SPARSE_SIDEBAR',
      'FULL_WIDTH_HEADER_COLUMNS',
      'SPLIT_CJK_TIGHT',
      'SPLIT_CJK_LOOSE',
      'CJK_SEPARATE_REGIONS',
      'LATIN_PHRASE_FRAGMENTS',
      'LATIN_TRUE_COLUMNS',
      'MIXED_FONT_HEIGHT_SAME_GROUP',
      'SIMILAR_FONT_DIFFERENT_GROUPS',
      'TOUCHING_INTERVALS_SAME_GROUP',
      'OVERLAPPING_INTERVALS_SAME_GROUP',
      'OVERLAPPING_DECORATIVE_SEPARATE',
      'SAME_Y_FALSE_CANDIDATE_MERGE',
      'CROSS_CANDIDATE_RECOVERY',
      'UNSAFE_SINGLETON',
      'DENSE_INLINE_ROWS',
      'NONZERO_PAGE_ORIGIN',
    ]) expect(ids.has(required)).toBe(true)
  })

  it('keeps membership canonicalization independent of group and member order', () => {
    expect(canonicalExpectedGroups([
      ['r4'],
      ['r2', 'r1'],
      ['r3'],
    ])).toEqual([
      ['r1', 'r2'],
      ['r3'],
      ['r4'],
    ])
  })
})

describe('RP-058 matched ambiguity and contrast pairs', () => {
  it('contains the four required ambiguity pairs', () => {
    expect(VISUAL_GROUP_AMBIGUITY_SET.map((pair) => pair.id)).toEqual([
      'LARGE_INLINE_GAP_VS_TRUE_COLUMNS',
      'REPEATED_LABEL_VALUE_VS_REPEATED_COLUMNS',
      'SPLIT_CJK_HEADING_VS_CJK_REGIONS',
      'FULL_WIDTH_HEADER_FRAGMENTS_VS_COLUMN_FRAGMENTS',
    ])
  })

  it.each(VISUAL_GROUP_AMBIGUITY_SET)('$id preserves matching local geometry with opposite membership intent', (pair) => {
    const grouped = visualGroupFixtureById(pair.groupedFixtureId)
    const split = visualGroupFixtureById(pair.splitFixtureId)
    expect(localGeometry(pair.groupedFixtureId, pair.groupedRunKeys))
      .toEqual(localGeometry(pair.splitFixtureId, pair.splitRunKeys))

    const groupedPartition = canonicalExpectedGroups(grouped.expectedGroups)
    const splitPartition = canonicalExpectedGroups(split.expectedGroups)
    const groupedContainer = groupContaining(groupedPartition, pair.groupedRunKeys[0])
    expect(pair.groupedRunKeys.every((key) => groupedContainer?.includes(key))).toBe(true)

    const splitContainers = pair.splitRunKeys.map((key) => groupContaining(splitPartition, key))
    expect(new Set(splitContainers.map((group) => group?.join('|'))).size).toBeGreaterThan(1)
  })
})

describe('RP-058 provisional-candidate recovery boundaries', () => {
  it('locks a provisional candidate that VisualGroup must split', () => {
    const materialized = materializeVisualGroupGroundTruth(visualGroupFixtureById('SAME_Y_FALSE_CANDIDATE_MERGE'))
    const leftId = materialized.runIdByKey.get('false-merge-left')
    const rightId = materialized.runIdByKey.get('false-merge-right')
    expect(materialized.result.graph.candidates.some((candidate) => (
      candidate.runIds.includes(leftId as number) && candidate.runIds.includes(rightId as number)
    ))).toBe(true)
    expect(groupContaining(materialized.expectedGroups, 'false-merge-left'))
      .not.toEqual(groupContaining(materialized.expectedGroups, 'false-merge-right'))
  })

  it('locks legal cross-candidate recovery with direct DEFERRED permission', () => {
    const materialized = materializeVisualGroupGroundTruth(visualGroupFixtureById('CROSS_CANDIDATE_RECOVERY'))
    const leftId = materialized.runIdByKey.get('recovery-left') as number
    const rightId = materialized.runIdByKey.get('recovery-right') as number
    expect(materialized.result.graph.candidates.some((candidate) => (
      candidate.runIds.includes(leftId) && candidate.runIds.includes(rightId)
    ))).toBe(false)
    expect(materialized.result.graph.relations).toContainEqual(expect.objectContaining({
      leftRunId: Math.min(leftId, rightId),
      rightRunId: Math.max(leftId, rightId),
      state: 'DEFERRED',
    }))
    expect(groupContaining(materialized.expectedGroups, 'recovery-left'))
      .toEqual(groupContaining(materialized.expectedGroups, 'recovery-right'))
    expect(validateMaterializedGroundTruth(materialized).valid).toBe(true)
  })

  it('locks unsafe geometry to a singleton group', () => {
    const materialized = materializeVisualGroupGroundTruth(visualGroupFixtureById('UNSAFE_SINGLETON'))
    const unsafeId = materialized.runIdByKey.get('unsafe-run') as number
    expect(materialized.result.graph.runs.find((run) => run.originalIndex === unsafeId)?.geometryComparable).toBe(false)
    expect(groupContaining(materialized.expectedGroups, 'unsafe-run')).toEqual(['unsafe-run'])
  })
})

describe('RP-058 ground-truth validator architecture invariants', () => {
  const twoRunGraph = (relations: readonly VerticalRelation[]): RowEvidenceGraph => {
    const runs = [
      normalizeTextRunGeometry({
        str: 'fragment:a', transform: [1, 0, 0, 1, 50, 700], width: 50, height: 12,
        dir: 'ltr', fontName: 'Synthetic', hasEOL: false,
      }, 0),
      normalizeTextRunGeometry({
        str: 'fragment:b', transform: [1, 0, 0, 1, 110, 700], width: 50, height: 12,
        dir: 'ltr', fontName: 'Synthetic', hasEOL: false,
      }, 1),
    ]
    return {
      runs,
      candidates: [
        { id: 'candidate:0', runIds: [0], geometryStatus: 'comparable' },
        { id: 'candidate:1', runIds: [1], geometryStatus: 'comparable' },
      ],
      relations,
    }
  }

  it.each([
    {
      name: 'unknown run',
      groups: [['a'], ['b'], ['unknown']],
      code: 'UNKNOWN_RUN_KEY',
    },
    {
      name: 'duplicate membership',
      groups: [['a', 'b'], ['a']],
      code: 'DUPLICATE_GROUP_MEMBERSHIP',
    },
    {
      name: 'missing membership',
      groups: [['a']],
      code: 'MISSING_GROUP_MEMBERSHIP',
    },
  ])('rejects $name without inferring any grouping', ({ groups, code }) => {
    const result = validateVisualGroupGroundTruth({
      graph: twoRunGraph([{
        leftRunId: 0,
        rightRunId: 1,
        state: 'SUPPORTED',
        evidence: {
          baselineDifference: 0,
          heightRatio: 1,
          verticalOverlapRatio: 1,
          geometryComparable: true,
        },
      }]),
      fixtureRuns: [{ key: 'a' }, { key: 'b' }],
      expectedGroups: groups,
    })
    expect(result.valid).toBe(false)
    expect(result.issues.map((issue) => issue.code)).toContain(code)
  })

  it.each([
    { state: undefined, label: 'MISSING' },
    { state: 'REJECTED' as const, label: 'REJECTED' },
  ])('rejects a multi-run group containing a $label pair', ({ state }) => {
    const relations: VerticalRelation[] = state ? [{
      leftRunId: 0,
      rightRunId: 1,
      state,
      evidence: {
        baselineDifference: 0,
        heightRatio: 1,
        verticalOverlapRatio: 1,
        geometryComparable: true,
      },
    }] : []
    const result = validateVisualGroupGroundTruth({
      graph: twoRunGraph(relations),
      fixtureRuns: [{ key: 'a' }, { key: 'b' }],
      expectedGroups: [['a', 'b']],
    })
    expect(result).toEqual({
      valid: false,
      issues: [{ code: 'DIRECT_PAIR_PERMISSION_REQUIRED', runKeys: ['a', 'b'] }],
    })
  })

  it('rejects transitive chaining when one internal pair is MISSING', () => {
    const runs = [0, 1, 2].map((index) => normalizeTextRunGeometry({
      str: `fragment:${index}`,
      transform: [1, 0, 0, 1, 50 + index * 60, 700],
      width: 50,
      height: 12,
      dir: 'ltr',
      fontName: 'Synthetic',
      hasEOL: false,
    }, index))
    const evidence = {
      baselineDifference: 0,
      heightRatio: 1,
      verticalOverlapRatio: 1,
      geometryComparable: true,
    }
    const graph: RowEvidenceGraph = {
      runs,
      candidates: runs.map((candidate) => ({
        id: `candidate:${candidate.originalIndex}`,
        runIds: [candidate.originalIndex],
        geometryStatus: 'comparable',
      })),
      relations: [
        { leftRunId: 0, rightRunId: 1, state: 'SUPPORTED', evidence },
        { leftRunId: 1, rightRunId: 2, state: 'SUPPORTED', evidence },
      ],
    }
    expect(validateVisualGroupGroundTruth({
      graph,
      fixtureRuns: [{ key: 'a' }, { key: 'b' }, { key: 'c' }],
      expectedGroups: [['a', 'b', 'c']],
    })).toEqual({
      valid: false,
      issues: [{ code: 'DIRECT_PAIR_PERMISSION_REQUIRED', runKeys: ['a', 'c'] }],
    })
  })

  it('rejects an unsafe run in a multi-run expected group', () => {
    const materialized = materializeVisualGroupGroundTruth(visualGroupFixtureById('UNSAFE_SINGLETON'))
    const result = validateVisualGroupGroundTruth({
      graph: materialized.result.graph,
      fixtureRuns: materialized.fixture.runs,
      expectedGroups: [['unsafe-safe-left', 'unsafe-run'], ['unsafe-safe-right']],
    })
    expect(result.valid).toBe(false)
    expect(result.issues.map((issue) => issue.code)).toContain('UNSAFE_RUN_NOT_SINGLETON')
  })
})

describe('RP-058 scale, permutation, mapping, and isolation', () => {
  it.each(visualGroupGroundTruthFixtures.filter((fixture) => fixture.variantOf))(
    '$id preserves its base fixture canonical ground truth',
    (variant) => {
      const base = visualGroupFixtureById(variant.variantOf as string)
      expect(canonicalExpectedGroups(variant.expectedGroups))
        .toEqual(canonicalExpectedGroups(base.expectedGroups))
      expect(validateMaterializedGroundTruth(materializeVisualGroupGroundTruth(variant)).valid).toBe(true)
    },
  )

  it('maps all four known synthetic reconstruction gaps without using private PDF data', () => {
    const mapped = new Set(visualGroupGroundTruthFixtures.flatMap((fixture) => fixture.knownFailures ?? []))
    expect([...mapped].sort()).toEqual([
      'Same-Y separate columns',
      'Sidebar',
      'Split CJK heading',
      'Two-column',
    ])
    const serialized = JSON.stringify(visualGroupGroundTruthFixtures)
    expect(serialized).not.toContain('email')
    expect(serialized).not.toContain('phone')
    expect(serialized).not.toContain('company')
    expect(serialized).not.toContain('school')
  })

  it('contains no policy output, score, confidence, or reading-order contract', () => {
    const serialized = JSON.stringify(visualGroupGroundTruthFixtures)
    for (const forbidden of [
      'shouldMerge', 'shouldSplit', 'threshold', 'confidence', 'score',
      'readingOrder', 'columnOrder', 'regionOrder',
    ]) expect(serialized).not.toContain(forbidden)
  })

  it('keeps the production parser and reconstructors isolated from VisualGroup ground truth', () => {
    const productionSources = [
      'src/parsers/pdfResumeParser.ts',
      'src/parsers/pdfPageReconstructor.ts',
      'src/parsers/pdfLineReconstructor.ts',
    ].map((path) => readFileSync(resolve(path), 'utf8')).join('\n')
    expect(productionSources).not.toContain('pdfVisualGroupGroundTruth')
    expect(productionSources).not.toContain('validateVisualGroupGroundTruth')
    expect(productionSources).not.toContain('formVisualGroups')
  })
})
