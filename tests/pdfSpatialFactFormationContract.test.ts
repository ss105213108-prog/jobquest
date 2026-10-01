import { describe, expect, it } from 'vitest'
import { formSpatialFactsV1 as formV1SpatialFacts } from '../src/parsers/pdfSpatialFactFormation'
import {
  bindSpatialInput,
  projectSpatialDiagnostic,
  querySpatialFact,
  spatialInputIssues,
  spatialResultIssues,
  type SpatialFact,
  type SpatialStructureInput,
  type SpatialStructureResult,
} from '../src/parsers/pdfSpatialStructureGraph'
import {
  declaredFact, makeSpatialEvidence, singletonSpatialGroups,
} from './helpers/pdfSpatialStructureGraphContractHarness'
import {
  spatialFactInput, type AnonymousBox,
} from './helpers/pdfSpatialFactFormationContractHarness'

const emitted = (result: SpatialStructureResult): readonly SpatialFact[] => {
  if (result.status !== 'RESOLVED') throw new Error('Expected a grounded anonymous fixture')
  return result.graph.facts
}
const kinds = (result: SpatialStructureResult) => emitted(result).map((fact) => fact.kind)
const v1Kinds = new Set(['X_DISJOINT', 'X_OVERLAP', 'Y_ABOVE'])
const two = (a: AnonymousBox, b: AnonymousBox) => spatialFactInput([a, b])

describe('RP-094 exact positive V1 spatial facts', () => {
  it('forms X_DISJOINT only from strict x separation within positive common y extent', () => {
    const input = two(
      { x: 20, y: 700, width: 20, height: 10 },
      { x: 60, y: 704, width: 20, height: 12 },
    )
    const result = formV1SpatialFacts(input)
    expect(emitted(result)).toEqual([{
      kind: 'X_DISJOINT', nodeIds: ['visual:0', 'visual:1'],
      scope: { pageNumber: 1, minY: 704, maxY: 710 }, witnessRunIds: [0, 1],
    }])
    expect(spatialResultIssues(input, result)).toEqual([])
  })

  it('forms X_OVERLAP only from positive envelope intersection in exact local scope', () => {
    const input = two(
      { x: 20, y: 700, width: 40, height: 10 },
      { x: 50, y: 704, width: 30, height: 12 },
    )
    const result = formV1SpatialFacts(input)
    expect(emitted(result)).toEqual([{
      kind: 'X_OVERLAP', nodeIds: ['visual:0', 'visual:1'],
      scope: { pageNumber: 1, minY: 704, maxY: 710 }, witnessRunIds: [0, 1],
    }])
    expect(spatialResultIssues(input, result)).toEqual([])
  })

  it('forms directed Y_ABOVE using the smallest enclosing y interval', () => {
    const input = two(
      { x: 20, y: 760, width: 20, height: 10 },
      { x: 20, y: 700, width: 20, height: 10 },
    )
    const result = formV1SpatialFacts(input)
    const relation = emitted(result)[0]
    expect(emitted(result)).toEqual([{
      kind: 'Y_ABOVE', nodeIds: ['visual:0', 'visual:1'],
      scope: { pageNumber: 1, minY: 700, maxY: 770 }, witnessRunIds: [0, 1],
    }])
    expect(querySpatialFact(input, result, relation)).toBe('SUPPORTED')
    expect(querySpatialFact(input, result, { ...relation, nodeIds: [...relation.nodeIds].reverse() })).toBe('UNKNOWN')
  })

  it('keeps the exact shared scope rather than promoting a horizontal fact to the page or union range', () => {
    const input = two(
      { x: 20, y: 700, width: 20, height: 25 },
      { x: 60, y: 710, width: 20, height: 20 },
    )
    const result = formV1SpatialFacts(input)
    expect(emitted(result)[0].scope).toEqual({ pageNumber: 1, minY: 710, maxY: 725 })
    expect(querySpatialFact(input, result, declaredFact(input, 'X_DISJOINT', ['visual:0', 'visual:1'], 700, 730)))
      .toBe('UNKNOWN')
  })

  it('requires a positive y intersection for horizontal separation even when x is far apart', () => {
    const input = two(
      { x: 20, y: 760, width: 20 }, { x: 200, y: 700, width: 20 },
    )
    expect(kinds(formV1SpatialFacts(input))).toEqual(['Y_ABOVE'])
  })

  it('does not form a horizontal fact when y extents exactly touch', () => {
    const input = two(
      { x: 20, y: 710, width: 20 }, { x: 60, y: 700, width: 20 },
    )
    const result = formV1SpatialFacts(input)
    expect(emitted(result)).toEqual([])
    expect(querySpatialFact(input, result, declaredFact(input, 'X_DISJOINT', ['visual:0', 'visual:1'], 700, 720)))
      .toBe('UNKNOWN')
  })

  it('does not form either horizontal fact when x extents exactly touch', () => {
    const input = two(
      { x: 20, y: 700, width: 10 }, { x: 30, y: 700, width: 10 },
    )
    const result = formV1SpatialFacts(input)
    expect(emitted(result)).toEqual([])
    for (const kind of ['X_DISJOINT', 'X_OVERLAP'] as const) {
      expect(querySpatialFact(input, result, declaredFact(input, kind, ['visual:0', 'visual:1'], 700, 710)))
        .toBe('UNKNOWN')
    }
  })

  it('distinguishes exact touching, a tiny positive gap, and a tiny positive overlap without epsilon', () => {
    const first = { x: 20, y: 700, width: 10 }
    expect(emitted(formV1SpatialFacts(two(first, { x: 30, y: 700, width: 10 })))).toEqual([])
    expect(kinds(formV1SpatialFacts(two(first, { x: 30 + 1 / 1024, y: 700, width: 10 })))).toEqual(['X_DISJOINT'])
    expect(kinds(formV1SpatialFacts(two(first, { x: 30 - 1 / 1024, y: 700, width: 10 })))).toEqual(['X_OVERLAP'])
  })

  it('does not form Y_ABOVE when vertical extents touch exactly', () => {
    const input = two(
      { x: 20, y: 710, width: 20 }, { x: 20, y: 700, width: 20 },
    )
    expect(emitted(formV1SpatialFacts(input))).toEqual([])
  })

  it('does not use center or baseline rank to form Y_ABOVE through vertical overlap', () => {
    const input = two(
      { x: 20, y: 708, width: 20, height: 10 },
      { x: 20, y: 700, width: 20, height: 10 },
    )
    const result = formV1SpatialFacts(input)
    expect(kinds(result)).toEqual(['X_OVERLAP'])
    expect(kinds(result)).not.toContain('Y_ABOVE')
  })

  it('treats diagonal separation as vertical only when there is no shared y scope', () => {
    const input = two(
      { x: 20, y: 760, width: 20 }, { x: 200, y: 700, width: 20 },
    )
    expect(emitted(formV1SpatialFacts(input))).toEqual([{
      kind: 'Y_ABOVE', nodeIds: ['visual:0', 'visual:1'],
      scope: { pageNumber: 1, minY: 700, maxY: 770 }, witnessRunIds: [0, 1],
    }])
  })

  it('supports overlap for identical positive-area envelopes but no disjoint or above claim', () => {
    const input = two(
      { x: 20, y: 700, width: 40 }, { x: 20, y: 700, width: 40 },
    )
    expect(kinds(formV1SpatialFacts(input))).toEqual(['X_OVERLAP'])
  })

  it('supports envelope overlap for nested bounds without owner or span inference', () => {
    const input = two(
      { x: 20, y: 700, width: 100, height: 20 },
      { x: 40, y: 705, width: 20, height: 10 },
    )
    const result = formV1SpatialFacts(input)
    expect(kinds(result)).toEqual(['X_OVERLAP'])
    expect(emitted(result)[0].scope).toEqual({ pageNumber: 1, minY: 705, maxY: 715 })
    expect(JSON.stringify(result)).not.toMatch(/ownerRegionId|columnOwnerId|X_SPANS|readingIndex/)
  })

  it('may coexist with Y_ABOVE across different pairs, never from the same pair', () => {
    const input = spatialFactInput([
      { x: 20, y: 760, width: 20 }, { x: 80, y: 760, width: 20 },
      { x: 20, y: 700, width: 20 },
    ])
    const result = formV1SpatialFacts(input)
    expect(kinds(result)).toEqual(['X_DISJOINT', 'Y_ABOVE', 'Y_ABOVE'])
    expect(new Set(emitted(result).filter((fact) => fact.kind !== 'Y_ABOVE').map((fact) => fact.nodeIds.join(':'))).size)
      .toBe(1)
  })
})

describe('RP-094 abstention and graph state', () => {
  it.each([
    { boxes: [{ x: 20, y: 700, width: 10 }, { x: 60, y: 700, width: 10 }] },
    { boxes: [{ x: 20, y: 700, width: 40 }, { x: 40, y: 700, width: 40 }] },
    { boxes: [{ x: 20, y: 700, width: 10 }, { x: 30, y: 700, width: 10 }] },
    { boxes: [{ x: 20, y: 710, width: 10 }, { x: 60, y: 700, width: 10 }] },
    { boxes: [{ x: 20, y: 700, width: 40 }, { x: 20, y: 700, width: 40 }] },
  ] as const)('never emits contradictory separation and overlap for one pair and scope %#', ({ boxes }) => {
    const facts = emitted(formV1SpatialFacts(spatialFactInput(boxes)))
    expect(facts.filter((fact) => fact.kind === 'X_DISJOINT' || fact.kind === 'X_OVERLAP')).toHaveLength(facts.length > 0 ? 1 : 0)
  })

  it('accepts a grounded multi-node graph with zero V1 facts as RESOLVED', () => {
    const input = spatialFactInput([
      { x: 20, y: 700, width: 10 }, { x: 30, y: 700, width: 10 },
      { x: 20, y: 710, width: 10 },
    ])
    const result = formV1SpatialFacts(input)
    expect(result.status).toBe('RESOLVED')
    if (result.status !== 'RESOLVED') throw new Error('Unexpected result')
    expect(result.graph.nodes).toHaveLength(3)
    expect(result.graph.facts).toEqual([])
    expect(spatialResultIssues(input, result)).toEqual([])
  })

  it('uses only positive V1 fact types and leaves unsupported queries UNKNOWN', () => {
    const input = two(
      { x: 20, y: 700, width: 20 }, { x: 60, y: 700, width: 20 },
    )
    const result = formV1SpatialFacts(input)
    expect(emitted(result).every((fact) => v1Kinds.has(fact.kind))).toBe(true)
    expect(querySpatialFact(input, result, declaredFact(input, 'X_OVERLAP', ['visual:0', 'visual:1'], 700, 710)))
      .toBe('UNKNOWN')
    expect(JSON.stringify(result)).not.toMatch(/NOT_DISJOINT|NOT_OVERLAP|NOT_ABOVE|SAME_TRACK|DIFFERENT_TRACK/)
  })

  it('does not infer band or track occupancy from a two-column-like pattern', () => {
    const input = spatialFactInput([
      { x: 20, y: 760, width: 20 }, { x: 120, y: 760, width: 20 },
      { x: 20, y: 700, width: 20 }, { x: 120, y: 700, width: 20 },
    ])
    const result = formV1SpatialFacts(input)
    expect(kinds(result)).toContain('X_DISJOINT')
    expect(kinds(result)).not.toContain('BAND_OCCUPANCY')
    expect(JSON.stringify(result)).not.toMatch(/track|column|sidebar/i)
  })

  it('does not infer X_SPANS from a wide upper group and two narrow lower groups', () => {
    const input = spatialFactInput([
      { x: 20, y: 760, width: 200 },
      { x: 20, y: 700, width: 30 }, { x: 150, y: 700, width: 30 },
    ])
    const result = formV1SpatialFacts(input)
    expect(kinds(result)).toContain('Y_ABOVE')
    expect(kinds(result)).not.toContain('X_SPANS')
    expect(kinds(result)).not.toContain('BAND_OCCUPANCY')
  })

  it('does not admit unresolved VisualGroups or mismatched evidence into formation', () => {
    const source = makeSpatialEvidence([
      { x: 20, y: 700, width: 20 }, { x: 60, y: 700, width: 20 },
    ])
    const unresolved = bindSpatialInput(source, {
      status: 'INSUFFICIENT_EVIDENCE', pageNumber: 1,
      diagnostic: { reasonCode: 'INSUFFICIENT_CONTEXT' },
    })
    expect(spatialInputIssues(unresolved)).toContain('VISUAL_GROUP_NOT_RESOLVED')
    expect(() => formV1SpatialFacts(unresolved)).toThrow('Spatial input was not admitted')
    const copied = bindSpatialInput(source, singletonSpatialGroups(source), { ...source })
    expect(spatialInputIssues(copied)).toContain('EVIDENCE_INSTANCE_MISMATCH')
    expect(() => formV1SpatialFacts(copied)).toThrow('Spatial input was not admitted')
  })

  it('distinguishes ungroundable required node geometry from a valid zero-fact graph', () => {
    const input = spatialFactInput([
      { x: 20, y: 760, width: 20 }, { x: 120, y: 760, width: 20, dir: 'rtl' },
      { x: 20, y: 700, width: 20 }, { x: 120, y: 700, width: 20 },
    ])
    expect(spatialInputIssues(input)).toEqual([])
    const result = formV1SpatialFacts(input)
    expect(result).toEqual({
      status: 'INSUFFICIENT_EVIDENCE', pageNumber: 1,
      diagnostic: { code: 'NODE_GEOMETRY_UNAVAILABLE' },
    })
    expect(spatialResultIssues(input, result)).toEqual([])
  })

  it('projects only privacy-safe structural diagnostics', () => {
    const input = two(
      { x: 20, y: 700, width: 20 }, { x: 60, y: 700, width: 20 },
    )
    const result = formV1SpatialFacts(input)
    expect(projectSpatialDiagnostic(input, result)).toEqual({
      pageNumber: 1, status: 'RESOLVED', nodeCount: 2, factCount: 1,
    })
    expect(JSON.stringify(result)).not.toMatch(/rawText|name|email|phone|company|school|fontName|message/i)
  })
})

describe('RP-094 canonical stability', () => {
  const pattern: readonly AnonymousBox[] = [
    { x: 20, y: 760, width: 20 }, { x: 80, y: 760, width: 30 },
    { x: 20, y: 700, width: 20 }, { x: 80, y: 700, width: 30 },
  ]

  it('canonicalizes symmetric pairs and fact order under VisualGroup permutation', () => {
    const forward = spatialFactInput(pattern)
    const permuted = spatialFactInput(pattern, { groupOrder: [3, 1, 0, 2] })
    const first = formV1SpatialFacts(forward)
    const second = formV1SpatialFacts(permuted)
    expect(spatialInputIssues(permuted)).toEqual([])
    expect(first).toEqual(second)
    const pairKeys = emitted(first).filter((fact) => fact.kind !== 'Y_ABOVE')
      .map((fact) => fact.nodeIds.join(':'))
    expect(new Set(pairKeys).size).toBe(pairKeys.length)
  })

  it.each([
    ['X_DISJOINT', [{ x: 20, y: 700, width: 10 }, { x: 60, y: 700, width: 10 }]],
    ['X_OVERLAP', [{ x: 20, y: 700, width: 30 }, { x: 40, y: 700, width: 30 }]],
    ['Y_ABOVE', [{ x: 20, y: 760, width: 20 }, { x: 20, y: 700, width: 20 }]],
    ['ZERO_FACT', [{ x: 20, y: 700, width: 10 }, { x: 30, y: 700, width: 10 }]],
  ] as const)('preserves %s topology under uniform coordinate scaling', (_name, boxes) => {
    const base = formV1SpatialFacts(spatialFactInput(boxes))
    const scaled = formV1SpatialFacts(spatialFactInput(boxes, { scale: 2 }))
    expect(emitted(scaled).map((fact) => ({
      kind: fact.kind, nodeIds: fact.nodeIds, witnessRunIds: fact.witnessRunIds,
      scope: { ...fact.scope, minY: fact.scope.minY / 2, maxY: fact.scope.maxY / 2 },
    }))).toEqual(emitted(base))
  })

  it.each([
    ['X_DISJOINT', [{ x: 20, y: 700, width: 10 }, { x: 60, y: 700, width: 10 }]],
    ['X_OVERLAP', [{ x: 20, y: 700, width: 30 }, { x: 40, y: 700, width: 30 }]],
    ['Y_ABOVE', [{ x: 20, y: 760, width: 20 }, { x: 20, y: 700, width: 20 }]],
    ['ZERO_FACT', [{ x: 20, y: 700, width: 10 }, { x: 30, y: 700, width: 10 }]],
  ] as const)('preserves %s topology under common translation', (_name, boxes) => {
    const base = formV1SpatialFacts(spatialFactInput(boxes))
    const shifted = formV1SpatialFacts(spatialFactInput(boxes, { shiftX: 7, shiftY: 15 }))
    expect(emitted(shifted).map((fact) => ({
      kind: fact.kind, nodeIds: fact.nodeIds, witnessRunIds: fact.witnessRunIds,
      scope: { ...fact.scope, minY: fact.scope.minY - 15, maxY: fact.scope.maxY - 15 },
    }))).toEqual(emitted(base))
  })

  it('does not mutate source evidence, groups, arrays, bounds, or inputs', () => {
    const boxes = [...pattern]
    const input = spatialFactInput(boxes)
    const snapshot = structuredClone({ boxes, input })
    Object.freeze(boxes)
    Object.freeze(input)
    Object.freeze(input.evidence)
    Object.freeze(input.visualGroups)
    if (input.visualGroups.status !== 'RESOLVED' || input.evidence.status !== 'AVAILABLE') {
      throw new Error('Invalid fixture')
    }
    Object.freeze(input.visualGroups.groups)
    Object.freeze(input.evidence.graph.runs)
    const first = formV1SpatialFacts(input)
    const second = formV1SpatialFacts(input)
    expect(first).toEqual(second)
    expect({ boxes, input }).toEqual(snapshot)
  })
})
