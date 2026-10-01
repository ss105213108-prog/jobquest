import { describe, expect, it } from 'vitest'
import type { InternalPageLayoutEvidenceResult } from '../src/parsers/pdfPageLayoutEvidence'
import type { VisualGroupFormationResult } from '../src/parsers/pdfVisualGroupResult'
import { validateVisualGroupFormationResult } from '../src/parsers/pdfVisualGroupResult'
import {
  bindSpatialInput,
  canAdmitReadingOrder,
  projectSpatialDiagnostic,
  querySpatialFact,
  spatialInputIssues,
  spatialResultIssues,
  type SpatialFact,
  type SpatialStructureInput,
  type SpatialStructureResult,
} from '../src/parsers/pdfSpatialStructureGraph'
import { visualGroupFixtureById } from './fixtures/pdfVisualGroupGroundTruth'
import { materializeVisualGroupGroundTruth } from './helpers/pdfVisualGroupGroundTruthHarness'
import {
  canonicalSpatialSemantics,
  declaredFact,
  groupIds,
  insufficientSpatialResult,
  makeSpatialEvidence,
  resolvedSpatialResult,
  singletonSpatialGroups,
} from './helpers/pdfSpatialStructureGraphContractHarness'

const basic = [
  { x: 30, y: 740, width: 100 }, { x: 260, y: 740, width: 220 },
  { x: 30, y: 680, width: 100 }, { x: 260, y: 680, width: 220 },
] as const
const transition = [
  { x: 30, y: 780, width: 450 }, { x: 30, y: 720, width: 100 },
  { x: 260, y: 720, width: 220 }, { x: 30, y: 650, width: 450 },
] as const
const fixture = (geometry: readonly { readonly x: number; readonly y: number; readonly width: number;
  readonly height?: number; readonly dir?: string }[] = basic, scale = 1) => {
  const evidence = makeSpatialEvidence(geometry, 1, scale)
  return bindSpatialInput(evidence, singletonSpatialGroups(evidence))
}
const ids = (input: SpatialStructureInput) => groupIds(input)
const fact = (input: SpatialStructureInput, kind: SpatialFact['kind'], members: readonly number[], minY: number, maxY: number) => (
  declaredFact(input, kind, members.map((index) => ids(input)[index]), minY, maxY)
)
const resolved = (input: SpatialStructureInput, facts: readonly SpatialFact[] = []) => resolvedSpatialResult(input, facts)
const issues = (input: SpatialStructureInput, result: unknown) => spatialResultIssues(input, result)

describe('RP-091 SpatialStructureGraph input admission', () => {
  it('admits only a production-valid RESOLVED VisualGroup result with matching AVAILABLE Graph/HLE', () => {
    const input = fixture()
    expect(spatialInputIssues(input)).toEqual([])
    if (input.evidence.status !== 'AVAILABLE') throw new Error('Invalid fixture')
    expect(validateVisualGroupFormationResult({ evidence: input.evidence, result: input.visualGroups }).valid).toBe(true)
  })

  it.each(['INSUFFICIENT_EVIDENCE', 'FAILED'] as const)('rejects upstream VisualGroup %s without translating it to spatial insufficiency', (status) => {
    const evidence = makeSpatialEvidence(basic)
    const groups: VisualGroupFormationResult = status === 'FAILED'
      ? { status, pageNumber: 1, code: 'INVALID_INPUT_STRUCTURE', issues: [] }
      : { status, pageNumber: 1, diagnostic: { reasonCode: 'INSUFFICIENT_CONTEXT' } }
    const input = bindSpatialInput(evidence, groups)
    expect(spatialInputIssues(input)).toContain('VISUAL_GROUP_NOT_RESOLVED')
    expect(issues(input, insufficientSpatialResult(1))).toContain('SPATIAL_INPUT_NOT_ADMITTED')
    expect(issues(input, { status: 'FAILED', pageNumber: 1, code: 'INVALID_INPUT_STRUCTURE' })).toEqual([])
    expect(canAdmitReadingOrder(input, { status: 'FAILED', pageNumber: 1, code: 'INVALID_INPUT_STRUCTURE' })).toBe(false)
  })

  it.each(['UNAVAILABLE', 'FAILED'] as const)('rejects upstream PageLayout %s before spatial execution', (status) => {
    const source = makeSpatialEvidence(basic)
    const upstream: InternalPageLayoutEvidenceResult = status === 'UNAVAILABLE'
      ? { status, pageNumber: 1, stage: 'vertical-calibration', code: 'INSUFFICIENT_CALIBRATION' }
      : { status, pageNumber: 1, stage: 'horizontal-observation', code: 'INVALID_LAYOUT_CONTEXT' }
    const input = bindSpatialInput(source, singletonSpatialGroups(source), upstream)
    expect(spatialInputIssues(input)).toContain('PAGE_LAYOUT_NOT_AVAILABLE')
    expect(issues(input, insufficientSpatialResult(1))).toContain('SPATIAL_INPUT_NOT_ADMITTED')
  })

  it('rejects unrelated evidence even when the page and geometry match', () => {
    const source = makeSpatialEvidence(basic)
    const other = makeSpatialEvidence(basic)
    const input = bindSpatialInput(source, singletonSpatialGroups(source), other)
    expect(spatialInputIssues(input)).toContain('EVIDENCE_INSTANCE_MISMATCH')
  })

  it('rejects a replaced RowEvidenceGraph instance', () => {
    const source = makeSpatialEvidence(basic)
    const other = makeSpatialEvidence(basic)
    const input = bindSpatialInput(source, singletonSpatialGroups(source), { ...source, graph: other.graph })
    expect(spatialInputIssues(input)).toContain('EVIDENCE_INSTANCE_MISMATCH')
  })

  it('rejects a replaced HLE instance', () => {
    const source = makeSpatialEvidence(basic)
    const other = makeSpatialEvidence(basic)
    const input = bindSpatialInput(source, singletonSpatialGroups(source), {
      ...source, horizontalEvidence: other.horizontalEvidence,
    })
    expect(spatialInputIssues(input)).toContain('EVIDENCE_INSTANCE_MISMATCH')
  })

  it('rejects a stale copy of otherwise equal PageLayout evidence', () => {
    const source = makeSpatialEvidence(basic)
    const input = bindSpatialInput(source, singletonSpatialGroups(source), { ...source })
    expect(spatialInputIssues(input)).toContain('EVIDENCE_INSTANCE_MISMATCH')
  })

  it('rejects a stale replacement VisualGroup result instance', () => {
    const source = makeSpatialEvidence(basic)
    const groups = singletonSpatialGroups(source)
    const input = bindSpatialInput(source, groups)
    const copied = { ...input, visualGroups: { ...groups } }
    expect(spatialInputIssues(copied)).toContain('MISSING_EVIDENCE_PROVENANCE')
  })

  it('rejects a different canonical page without adding fields to individual groups', () => {
    const evidence = makeSpatialEvidence(basic)
    const groups = singletonSpatialGroups(evidence)
    const input = bindSpatialInput(evidence, { ...groups, pageNumber: 2 })
    expect(spatialInputIssues(input)).toContain('PAGE_IDENTITY_MISMATCH')
  })

  it('rejects missing, duplicate, and foreign canonical run membership via production VisualGroup validation', () => {
    const evidence = makeSpatialEvidence(basic)
    const groups = singletonSpatialGroups(evidence)
    if (groups.status !== 'RESOLVED') throw new Error('Invalid fixture')
    const variants = [
      { ...groups, groups: groups.groups.slice(1) },
      { ...groups, groups: [...groups.groups, groups.groups[0]] },
      { ...groups, groups: [{ ...groups.groups[0], runIds: [999] }, ...groups.groups.slice(1)] },
      { ...groups, groups: [{ ...groups.groups[0], pageNumber: 1 }, ...groups.groups.slice(1)] },
    ] as VisualGroupFormationResult[]
    for (const result of variants) expect(spatialInputIssues(bindSpatialInput(evidence, result)))
      .toContain('INVALID_VISUAL_GROUP_RESULT')
  })

  it('rejects a malformed AVAILABLE object despite a TypeScript cast', () => {
    const source = makeSpatialEvidence(basic)
    const malformed = { ...source, graph: undefined } as unknown as typeof source
    const input = bindSpatialInput(malformed, singletonSpatialGroups(source))
    expect(spatialInputIssues(input)).toContain('INVALID_PAGE_LAYOUT_EVIDENCE')
  })
})

describe('RP-091 complete nodes and three-state result', () => {
  it('accepts exactly one canonical node per complete upstream VisualGroup, without Region owners', () => {
    const input = fixture()
    const result = resolved(input)
    expect(issues(input, result)).toEqual([])
    expect(result.status === 'RESOLVED' && result.graph.nodes.map((node) => node.groupId)).toEqual(ids(input))
    expect(result).not.toHaveProperty('regions')
    expect(canAdmitReadingOrder(input, result)).toBe(true)
  })

  it('rejects a missing VisualGroup node', () => {
    const input = fixture()
    const result = resolved(input) as Extract<SpatialStructureResult, { status: 'RESOLVED' }>
    expect(issues(input, { ...result, graph: { ...result.graph, nodes: result.graph.nodes.slice(1) } })).toContain('MISSING_NODE')
  })

  it('rejects a duplicate VisualGroup node', () => {
    const input = fixture()
    const result = resolved(input) as Extract<SpatialStructureResult, { status: 'RESOLVED' }>
    expect(issues(input, { ...result, graph: { ...result.graph, nodes: [...result.graph.nodes, result.graph.nodes[0]] } }))
      .toContain('DUPLICATE_NODE')
  })

  it('rejects unknown or fabricated node identities', () => {
    const input = fixture()
    const result = resolved(input) as Extract<SpatialStructureResult, { status: 'RESOLVED' }>
    const fake = { ...result.graph.nodes[0], groupId: 'visual:foreign' }
    expect(issues(input, { ...result, graph: { ...result.graph, nodes: [...result.graph.nodes, fake] } }))
      .toContain('UNKNOWN_NODE')
  })

  it('rejects a stale node reference after the upstream group identity changes', () => {
    const source = makeSpatialEvidence(basic)
    const oldInput = bindSpatialInput(source, singletonSpatialGroups(source))
    const old = resolved(oldInput) as Extract<SpatialStructureResult, { status: 'RESOLVED' }>
    const oldGroups = oldInput.visualGroups
    if (oldGroups.status !== 'RESOLVED') throw new Error('Invalid fixture')
    const renamed: VisualGroupFormationResult = { ...oldGroups, groups: oldGroups.groups.map((group, index) => (
      index === 0 ? { ...group, groupId: 'visual:renamed' } : group
    )) }
    const newInput = bindSpatialInput(source, renamed)
    expect(spatialInputIssues(newInput)).toEqual([])
    expect(issues(newInput, old)).toContain('UNKNOWN_NODE')
    expect(issues(newInput, old)).toContain('MISSING_NODE')
  })

  it('rejects run-level rebuilding, owner IDs, reading fields, and malformed node bounds', () => {
    const input = fixture()
    const result = resolved(input) as Extract<SpatialStructureResult, { status: 'RESOLVED' }>
    const first = result.graph.nodes[0]
    for (const extra of [{ runIds: [0] }, { groupIds: ids(input) }, { ownerRegionId: 'r:1' }, { readingIndex: 0 }]) {
      expect(issues(input, { ...result, graph: { ...result.graph, nodes: [{ ...first, ...extra }, ...result.graph.nodes.slice(1)] } }))
        .toContain('INVALID_NODE_SCHEMA')
    }
    expect(issues(input, { ...result, graph: { ...result.graph, nodes: [
      { ...first, bounds: { ...first.bounds, minX: NaN } }, ...result.graph.nodes.slice(1),
    ] } })).toContain('INVALID_NODE_GEOMETRY')
  })

  it('represents a singleton as one grounded node without a compulsory Region wrapper', () => {
    const input = fixture([{ x: 40, y: 700, width: 200 }])
    const result = resolved(input)
    expect(issues(input, result)).toEqual([])
    expect(result.status === 'RESOLVED' && result.graph.nodes).toHaveLength(1)
    expect(result.status === 'RESOLVED' && result.graph.facts).toEqual([])
  })

  it('keeps a production-valid multi-run VisualGroup whole rather than making run-level nodes', () => {
    const materialized = materializeVisualGroupGroundTruth(visualGroupFixtureById('SINGLE_LATIN_FRAGMENTS'))
    const groups: VisualGroupFormationResult = {
      status: 'RESOLVED', pageNumber: materialized.result.pageNumber,
      groups: [{ groupId: 'visual:whole', runIds: [
        materialized.runIdByKey.get('latin-a') as number,
        materialized.runIdByKey.get('latin-b') as number,
      ] }],
    }
    const input = bindSpatialInput(materialized.result, groups)
    expect(spatialInputIssues(input)).toEqual([])
    const result = resolved(input) as Extract<SpatialStructureResult, { status: 'RESOLVED' }>
    expect(issues(input, result)).toEqual([])
    expect(result.graph.nodes.map((node) => node.groupId)).toEqual(['visual:whole'])
    const split = { ...result, graph: { ...result.graph, nodes: [
      { ...result.graph.nodes[0], groupId: 'visual:run-a' },
      { ...result.graph.nodes[0], groupId: 'visual:run-b' },
    ] } }
    expect(issues(input, split)).toEqual(expect.arrayContaining(['MISSING_NODE', 'UNKNOWN_NODE']))
  })

  it('does not permit a zero-group RESOLVED shortcut', () => {
    const source = makeSpatialEvidence(basic)
    const groups: VisualGroupFormationResult = { status: 'RESOLVED', pageNumber: 1, groups: [] }
    const input = bindSpatialInput(source, groups)
    expect(spatialInputIssues(input)).toContain('INVALID_VISUAL_GROUP_RESULT')
  })

  it('treats valid upstream but ungroundable node geometry as spatial insufficiency', () => {
    const evidence = makeSpatialEvidence([
      { x: 30, y: 740, width: 100 }, { x: 260, y: 740, width: 220 },
      { x: 30, y: 680, width: 100 }, { x: 260, y: 680, width: 220, dir: 'rtl' },
    ])
    const input = bindSpatialInput(evidence, singletonSpatialGroups(evidence))
    expect(spatialInputIssues(input)).toEqual([])
    expect(issues(input, insufficientSpatialResult(1))).toEqual([])
    expect(canAdmitReadingOrder(input, insufficientSpatialResult(1))).toBe(false)
  })

  it('rejects INSUFFICIENT_EVIDENCE when all required nodes are grounded', () => {
    const input = fixture()
    expect(issues(input, insufficientSpatialResult(1))).toContain('UNSUPPORTED_INSUFFICIENCY')
  })

  it('rejects partial graphs attached to insufficiency and reserves FAILED for contract/internal causes', () => {
    const input = fixture()
    expect(issues(input, { ...insufficientSpatialResult(1), graph: resolved(input) })).toContain('INVALID_INSUFFICIENT_RESULT')
    expect(issues(input, { status: 'FAILED', pageNumber: 1, code: 'INVALID_SPATIAL_GRAPH' })).toEqual([])
    expect(issues(input, { status: 'FAILED', pageNumber: 1, code: 'INTERNAL_CONSISTENCY_FAILURE' })).toEqual([])
    expect(issues(input, { status: 'FAILED', pageNumber: 1, code: 'UNKNOWN_PAIR' })).toContain('INVALID_FAILURE_RESULT')
  })

  it('rejects a result from another page and ownership or ordering fields on the graph', () => {
    const input = fixture()
    const result = resolved(input) as Extract<SpatialStructureResult, { status: 'RESOLVED' }>
    expect(issues(input, { ...result, pageNumber: 2 })).toContain('PAGE_IDENTITY_MISMATCH')
    for (const extra of [{ regions: [] }, { columns: [] }, { readingSequence: ids(input) }]) {
      expect(issues(input, { ...result, graph: { ...result.graph, ...extra } })).toContain('INVALID_RESOLVED_SCHEMA')
    }
  })
})

describe('RP-091 positive facts and open-world queries', () => {
  it('admits a supported scoped horizontal separation without owner or order semantics', () => {
    const input = fixture()
    const relation = fact(input, 'X_DISJOINT', [0, 1], 740, 750)
    const result = resolved(input, [relation])
    expect(issues(input, result)).toEqual([])
    expect(querySpatialFact(input, result, relation)).toBe('SUPPORTED')
    expect(JSON.stringify(result)).not.toMatch(/Region|owner|readingIndex|sidebar|mainContent/i)
  })

  it('admits exact horizontal overlap as a positive fact in its local band', () => {
    const input = fixture([{ x: 30, y: 700, width: 150 }, { x: 100, y: 700, width: 150 }])
    const relation = fact(input, 'X_OVERLAP', [0, 1], 700, 710)
    expect(issues(input, resolved(input, [relation]))).toEqual([])
  })

  it('admits a vertical extent relation without treating it as a reading rank', () => {
    const input = fixture()
    const relation = fact(input, 'Y_ABOVE', [0, 2], 680, 750)
    expect(issues(input, resolved(input, [relation]))).toEqual([])
  })

  it('represents one-track to two-track to one-track occupancy without a global Column partition', () => {
    const input = fixture(transition)
    const observations = [
      fact(input, 'BAND_OCCUPANCY', [0], 780, 790),
      fact(input, 'BAND_OCCUPANCY', [1, 2], 720, 730),
      fact(input, 'BAND_OCCUPANCY', [3], 650, 660),
      fact(input, 'X_DISJOINT', [1, 2], 720, 730),
    ]
    const result = resolved(input, observations)
    expect(issues(input, result)).toEqual([])
    expect(result.status === 'RESOLVED' && result.graph).not.toHaveProperty('columns')
    expect(result.status === 'RESOLVED' && result.graph).not.toHaveProperty('regions')
  })

  it('does not allow a local band occupancy fact to omit another observed group in that band', () => {
    const input = fixture(transition)
    expect(issues(input, resolved(input, [fact(input, 'BAND_OCCUPANCY', [1], 720, 730)])))
      .toContain('FACT_NOT_SUPPORTED')
  })

  it('represents spanning context without separate ownership or first-reading claims', () => {
    const input = fixture(transition)
    const span = fact(input, 'X_SPANS', [0, 1, 2], 720, 730)
    const result = resolved(input, [span])
    expect(issues(input, result)).toEqual([])
    expect(JSON.stringify(result)).not.toMatch(/SPANNING|ownerRegionId|firstNode|readingSequence/)
  })

  it('returns UNKNOWN for an absent fact, never false or a fabricated complementary negative', () => {
    const input = fixture()
    const supported = fact(input, 'X_DISJOINT', [0, 1], 740, 750)
    const absent = fact(input, 'X_OVERLAP', [0, 1], 740, 750)
    const result = resolved(input, [supported])
    expect(querySpatialFact(input, result, supported)).toBe('SUPPORTED')
    expect(querySpatialFact(input, result, absent)).toBe('UNKNOWN')
    expect(result.status === 'RESOLVED' && result.graph.facts).toHaveLength(1)
  })

  it('accepts a zero-positive-fact graph with complete grounded nodes and leaves all queries UNKNOWN', () => {
    const input = fixture()
    const result = resolved(input)
    expect(issues(input, result)).toEqual([])
    expect(querySpatialFact(input, result, fact(input, 'X_DISJOINT', [0, 1], 740, 750))).toBe('UNKNOWN')
    expect(canAdmitReadingOrder(input, result)).toBe(true)
  })

  it('accepts partial positive facts without pairwise closure', () => {
    const input = fixture()
    const ab = fact(input, 'X_DISJOINT', [0, 1], 740, 750)
    const cd = fact(input, 'X_DISJOINT', [2, 3], 680, 690)
    const result = resolved(input, [ab, cd])
    expect(issues(input, result)).toEqual([])
    expect(querySpatialFact(input, result, fact(input, 'Y_ABOVE', [0, 2], 680, 750))).toBe('UNKNOWN')
  })

  it('rejects a fabricated positive fact whose exact geometry does not support it', () => {
    const input = fixture([{ x: 30, y: 700, width: 150 }, { x: 100, y: 700, width: 150 }])
    const falseSeparation = fact(input, 'X_DISJOINT', [0, 1], 700, 710)
    expect(issues(input, resolved(input, [falseSeparation]))).toContain('FACT_NOT_SUPPORTED')
  })

  it('rejects directly contradictory X_DISJOINT and X_OVERLAP claims in the same exact scope', () => {
    const input = fixture()
    const separated = fact(input, 'X_DISJOINT', [0, 1], 740, 750)
    const overlapped = fact(input, 'X_OVERLAP', [0, 1], 740, 750)
    expect(issues(input, resolved(input, [separated, overlapped]))).toContain('CONTRADICTORY_FACTS')
  })

  it('rejects duplicate positive facts without creating a closed-world relation table', () => {
    const input = fixture()
    const relation = fact(input, 'X_DISJOINT', [0, 1], 740, 750)
    expect(issues(input, resolved(input, [relation, relation]))).toContain('DUPLICATE_FACT')
  })

  it('rejects malformed relation arity without throwing or inventing missing endpoints', () => {
    const input = fixture()
    const malformed = fact(input, 'X_DISJOINT', [0], 740, 750)
    expect(issues(input, resolved(input, [malformed]))).toContain('INVALID_FACT_ENDPOINTS')
  })

  it('rejects unknown endpoints, fabricated witnesses, and stale run references', () => {
    const input = fixture()
    const relation = fact(input, 'X_DISJOINT', [0, 1], 740, 750)
    expect(issues(input, resolved(input, [{ ...relation, nodeIds: [relation.nodeIds[0], 'visual:foreign'] }])))
      .toContain('UNKNOWN_FACT_NODE')
    expect(issues(input, resolved(input, [{ ...relation, witnessRunIds: [999] }])))
      .toContain('INVALID_FACT_PROVENANCE')
    expect(issues(input, resolved(input, [{ ...relation, witnessRunIds: [0, 0] }])))
      .toContain('INVALID_FACT_PROVENANCE')
  })

  it('rejects nonfinite, inverted, and cross-page scopes without distance thresholds', () => {
    const input = fixture()
    const relation = fact(input, 'X_DISJOINT', [0, 1], 740, 750)
    for (const scope of [
      { ...relation.scope, minY: NaN }, { ...relation.scope, minY: 800 },
      { ...relation.scope, pageNumber: 2 },
    ]) expect(issues(input, resolved(input, [{ ...relation, scope }]))).toContain('INVALID_FACT_SCOPE')
  })

  it('rejects a local-band fact promoted to an unsupported page-global scope', () => {
    const input = fixture()
    const relation = fact(input, 'X_DISJOINT', [0, 1], 680, 750)
    expect(issues(input, resolved(input, [relation]))).toContain('FACT_NOT_SUPPORTED')
  })

  it('rejects owner, semantic, reading, and raw-text fields on authoritative facts', () => {
    const input = fixture()
    const relation = fact(input, 'X_DISJOINT', [0, 1], 740, 750)
    for (const extra of [
      { ownerRegionId: 'region:1' }, { columnOwnerId: 'column:1' },
      { sidebar: true }, { readingRank: 0 }, { nextToRead: 'visual:2' },
      { rawText: 'private' }, { fontName: 'private' },
    ]) expect(issues(input, resolved(input, [{ ...relation, ...extra }]))).toContain('INVALID_FACT_SCHEMA')
  })
})

describe('RP-091 stability, privacy, and Reading Order admission', () => {
  it('preserves admission, canonical nodes, facts, and queries under VisualGroup permutation', () => {
    const source = makeSpatialEvidence(basic)
    const groups = singletonSpatialGroups(source)
    if (groups.status !== 'RESOLVED') throw new Error('Invalid fixture')
    const forward = bindSpatialInput(source, groups)
    const reversed = bindSpatialInput(source, { ...groups, groups: [...groups.groups].reverse() })
    const relation = fact(forward, 'X_DISJOINT', [0, 1], 740, 750)
    const a = resolved(forward, [relation])
    const b = resolved(reversed, [relation])
    expect(spatialInputIssues(reversed)).toEqual([])
    expect(issues(forward, a)).toEqual([])
    expect(issues(reversed, b)).toEqual([])
    expect(canonicalSpatialSemantics(forward, a)).toEqual(canonicalSpatialSemantics(reversed, b))
    expect(querySpatialFact(reversed, b, relation)).toBe('SUPPORTED')
  })

  it('preserves canonical nodes and supported/unknown fact semantics under uniform scaling', () => {
    const one = fixture(basic, 1)
    const two = fixture(basic, 2)
    const relationOne = fact(one, 'X_DISJOINT', [0, 1], 740, 750)
    const relationTwo = fact(two, 'X_DISJOINT', [0, 1], 1480, 1500)
    const a = resolved(one, [relationOne])
    const b = resolved(two, [relationTwo])
    expect(issues(one, a)).toEqual([])
    expect(issues(two, b)).toEqual([])
    expect(canonicalSpatialSemantics(one, a)).toEqual(canonicalSpatialSemantics(two, b))
    expect(querySpatialFact(one, a, fact(one, 'Y_ABOVE', [0, 2], 680, 750))).toBe('UNKNOWN')
    expect(querySpatialFact(two, b, fact(two, 'Y_ABOVE', [0, 2], 1360, 1500))).toBe('UNKNOWN')
  })

  it('does not mutate evidence, HLE, VisualGroups, graph nodes, facts, or nested geometry', () => {
    const input = fixture()
    const relation = fact(input, 'X_DISJOINT', [0, 1], 740, 750)
    const result = resolved(input, [relation])
    const snapshot = structuredClone({ evidence: input.evidence, visualGroups: input.visualGroups, result })
    Object.freeze(input)
    Object.freeze(input.evidence)
    Object.freeze(input.visualGroups)
    Object.freeze(result)
    if (result.status !== 'RESOLVED') throw new Error('Invalid fixture')
    Object.freeze(result.graph)
    Object.freeze(result.graph.nodes)
    Object.freeze(result.graph.facts)
    Object.freeze(result.graph.nodes[0].bounds)
    Object.freeze(result.graph.facts[0].scope)
    expect(spatialInputIssues(input)).toEqual([])
    expect(issues(input, result)).toEqual([])
    expect(querySpatialFact(input, result, relation)).toBe('SUPPORTED')
    expect({ evidence: input.evidence, visualGroups: input.visualGroups, result }).toEqual(snapshot)
  })

  it('permits only privacy-safe structural diagnostics for an actual insufficiency', () => {
    const evidence = makeSpatialEvidence([
      { x: 30, y: 740, width: 100 }, { x: 260, y: 740, width: 220, dir: 'rtl' },
      { x: 30, y: 680, width: 100 }, { x: 260, y: 680, width: 220 },
    ])
    const input = bindSpatialInput(evidence, singletonSpatialGroups(evidence))
    const safe = { ...insufficientSpatialResult(1), diagnostic: { code: 'NODE_GEOMETRY_UNAVAILABLE', nodeCount: 4 } }
    expect(issues(input, safe)).toEqual([])
    for (const key of ['rawText', 'name', 'email', 'phone', 'company', 'school', 'fontName', 'message']) {
      expect(issues(input, { ...safe, diagnostic: { ...safe.diagnostic, [key]: 'private' } }))
        .toContain('INVALID_INSUFFICIENT_RESULT')
    }
  })

  it('admits Reading Order after a validated resolved spatial graph even when relations are UNKNOWN', () => {
    const input = fixture()
    const graph = resolved(input)
    expect(canAdmitReadingOrder(input, graph)).toBe(true)
    expect(querySpatialFact(input, graph, fact(input, 'X_DISJOINT', [0, 1], 740, 750))).toBe('UNKNOWN')
  })

  it('rejects Reading Order admission for spatial insufficiency, failure, or malformed facts', () => {
    const input = fixture()
    const malformed = resolved(input, [fact(input, 'X_OVERLAP', [0, 1], 740, 750)])
    expect(canAdmitReadingOrder(input, insufficientSpatialResult(1))).toBe(false)
    expect(canAdmitReadingOrder(input, { status: 'FAILED', pageNumber: 1, code: 'INVALID_SPATIAL_GRAPH' })).toBe(false)
    expect(canAdmitReadingOrder(input, malformed)).toBe(false)
  })

  it('does not consult the legacy Region result as a Reading Order prerequisite', () => {
    const input = fixture()
    const spatial = resolved(input)
    expect(canAdmitReadingOrder(input, spatial)).toBe(true)
    expect(spatial).not.toHaveProperty('regions')
    expect(spatial.status === 'RESOLVED' && spatial.graph).not.toHaveProperty('regions')
  })
})
