import { describe, expect, it } from 'vitest'
import type { InternalPageLayoutEvidenceResult } from '../src/parsers/pdfPageLayoutEvidence'
import type { VisualGroupFormationResult } from '../src/parsers/pdfVisualGroupResult'
import {
  bindRegionResolutionInput as bindRegionInput,
  canRunReadingOrder as mayRunReadingOrder,
  validateRegionResolutionInput as admitRegionInput,
  validateRegionResolutionResult as validateRegionResult,
  type RegionResolutionInput as RegionInput,
  type RegionResolutionResult as RegionResult,
} from '../src/parsers/pdfRegionResolutionResult'
import {
  insufficientRegionResult,
  makeRegionEvidence,
  resolvedRegionResult,
  singletonVisualGroups,
} from './helpers/pdfRegionResolutionContractHarness'

type Geometry = { readonly x: number; readonly y: number; readonly width: number; readonly height?: number }
const single: readonly Geometry[] = [{ x: 40, y: 700, width: 200 }]
const four: readonly Geometry[] = [
  { x: 30, y: 700, width: 100 }, { x: 30, y: 670, width: 100 },
  { x: 250, y: 700, width: 200 }, { x: 250, y: 670, width: 200 },
]
const transition: readonly Geometry[] = [
  { x: 30, y: 740, width: 420 },
  { x: 30, y: 700, width: 100 }, { x: 250, y: 700, width: 200 },
  { x: 30, y: 670, width: 100 }, { x: 250, y: 670, width: 200 },
  { x: 30, y: 630, width: 420 },
]
const fixture = (geometry: readonly Geometry[] = four, scale = 1): RegionInput => {
  const evidence = makeRegionEvidence(geometry, 1, scale)
  return bindRegionInput(evidence, singletonVisualGroups(evidence))
}
const groups = (input: RegionInput) => input.visualGroups.status === 'RESOLVED'
  ? input.visualGroups.groups.map((group) => group.groupId) : []
const resolved = (input: RegionInput, memberships: readonly (readonly string[])[]) => resolvedRegionResult(
  input, memberships.map((member) => ({ groups: member })),
)
const issues = (input: RegionInput, result: unknown) => validateRegionResult(input, result)

describe('RP-086 Region admission contract', () => {
  it('admits a same-page RESOLVED partition bound to its AVAILABLE evidence and HLE', () => {
    const input = fixture()
    expect(admitRegionInput(input)).toEqual([])
    expect(input.evidence.status).toBe('AVAILABLE')
    expect(input.visualGroups.status).toBe('RESOLVED')
  })

  it.each(['INSUFFICIENT_EVIDENCE', 'FAILED'] as const)('rejects upstream VisualGroup %s without reclassifying it as Region insufficiency', (status) => {
    const evidence = makeRegionEvidence(single)
    const result: VisualGroupFormationResult = status === 'FAILED'
      ? { status, pageNumber: 1, code: 'INVALID_INPUT_STRUCTURE', issues: [] }
      : { status, pageNumber: 1, diagnostic: { reasonCode: 'INSUFFICIENT_CONTEXT' } }
    const input = bindRegionInput(evidence, result)
    expect(admitRegionInput(input)).toContain('VISUAL_GROUP_NOT_RESOLVED')
    expect(issues(input, insufficientRegionResult(1))).toContain('REGION_INPUT_NOT_ADMITTED')
    expect(issues(input, { status: 'FAILED', pageNumber: 1, code: 'INVALID_INPUT_STRUCTURE' })).toEqual([])
    expect(issues(input, { status: 'FAILED', pageNumber: 2, code: 'INVALID_INPUT_STRUCTURE' })).toContain('REGION_INPUT_NOT_ADMITTED')
  })

  it.each(['UNAVAILABLE', 'FAILED'] as const)('rejects upstream PageLayout %s', (status) => {
    const evidence = makeRegionEvidence(single)
    const upstream: InternalPageLayoutEvidenceResult = status === 'UNAVAILABLE'
      ? { status, pageNumber: 1, stage: 'vertical-calibration', code: 'INSUFFICIENT_CALIBRATION' }
      : { status, pageNumber: 1, stage: 'horizontal-observation', code: 'INVALID_LAYOUT_CONTEXT' }
    const input = bindRegionInput(evidence, singletonVisualGroups(evidence), upstream)
    expect(admitRegionInput(input)).toContain('PAGE_LAYOUT_NOT_AVAILABLE')
    expect(issues(input, insufficientRegionResult(1))).toContain('REGION_INPUT_NOT_ADMITTED')
  })

  it('rejects same-page but unrelated evidence, replaced HLE, and stale copied evidence', () => {
    const source = makeRegionEvidence(four)
    const result = singletonVisualGroups(source)
    const unrelated = makeRegionEvidence(four)
    const replacedHle = { ...source, horizontalEvidence: unrelated.horizontalEvidence }
    const copied = { ...source }
    expect(admitRegionInput(bindRegionInput(source, result, unrelated))).toContain('EVIDENCE_INSTANCE_MISMATCH')
    expect(admitRegionInput(bindRegionInput(source, result, replacedHle))).toContain('EVIDENCE_INSTANCE_MISMATCH')
    expect(admitRegionInput(bindRegionInput(source, result, copied))).toContain('EVIDENCE_INSTANCE_MISMATCH')
    expect(admitRegionInput(bindRegionInput(source, result, { ...source, graph: unrelated.graph }))).toContain('EVIDENCE_INSTANCE_MISMATCH')
  })

  it('rejects page mismatch, mixed-page group annotation, and malformed upstream membership', () => {
    const evidence = makeRegionEvidence(four)
    const result = singletonVisualGroups(evidence)
    const wrongPage = { ...result, pageNumber: 2 } as VisualGroupFormationResult
    expect(admitRegionInput(bindRegionInput(evidence, wrongPage))).toContain('PAGE_IDENTITY_MISMATCH')
    const mixed = { ...result, groups: result.status === 'RESOLVED'
      ? result.groups.map((group, index) => index === 0 ? group : { ...group, pageNumber: 2 }) : [] } as VisualGroupFormationResult
    expect(admitRegionInput(bindRegionInput(evidence, mixed))).toContain('INVALID_VISUAL_GROUP_RESULT')
    const missing = { ...result, groups: result.status === 'RESOLVED' ? result.groups.slice(1) : [] } as VisualGroupFormationResult
    expect(admitRegionInput(bindRegionInput(evidence, missing))).toContain('INVALID_VISUAL_GROUP_RESULT')
  })

  it('rejects a page-2 group whose run reference is not in the bound page-1 evidence', () => {
    const pageOne = makeRegionEvidence(single, 1)
    const pageTwo = makeRegionEvidence(four, 2)
    const pageOneGroups = singletonVisualGroups(pageOne)
    const pageTwoGroups = singletonVisualGroups(pageTwo)
    if (pageOneGroups.status !== 'RESOLVED' || pageTwoGroups.status !== 'RESOLVED') throw new Error('Invalid fixture')
    const mixed: VisualGroupFormationResult = {
      ...pageOneGroups, groups: [...pageOneGroups.groups, pageTwoGroups.groups[3]],
    }
    expect(admitRegionInput(bindRegionInput(pageOne, mixed))).toContain('INVALID_VISUAL_GROUP_RESULT')
  })

  it('treats a malformed AVAILABLE object as failed admission even when TypeScript is bypassed', () => {
    const evidence = makeRegionEvidence(single)
    const malformed = { ...evidence, graph: undefined } as unknown as typeof evidence
    const input = bindRegionInput(malformed, singletonVisualGroups(evidence))
    expect(admitRegionInput(input)).toContain('INVALID_PAGE_LAYOUT_EVIDENCE')
    expect(issues(input, { status: 'FAILED', pageNumber: 1, code: 'INVALID_INPUT_STRUCTURE' })).toEqual([])
  })
})

describe('RP-086 Region three-state and ownership contract', () => {
  it('admits a valid singleton page as one structural Region, not document success', () => {
    const input = fixture(single)
    const result = resolved(input, [groups(input)])
    expect(issues(input, result)).toEqual([])
    expect(result).toMatchObject({ status: 'RESOLVED', graph: { regions: [{ groupIds: ['visual:0'] }] } })
    expect(result).not.toHaveProperty('readingIndex')
    expect(result).not.toHaveProperty('resumeProfile')
  })

  it('allows several VisualGroups in one Region and several non-full-height Regions', () => {
    const input = fixture()
    expect(issues(input, resolved(input, [groups(input)]))).toEqual([])
    const result = resolved(input, [[groups(input)[0], groups(input)[1]], [groups(input)[2], groups(input)[3]]])
    expect(issues(input, result)).toEqual([])
    expect(result.status === 'RESOLVED' && result.graph.regions.map((region) => region.groupIds.length)).toEqual([2, 2])
  })

  it('represents a spanning header, two lower Regions, and full-width footer without duplicate ownership', () => {
    const input = fixture(transition)
    const ids = groups(input)
    const result = resolvedRegionResult(input, [
      { groups: [ids[0]], role: 'SPANNING' },
      { groups: [ids[1], ids[3]], role: 'COLUMN_LIKE' },
      { groups: [ids[2], ids[4]], role: 'COLUMN_LIKE' },
      { groups: [ids[5]], role: 'SPANNING' },
    ])
    expect(issues(input, result)).toEqual([])
    expect(result.status === 'RESOLVED' && result.graph.regions.map((region) => region.role)).toEqual([
      'SPANNING', 'COLUMN_LIKE', 'COLUMN_LIKE', 'SPANNING',
    ])
    expect(result.status === 'RESOLVED' && result.graph.regions.flatMap((region) => region.groupIds)).toHaveLength(6)
    expect(result).not.toHaveProperty('columns')
  })

  it.each([
    ['missing', (input: RegionInput) => resolved(input, [[groups(input)[0], groups(input)[1]], [groups(input)[2]]]), 'MISSING_GROUP_MEMBERSHIP'],
    ['duplicate', (input: RegionInput) => resolved(input, [[groups(input)[0], groups(input)[1]], [groups(input)[1], groups(input)[2], groups(input)[3]]]), 'DUPLICATE_GROUP_MEMBERSHIP'],
    ['unknown', (input: RegionInput) => resolved(input, [[groups(input)[0], groups(input)[1]], [groups(input)[2], 'visual:unknown']]), 'UNKNOWN_GROUP_ID'],
  ] as const)('rejects %s Region ownership', (_name, build, expected) => {
    const input = fixture()
    expect(issues(input, build(input))).toContain(expected)
  })

  it('rejects empty Region, duplicate group within a Region, wrong page, and invalid IDs', () => {
    const input = fixture()
    const result = resolved(input, [groups(input)]) as Extract<RegionResult, { status: 'RESOLVED' }>
    const region = result.graph.regions[0]
    const change = (patch: Record<string, unknown>) => ({ ...result, graph: { regions: [{ ...region, ...patch }] } })
    expect(issues(input, change({ groupIds: [] }))).toContain('INVALID_REGION_NODE')
    expect(issues(input, change({ groupIds: [...groups(input), groups(input)[0]] }))).toContain('DUPLICATE_GROUP_MEMBERSHIP')
    expect(issues(input, change({ pageNumber: 2 }))).toContain('INVALID_REGION_NODE')
    expect(issues(input, change({ regionId: '' }))).toContain('INVALID_REGION_ID')
    const duplicateIds = { ...result, graph: { regions: [
      { ...region, groupIds: groups(input).slice(0, 2) },
      { ...region, groupIds: groups(input).slice(2) },
    ] } }
    expect(issues(input, duplicateIds)).toContain('INVALID_REGION_ID')
  })

  it('keeps ordinary spatial ambiguity insufficient with no partial graph or automatic singleton shortcut', async () => {
    const input = fixture()
    const unknown = insufficientRegionResult(1)
    expect(issues(input, unknown)).toEqual([])
    expect(issues(input, { ...unknown, graph: { regions: [resolved(input, [groups(input)])] } }))
      .toContain('INVALID_INSUFFICIENT_RESULT')
    const foundation = await import('../src/parsers/pdfRegionResolutionResult')
    expect(foundation).not.toHaveProperty('resolveRegions')
    expect(foundation).not.toHaveProperty('formRegions')
    expect(foundation).not.toHaveProperty('detectColumns')
    expect(foundation).not.toHaveProperty('buildRegionGraphFromGeometry')
  })

  it('allows FAILED only for a contract/internal failure, never as the normal ambiguity result', () => {
    const input = fixture()
    expect(issues(input, { status: 'FAILED', pageNumber: 1, code: 'INTERNAL_CONSISTENCY_FAILURE' })).toEqual([])
    expect(issues(input, { status: 'FAILED', pageNumber: 1, code: 'AMBIGUOUS_SPATIAL_LAYOUT' }))
      .toContain('INVALID_FAILURE_RESULT')
    expect(issues(input, { status: 'FAILED', pageNumber: 1, code: 'INVALID_REGION_GRAPH', graph: {} }))
      .toContain('INVALID_FAILURE_RESULT')
  })

  it('does not embed another Column ownership tree or Reading Order fields', () => {
    const input = fixture()
    const result = resolved(input, [groups(input)]) as Extract<RegionResult, { status: 'RESOLVED' }>
    expect(issues(input, { ...result, columns: [{ groupIds: [groups(input)[0]] }] })).toContain('INVALID_RESOLVED_SCHEMA')
    expect(issues(input, { ...result, graph: { ...result.graph, columns: [] } })).toContain('INVALID_RESOLVED_SCHEMA')
    expect(issues(input, { ...result, graph: { regions: [{ ...result.graph.regions[0], readingIndex: 0 }] } }))
      .toContain('INVALID_REGION_NODE')
    expect(issues(input, { ...result, firstRegion: result.graph.regions[0].regionId })).toContain('INVALID_RESOLVED_SCHEMA')
    expect(issues(input, { ...result, nextRegion: result.graph.regions[0].regionId })).toContain('INVALID_RESOLVED_SCHEMA')
    expect(issues(input, { ...result, leftColumnFirst: true })).toContain('INVALID_RESOLVED_SCHEMA')
  })

  it.each([
    ['NaN', { minX: NaN }], ['Infinity', { maxX: Infinity }],
    ['inverted', { minX: 900 }], ['missing', { minY: undefined }],
    ['mismatched', { maxY: 999 }],
  ] as const)('rejects %s Region geometry', (_name, patch) => {
    const input = fixture(single)
    const result = resolved(input, [groups(input)]) as Extract<RegionResult, { status: 'RESOLVED' }>
    const region = result.graph.regions[0]
    const changed = { ...result, graph: { regions: [{ ...region, bounds: { ...region.bounds, ...patch } }] } }
    expect(issues(input, changed).some((issue) => issue.includes('GEOMETRY'))).toBe(true)
  })

  it('does not reject overlap, exact touching, or nested bounds merely for their geometry', () => {
    const cases: readonly (readonly Geometry[])[] = [
      [{ x: 30, y: 700, width: 100 }, { x: 80, y: 700, width: 100 }],
      [{ x: 30, y: 700, width: 100 }, { x: 130, y: 700, width: 100 }],
      [{ x: 30, y: 700, width: 200 }, { x: 80, y: 700, width: 50 }],
    ]
    for (const geometry of cases) {
      const input = fixture(geometry)
      expect(issues(input, resolved(input, groups(input).map((id) => [id])))).toEqual([])
    }
  })

  it('admits Reading Order only after a complete RESOLVED Region result', () => {
    const input = fixture()
    expect(mayRunReadingOrder(input, resolved(input, [groups(input)]))).toBe(true)
    expect(mayRunReadingOrder(input, insufficientRegionResult(1))).toBe(false)
    expect(mayRunReadingOrder(input, { status: 'FAILED', pageNumber: 1, code: 'INTERNAL_CONSISTENCY_FAILURE' })).toBe(false)
    expect(mayRunReadingOrder(input, resolved(input, [groups(input).slice(1)]))).toBe(false)
  })
})

describe('RP-086 Region stability and privacy contract', () => {
  it('preserves canonical membership and IDs under group permutation', () => {
    const input = fixture()
    const evidence = input.evidence
    if (evidence.status !== 'AVAILABLE' || input.visualGroups.status !== 'RESOLVED') throw new Error('Invalid fixture')
    const permuted = bindRegionInput(evidence, { ...input.visualGroups, groups: [...input.visualGroups.groups].reverse() })
    const before = resolved(input, [[groups(input)[0], groups(input)[1]], [groups(input)[2], groups(input)[3]]])
    const after = resolved(permuted, [[groups(input)[1], groups(input)[0]], [groups(input)[3], groups(input)[2]]])
    expect(issues(input, before)).toEqual([])
    expect(issues(permuted, after)).toEqual([])
    if (before.status !== 'RESOLVED' || after.status !== 'RESOLVED') throw new Error('Invalid fixture')
    expect(before.graph.regions.map((region) => region.regionId)).toEqual(after.graph.regions.map((region) => region.regionId))
    expect(before.graph.regions.map((region) => [...region.groupIds].sort())).toEqual(after.graph.regions.map((region) => [...region.groupIds].sort()))
  })

  it('preserves topology and IDs under uniform positive coordinate scaling', () => {
    const a = fixture(transition)
    const b = fixture(transition, 2)
    const membership = [[0], [1, 3], [2, 4], [5]]
    const resultA = resolved(a, membership.map((items) => items.map((index) => groups(a)[index])))
    const resultB = resolved(b, membership.map((items) => items.map((index) => groups(b)[index])))
    expect(issues(a, resultA)).toEqual([])
    expect(issues(b, resultB)).toEqual([])
    if (resultA.status !== 'RESOLVED' || resultB.status !== 'RESOLVED') throw new Error('Invalid fixture')
    expect(resultA.graph.regions.map((region) => region.regionId)).toEqual(resultB.graph.regions.map((region) => region.regionId))
    expect(resultA.graph.regions.map((region) => region.groupIds)).toEqual(resultB.graph.regions.map((region) => region.groupIds))
  })

  it('rejects private or semantic diagnostics while keeping stable structural details', () => {
    const input = fixture()
    const safe = { ...insufficientRegionResult(1), diagnostic: {
      code: 'SPATIAL_STRUCTURE_UNRESOLVED', regionCount: 0,
    } }
    expect(issues(input, safe)).toEqual([])
    for (const key of ['groupIds', 'rawText', 'name', 'email', 'phone', 'company', 'school', 'fontName', 'section']) {
      expect(issues(input, { ...safe, diagnostic: { ...safe.diagnostic, [key]: 'private' } }))
        .toContain('INVALID_INSUFFICIENT_RESULT')
    }
  })

  it('does not mutate evidence, HLE, groups, or result during admission and validation', () => {
    const input = fixture()
    const result = resolved(input, [groups(input)])
    const snapshot = structuredClone({ evidence: input.evidence, visualGroups: input.visualGroups, result })
    Object.freeze(input)
    Object.freeze(input.visualGroups)
    Object.freeze(result)
    expect(admitRegionInput(input)).toEqual([])
    expect(issues(input, result)).toEqual([])
    expect({ evidence: input.evidence, visualGroups: input.visualGroups, result }).toEqual(snapshot)
  })
})
