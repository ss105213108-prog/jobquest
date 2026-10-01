import {
  constructPageLayoutEvidence,
  type InternalPageLayoutEvidenceResult,
} from '../../src/parsers/pdfPageLayoutEvidence'
import type {
  RowEvidenceGraph,
  RunId,
  VerticalRelationState,
} from '../../src/parsers/pdfRowEvidenceGraph'
import type { VisualGroupGroundTruthFixture } from '../fixtures/pdfVisualGroupGroundTruth'

export type GroundTruthValidationIssueCode =
  | 'DUPLICATE_FIXTURE_RUN_KEY'
  | 'UNKNOWN_RUN_KEY'
  | 'DUPLICATE_GROUP_MEMBERSHIP'
  | 'MISSING_GROUP_MEMBERSHIP'
  | 'UNSAFE_RUN_NOT_SINGLETON'
  | 'DIRECT_PAIR_PERMISSION_REQUIRED'

export interface GroundTruthValidationIssue {
  readonly code: GroundTruthValidationIssueCode
  readonly runKeys?: readonly string[]
}

export interface MaterializedVisualGroupGroundTruth {
  readonly fixture: VisualGroupGroundTruthFixture
  readonly result: Extract<InternalPageLayoutEvidenceResult, { status: 'AVAILABLE' }>
  readonly runIdByKey: ReadonlyMap<string, RunId>
  readonly runKeyById: ReadonlyMap<RunId, string>
  readonly expectedGroups: readonly (readonly string[])[]
}

const canonicalGroup = (group: readonly string[]) => [...group].sort()

export const canonicalExpectedGroups = (
  groups: readonly (readonly string[])[],
): readonly (readonly string[])[] => groups
  .map(canonicalGroup)
  .sort((left, right) => (left[0] ?? '').localeCompare(right[0] ?? '')
    || left.join('|').localeCompare(right.join('|')))

export function materializeVisualGroupGroundTruth(
  fixture: VisualGroupGroundTruthFixture,
): MaterializedVisualGroupGroundTruth {
  const result = constructPageLayoutEvidence({
    items: fixture.runs.map((candidate) => candidate.item),
    pageBounds: fixture.pageBounds,
    pageNumber: 1,
  })
  if (result.status !== 'AVAILABLE') {
    throw new Error(`${fixture.id} expected AVAILABLE evidence, received ${result.status}`)
  }
  const runIdByKey = new Map<string, RunId>()
  const runKeyById = new Map<RunId, string>()
  fixture.runs.forEach(({ key }, index) => {
    if (!runIdByKey.has(key)) runIdByKey.set(key, index)
    runKeyById.set(index, key)
  })
  return {
    fixture,
    result,
    runIdByKey,
    runKeyById,
    expectedGroups: canonicalExpectedGroups(fixture.expectedGroups),
  }
}

const pairKey = (left: RunId, right: RunId) => (
  left < right ? `${left}:${right}` : `${right}:${left}`
)

const permissionByPair = (
  graph: RowEvidenceGraph,
): ReadonlyMap<string, VerticalRelationState> => new Map(graph.relations.map((relation) => [
  pairKey(relation.leftRunId, relation.rightRunId),
  relation.state,
]))

export function validateVisualGroupGroundTruth(input: {
  readonly graph: RowEvidenceGraph
  readonly fixtureRuns: readonly { readonly key: string }[]
  readonly expectedGroups: readonly (readonly string[])[]
}): { readonly valid: boolean; readonly issues: readonly GroundTruthValidationIssue[] } {
  const issues: GroundTruthValidationIssue[] = []
  const firstRunIdByKey = new Map<string, RunId>()
  const duplicateKeys = new Set<string>()
  input.fixtureRuns.forEach(({ key }, index) => {
    if (firstRunIdByKey.has(key)) duplicateKeys.add(key)
    else firstRunIdByKey.set(key, index)
  })
  for (const key of [...duplicateKeys].sort()) {
    issues.push({ code: 'DUPLICATE_FIXTURE_RUN_KEY', runKeys: [key] })
  }

  const membershipCount = new Map<string, number>()
  for (const group of input.expectedGroups) {
    for (const key of group) {
      if (!firstRunIdByKey.has(key)) {
        issues.push({ code: 'UNKNOWN_RUN_KEY', runKeys: [key] })
        continue
      }
      membershipCount.set(key, (membershipCount.get(key) ?? 0) + 1)
    }
  }
  for (const key of [...firstRunIdByKey.keys()].sort()) {
    const count = membershipCount.get(key) ?? 0
    if (count === 0) issues.push({ code: 'MISSING_GROUP_MEMBERSHIP', runKeys: [key] })
    if (count > 1) issues.push({ code: 'DUPLICATE_GROUP_MEMBERSHIP', runKeys: [key] })
  }

  const graphRunById = new Map(input.graph.runs.map((run) => [run.originalIndex, run]))
  const pairPermissions = permissionByPair(input.graph)
  for (const group of input.expectedGroups) {
    const knownKeys = group.filter((key) => firstRunIdByKey.has(key))
    const runIds = knownKeys.map((key) => firstRunIdByKey.get(key) as RunId)
    if (runIds.length > 1 && runIds.some((runId) => graphRunById.get(runId)?.geometryComparable === false)) {
      issues.push({ code: 'UNSAFE_RUN_NOT_SINGLETON', runKeys: canonicalGroup(knownKeys) })
    }
    for (let leftIndex = 0; leftIndex < runIds.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < runIds.length; rightIndex += 1) {
        const permission = pairPermissions.get(pairKey(runIds[leftIndex], runIds[rightIndex]))
        if (permission !== 'SUPPORTED' && permission !== 'DEFERRED') {
          issues.push({
            code: 'DIRECT_PAIR_PERMISSION_REQUIRED',
            runKeys: canonicalGroup([knownKeys[leftIndex], knownKeys[rightIndex]]),
          })
        }
      }
    }
  }

  const unique = new Map<string, GroundTruthValidationIssue>()
  for (const issue of issues) {
    const key = `${issue.code}|${issue.runKeys?.join('|') ?? ''}`
    unique.set(key, issue)
  }
  const normalized = [...unique.values()].sort((left, right) => (
    `${left.code}|${left.runKeys?.join('|') ?? ''}`
      .localeCompare(`${right.code}|${right.runKeys?.join('|') ?? ''}`)
  ))
  return { valid: normalized.length === 0, issues: normalized }
}

export function validateMaterializedGroundTruth(
  materialized: MaterializedVisualGroupGroundTruth,
) {
  return validateVisualGroupGroundTruth({
    graph: materialized.result.graph,
    fixtureRuns: materialized.fixture.runs,
    expectedGroups: materialized.expectedGroups,
  })
}

const rounded = (value: number | null): number | null => (
  value === null ? null : Math.round(value * 1e9) / 1e9
)

/**
 * Privacy-safe, identity-independent observation signature for corpus validation.
 * It describes existing evidence only and contains no grouping inference.
 */
export function canonicalVisualGroupEvidenceSignature(
  materialized: MaterializedVisualGroupGroundTruth,
) {
  const { graph } = materialized.result
  const hle = materialized.result.horizontalEvidence
  const page = hle.pageGeometry.physical
  const heights = graph.runs
    .filter((run) => Number.isFinite(run.height) && run.height > 0)
    .map((run) => run.height)
    .sort((left, right) => left - right)
  const heightUnit = heights[Math.floor(heights.length / 2)] ?? 1
  const topBaseline = Math.max(...graph.runs.map((run) => run.baseline))
  const runs = [...graph.runs].sort((left, right) => (
    right.baseline - left.baseline
    || left.x - right.x
    || left.width - right.width
    || left.height - right.height
  ))
  const canonicalRunId = new Map(runs.map((run, index) => [run.originalIndex, `R${index + 1}`]))
  const runFacts = runs.map((run) => ({
    id: canonicalRunId.get(run.originalIndex),
    pageX: rounded((run.x - page.minX) / page.width),
    baselineFromTop: rounded((topBaseline - run.baseline) / heightUnit),
    pageWidth: rounded(run.width / page.width),
    heightRatio: rounded(run.height / heightUnit),
    geometryComparable: run.geometryComparable,
  }))
  const candidates = graph.candidates.map((candidate) => ({
    members: candidate.runIds.map((runId) => canonicalRunId.get(runId) as string).sort(),
    geometryStatus: candidate.geometryStatus,
  })).sort((left, right) => left.members.join('|').localeCompare(right.members.join('|')))
  const canonicalCandidateId = new Map(candidates.map((candidate, index) => [
    candidate.members.join('|'),
    `C${index + 1}`,
  ]))
  const sliceIdByProductionCandidate = new Map(graph.candidates.map((candidate) => [
    candidate.id,
    canonicalCandidateId.get(
      candidate.runIds.map((runId) => canonicalRunId.get(runId) as string).sort().join('|'),
    ) as string,
  ]))
  const relations = graph.relations.map((relation) => ({
    endpoints: [
      canonicalRunId.get(relation.leftRunId) as string,
      canonicalRunId.get(relation.rightRunId) as string,
    ].sort(),
    state: relation.state,
    baselineDifference: rounded(relation.evidence.baselineDifference === null
      ? null
      : relation.evidence.baselineDifference / heightUnit),
    heightRatio: rounded(relation.evidence.heightRatio),
    verticalOverlapRatio: rounded(relation.evidence.verticalOverlapRatio),
    geometryComparable: relation.evidence.geometryComparable,
  })).sort((left, right) => left.endpoints.join('|').localeCompare(right.endpoints.join('|')))
  const intervals = hle.runIntervals.map((interval) => ({
    runId: canonicalRunId.get(interval.runId),
    sliceId: sliceIdByProductionCandidate.get(interval.sliceId),
    start: rounded(interval.pageNormalized.start),
    end: rounded(interval.pageNormalized.end),
    width: rounded(interval.pageNormalized.width),
    glyphAdvance: rounded(interval.estimatedGlyphAdvance === null
      ? null
      : interval.estimatedGlyphAdvance / page.width),
  })).sort((left, right) => String(left.runId).localeCompare(String(right.runId)))
  const runIdByIntervalId = new Map(hle.runIntervals.map((interval) => [
    interval.intervalId,
    canonicalRunId.get(interval.runId) as string,
  ]))
  const slices = hle.slices.map((slice) => ({
    sliceId: sliceIdByProductionCandidate.get(slice.sliceId),
    sourceCandidateId: sliceIdByProductionCandidate.get(slice.sourceCandidateId),
    runIds: slice.runIds
      .map((runId) => canonicalRunId.get(runId) as string)
      .sort(),
    orderedIntervalRunIds: slice.orderedIntervalIds
      .map((intervalId) => runIdByIntervalId.get(intervalId) as string),
  })).sort((left, right) => String(left.sliceId).localeCompare(String(right.sliceId)))
  const gaps = hle.sliceGaps.map((gap) => ({
    sliceId: sliceIdByProductionCandidate.get(gap.sliceId),
    endpoints: [
      canonicalRunId.get(gap.leftRunId) as string,
      canonicalRunId.get(gap.rightRunId) as string,
    ].sort(),
    pageGap: rounded(gap.pageNormalizedGap),
    glyphGap: rounded(gap.leftGlyphNormalizedGap),
  })).sort((left, right) => left.endpoints.join('|').localeCompare(right.endpoints.join('|')))
  const segments = hle.segments.map((segment) => ({
    start: rounded(segment.pageNormalized.start),
    end: rounded(segment.pageNormalized.end),
    occupiedRuns: segment.occupiedByRunIds
      .map((runId) => canonicalRunId.get(runId) as string)
      .sort(),
    occupiedSlices: segment.occupiedInSliceIds
      .map((sliceId) => sliceIdByProductionCandidate.get(sliceId) as string)
      .sort(),
    emptySlices: segment.emptyInSliceIds
      .map((sliceId) => sliceIdByProductionCandidate.get(sliceId) as string)
      .sort(),
  })).sort((left, right) => (
    (left.start ?? 0) - (right.start ?? 0) || (left.end ?? 0) - (right.end ?? 0)
  ))
  const occupied = hle.pageGeometry.occupied

  return {
    runs: runFacts,
    candidates,
    relations,
    pageOccupied: occupied === null ? null : {
      start: rounded((occupied.startX - page.minX) / page.width),
      end: rounded((occupied.endX - page.minX) / page.width),
      width: rounded(occupied.width / page.width),
    },
    intervals,
    slices,
    gaps,
    segments,
    availability: {
      safeRunState: hle.availability.safeRunState,
      verticalContext: hle.availability.verticalContext,
      physicalPageNormalization: hle.availability.physicalPageNormalization,
      excludedUnsafeRunIds: hle.availability.excludedUnsafeRunIds
        .map((runId) => canonicalRunId.get(runId) as string)
        .sort(),
    },
  }
}
