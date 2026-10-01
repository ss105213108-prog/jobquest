import {
  spatialInputIssues,
  spatialResultIssues,
  type SpatialBounds,
  type SpatialFact,
  type SpatialNode,
  type SpatialStructureInput,
  type SpatialStructureResult,
} from './pdfSpatialStructureGraph'
import type { GeometryRun } from './pdfTextGeometry'

const finite = (value: number | null): value is number => value !== null && Number.isFinite(value)

const compareRunIds = (left: readonly number[], right: readonly number[]) => {
  for (let index = 0; index < Math.min(left.length, right.length); index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index]
  }
  return left.length - right.length
}

function groupBounds(runs: readonly GeometryRun[]): SpatialBounds | null {
  if (runs.length === 0 || runs.some((run) => !run.geometryComparable
    || !Number.isFinite(run.x) || !Number.isFinite(run.y)
    || !Number.isFinite(run.height) || run.height <= 0 || !finite(run.endX))) return null
  return {
    minX: Math.min(...runs.map((run) => run.x)),
    maxX: Math.max(...runs.map((run) => run.endX as number)),
    minY: Math.min(...runs.map((run) => run.y)),
    maxY: Math.max(...runs.map((run) => run.y + run.height)),
  }
}

export function formSpatialFactsV1(input: SpatialStructureInput): SpatialStructureResult {
  if (spatialInputIssues(input).length > 0) throw new Error('Spatial input was not admitted')
  if (input.evidence.status !== 'AVAILABLE' || input.visualGroups.status !== 'RESOLVED') {
    throw new Error('Spatial input was not admitted')
  }

  const pageNumber = input.evidence.pageNumber
  const failed = (): SpatialStructureResult => ({ status: 'FAILED', pageNumber, code: 'INTERNAL_CONSISTENCY_FAILURE' })
  const runsById = new Map(input.evidence.graph.runs.map((run) => [run.originalIndex, run]))
  const membersByGroup = new Map(input.visualGroups.groups.map((group) => [
    group.groupId, [...group.runIds].sort((a, b) => a - b),
  ]))
  const nodes: SpatialNode[] = []

  for (const group of input.visualGroups.groups) {
    const members = group.runIds.map((id) => runsById.get(id))
    if (members.some((run) => run === undefined)) return failed()
    const bounds = groupBounds(members as GeometryRun[])
    if (!bounds) {
      const insufficient: SpatialStructureResult = {
        status: 'INSUFFICIENT_EVIDENCE', pageNumber,
        diagnostic: { code: 'NODE_GEOMETRY_UNAVAILABLE' },
      }
      return spatialResultIssues(input, insufficient).length === 0 ? insufficient : failed()
    }
    nodes.push({ groupId: group.groupId, bounds })
  }

  const runIds = (node: SpatialNode) => membersByGroup.get(node.groupId) ?? []
  nodes.sort((a, b) => compareRunIds(runIds(a), runIds(b)))
  const facts: SpatialFact[] = []
  const add = (kind: SpatialFact['kind'], endpoints: readonly SpatialNode[], minY: number, maxY: number) => {
    facts.push({
      kind, nodeIds: endpoints.map((node) => node.groupId),
      scope: { pageNumber, minY, maxY },
      witnessRunIds: endpoints.flatMap(runIds).sort((a, b) => a - b),
    })
  }

  for (let left = 0; left < nodes.length; left += 1) {
    for (let right = left + 1; right < nodes.length; right += 1) {
      const a = nodes[left]
      const b = nodes[right]
      const sharedMinY = Math.max(a.bounds.minY, b.bounds.minY)
      const sharedMaxY = Math.min(a.bounds.maxY, b.bounds.maxY)
      if (sharedMinY < sharedMaxY) {
        if (a.bounds.maxX < b.bounds.minX || b.bounds.maxX < a.bounds.minX) {
          add('X_DISJOINT', [a, b], sharedMinY, sharedMaxY)
        } else if (Math.min(a.bounds.maxX, b.bounds.maxX) > Math.max(a.bounds.minX, b.bounds.minX)) {
          add('X_OVERLAP', [a, b], sharedMinY, sharedMaxY)
        }
      }
      if (a.bounds.minY > b.bounds.maxY) add('Y_ABOVE', [a, b], b.bounds.minY, a.bounds.maxY)
      else if (b.bounds.minY > a.bounds.maxY) add('Y_ABOVE', [b, a], a.bounds.minY, b.bounds.maxY)
    }
  }

  const result: SpatialStructureResult = { status: 'RESOLVED', pageNumber, graph: { nodes, facts } }
  return spatialResultIssues(input, result).length === 0 ? result : failed()
}
