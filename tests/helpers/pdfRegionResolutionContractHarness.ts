// RP-087 fixtures only. Admission and result policy live in production.
import { observeHorizontalLayout } from '../../src/parsers/pdfHorizontalLayoutEvidence'
import type { RowEvidenceGraph } from '../../src/parsers/pdfRowEvidenceGraph'
import { normalizeTextRunGeometry } from '../../src/parsers/pdfTextGeometry'
import type { AvailablePageLayoutEvidence, VisualGroupFormationResult } from '../../src/parsers/pdfVisualGroupResult'
import type {
  Region,
  RegionResolutionInput,
  RegionResolutionResult,
} from '../../src/parsers/pdfRegionResolutionResult'

export function makeRegionEvidence(
  geometry: readonly { readonly x: number; readonly y: number; readonly width: number; readonly height?: number }[],
  pageNumber = 1,
  scale = 1,
): AvailablePageLayoutEvidence {
  const pageBounds = { minX: 0, maxX: 600 * scale, width: 600 * scale, source: 'pdf-page-view' as const }
  const runs = geometry.map((item, index) => normalizeTextRunGeometry({
    str: 'anonymous', transform: [1, 0, 0, 1, item.x * scale, item.y * scale],
    width: item.width * scale, height: (item.height ?? 10) * scale,
    dir: 'ltr', fontName: 'AnonymousFixture', hasEOL: false,
  }, index))
  const graph: RowEvidenceGraph = {
    runs,
    candidates: runs.map((run) => ({ id: `candidate:${run.originalIndex}`, runIds: [run.originalIndex], geometryStatus: 'comparable' })),
    relations: [],
  }
  const hle = observeHorizontalLayout({ graph, pageBounds })
  if (!hle.ok) throw new Error(`Invalid anonymous Region fixture: ${hle.code}`)
  return { status: 'AVAILABLE', pageNumber, graph, horizontalEvidence: hle.value }
}

export function singletonVisualGroups(evidence: AvailablePageLayoutEvidence): VisualGroupFormationResult {
  return {
    status: 'RESOLVED', pageNumber: evidence.pageNumber,
    groups: evidence.graph.runs.map((run) => ({ groupId: `visual:${run.originalIndex}`, runIds: [run.originalIndex] })),
  }
}

const fixtureRegionId = (pageNumber: number, groupIds: readonly string[]) => (
  `region:${pageNumber}:${JSON.stringify([...groupIds].sort())}`
)

export function makeRegionNode(
  input: RegionResolutionInput,
  groupIds: readonly string[],
  role?: Region['role'],
): Region {
  if (input.evidence.status !== 'AVAILABLE' || input.visualGroups.status !== 'RESOLVED') throw new Error('Invalid fixture input')
  const groups = new Map(input.visualGroups.groups.map((group) => [group.groupId, group]))
  const runs = new Map(input.evidence.graph.runs.map((run) => [run.originalIndex, run]))
  const members = groupIds.flatMap((id) => groups.get(id)?.runIds ?? []).map((id) => runs.get(id))
  if (members.length === 0 || members.some((run) => !run || run.endX === null)) throw new Error('Invalid fixture members')
  const safe = members as (NonNullable<typeof members[number]> & { endX: number })[]
  return {
    regionId: fixtureRegionId(input.evidence.pageNumber, groupIds), pageNumber: input.evidence.pageNumber,
    groupIds: [...groupIds],
    bounds: {
      minX: Math.min(...safe.map((run) => run.x)), maxX: Math.max(...safe.map((run) => run.endX)),
      minY: Math.min(...safe.map((run) => run.y)), maxY: Math.max(...safe.map((run) => run.y + run.height)),
    },
    ...(role ? { role } : {}),
  }
}

export function resolvedRegionResult(
  input: RegionResolutionInput,
  memberships: readonly { readonly groups: readonly string[]; readonly role?: Region['role'] }[],
): RegionResolutionResult {
  return { status: 'RESOLVED', pageNumber: input.visualGroups.pageNumber,
    graph: { regions: memberships.map((membership) => makeRegionNode(input, membership.groups, membership.role)) } }
}

export function insufficientRegionResult(pageNumber: number): RegionResolutionResult {
  return { status: 'INSUFFICIENT_EVIDENCE', pageNumber,
    diagnostic: { code: 'SPATIAL_STRUCTURE_UNRESOLVED' } }
}
