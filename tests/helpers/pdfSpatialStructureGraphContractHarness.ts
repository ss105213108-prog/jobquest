import { constructPageLayoutEvidence } from '../../src/parsers/pdfPageLayoutEvidence'
import type { AvailablePageLayoutEvidence, VisualGroupFormationResult } from '../../src/parsers/pdfVisualGroupResult'
import type {
  SpatialBounds, SpatialFact, SpatialFactKind, SpatialStructureInput, SpatialStructureResult,
} from '../../src/parsers/pdfSpatialStructureGraph'

export function makeSpatialEvidence(
  geometry: readonly { readonly x: number; readonly y: number; readonly width: number;
    readonly height?: number; readonly dir?: string }[],
  pageNumber = 1,
  scale = 1,
): AvailablePageLayoutEvidence {
  const evidence = constructPageLayoutEvidence({
    items: geometry.map((item) => ({
      str: 'XXXX', transform: [1, 0, 0, 1, item.x * scale, item.y * scale],
      width: item.width * scale, height: (item.height ?? 10) * scale,
      dir: item.dir ?? 'ltr', fontName: 'AnonymousFixture', hasEOL: false,
    })),
    pageBounds: { minX: 0, maxX: 600 * scale, width: 600 * scale, source: 'pdf-page-view' },
    pageNumber,
  })
  if (evidence.status !== 'AVAILABLE') throw new Error(`Anonymous spatial evidence was ${evidence.status}`)
  return evidence
}

export function singletonSpatialGroups(evidence: AvailablePageLayoutEvidence): VisualGroupFormationResult {
  return {
    status: 'RESOLVED', pageNumber: evidence.pageNumber,
    groups: evidence.graph.runs.map((run) => ({ groupId: `visual:${run.originalIndex}`, runIds: [run.originalIndex] })),
  }
}

export function groupIds(input: SpatialStructureInput): readonly string[] {
  return input.visualGroups.status === 'RESOLVED'
    ? input.visualGroups.groups.map((group) => group.groupId) : []
}

// Fixture construction derives node bounds from its declared upstream groups.
function fixtureGroupBounds(input: SpatialStructureInput, groupId: string): SpatialBounds | null {
  if (input.evidence.status !== 'AVAILABLE' || input.visualGroups.status !== 'RESOLVED') return null
  const group = input.visualGroups.groups.find((value) => value.groupId === groupId)
  if (!group) return null
  const runs = new Map(input.evidence.graph.runs.map((run) => [run.originalIndex, run]))
  const members = group.runIds.map((id) => runs.get(id))
  if (members.length === 0 || members.some((run) => !run || !run.geometryComparable
    || typeof run.endX !== 'number')) return null
  const safe = members as (NonNullable<typeof members[number]> & { endX: number })[]
  return {
    minX: Math.min(...safe.map((run) => run.x)), maxX: Math.max(...safe.map((run) => run.endX)),
    minY: Math.min(...safe.map((run) => run.y)), maxY: Math.max(...safe.map((run) => run.y + run.height)),
  }
}

export function declaredFact(
  input: SpatialStructureInput,
  kind: SpatialFactKind,
  nodeIds: readonly string[],
  minY: number,
  maxY: number,
): SpatialFact {
  if (input.visualGroups.status !== 'RESOLVED') throw new Error('Unresolved fixture')
  const groups = new Map(input.visualGroups.groups.map((group) => [group.groupId, group]))
  return {
    kind, nodeIds: [...nodeIds], scope: { pageNumber: input.visualGroups.pageNumber, minY, maxY },
    witnessRunIds: nodeIds.flatMap((id) => groups.get(id)?.runIds ?? []).sort(),
  }
}

export function resolvedSpatialResult(input: SpatialStructureInput, facts: readonly SpatialFact[] = []): SpatialStructureResult {
  if (input.visualGroups.status !== 'RESOLVED') throw new Error('Unresolved fixture')
  return {
    status: 'RESOLVED', pageNumber: input.visualGroups.pageNumber,
    graph: { nodes: input.visualGroups.groups.map((group) => {
      const bounds = fixtureGroupBounds(input, group.groupId)
      if (!bounds) throw new Error('Ungrounded fixture node')
      return { groupId: group.groupId, bounds }
    }), facts: [...facts] },
  }
}

export function insufficientSpatialResult(pageNumber: number): SpatialStructureResult {
  return { status: 'INSUFFICIENT_EVIDENCE', pageNumber, diagnostic: { code: 'NODE_GEOMETRY_UNAVAILABLE' } }
}

// Test-only normalized snapshot for permutation and coordinate-scale comparisons.
export function canonicalSpatialSemantics(input: SpatialStructureInput, result: SpatialStructureResult) {
  if (result.status !== 'RESOLVED' || input.evidence.status !== 'AVAILABLE') throw new Error('Unresolved fixture')
  const width = input.evidence.horizontalEvidence.pageGeometry.physical.width
  const sorted = <T extends string | number>(values: readonly T[]) => [...values].sort()
  return {
    nodes: sorted(result.graph.nodes.map((node) => node.groupId)),
    facts: result.graph.facts.map((fact) => {
      const ids = fact.kind === 'Y_ABOVE' ? fact.nodeIds
        : fact.kind === 'X_SPANS' ? [fact.nodeIds[0], ...sorted(fact.nodeIds.slice(1))] : sorted(fact.nodeIds)
      return JSON.stringify([fact.kind, ids, fact.scope.pageNumber,
        fact.scope.minY / width, fact.scope.maxY / width, sorted(fact.witnessRunIds)])
    }).sort(),
  }
}
