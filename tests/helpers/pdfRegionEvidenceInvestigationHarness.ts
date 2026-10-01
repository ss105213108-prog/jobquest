// Investigation-only canonicalization of already-approved structural evidence.
import { constructPageLayoutEvidence } from '../../src/parsers/pdfPageLayoutEvidence'
import {
  bindRegionResolutionInput,
  type RegionResolutionInput,
  type RegionResolutionResult,
} from '../../src/parsers/pdfRegionResolutionResult'
import { singletonVisualGroups, resolvedRegionResult } from './pdfRegionResolutionContractHarness'
import type { AnonymousRegionRun, RegionEvidencePair, RegionOwnershipIntent } from '../fixtures/pdfRegionEvidenceInvestigation'

export interface RegionInvestigationFixture {
  readonly input: RegionResolutionInput
  readonly result: RegionResolutionResult
  readonly intent: RegionOwnershipIntent
}

export function materializeRegionIntent(
  pair: RegionEvidencePair,
  intent: RegionOwnershipIntent,
  options: { readonly scale?: number; readonly permutation?: readonly number[] } = {},
): RegionInvestigationFixture {
  const scale = options.scale ?? 1
  const order = options.permutation ?? pair.runs.map((_, index) => index)
  if (order.length !== pair.runs.length || new Set(order).size !== order.length
    || order.some((index) => !Number.isInteger(index) || index < 0 || index >= pair.runs.length)) {
    throw new Error('Invalid fixture permutation')
  }
  const ordered = order.map((index) => pair.runs[index])
  const evidence = constructPageLayoutEvidence({
    items: ordered.map((run) => ({
      str: 'TOKEN000', transform: [1, 0, 0, 1, run.x * scale, run.y * scale],
      width: run.width * scale, height: run.height * scale,
      dir: 'ltr', fontName: 'AnonymousFixture', hasEOL: false,
    })),
    pageBounds: { minX: 0, maxX: 600 * scale, width: 600 * scale, source: 'pdf-page-view' },
    pageNumber: 1,
  })
  if (evidence.status !== 'AVAILABLE') throw new Error(`Anonymous evidence was ${evidence.status}`)
  const visualGroups = singletonVisualGroups(evidence)
  const input = bindRegionResolutionInput(evidence, visualGroups)
  const result = resolvedRegionResult(input, intent.regions.map((region) => ({
    groups: region.members.map((originalIndex) => {
      const currentIndex = order.indexOf(originalIndex)
      if (currentIndex < 0) throw new Error('Unknown fixture run')
      return `visual:${currentIndex}`
    }),
    ...(region.role ? { role: region.role } : {}),
  })))
  return { input, result, intent }
}

const sortObjects = <T>(values: readonly T[]): T[] => [...values].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))

export function canonicalRegionEvidenceSignature(fixture: RegionInvestigationFixture) {
  const { evidence, visualGroups } = fixture.input
  if (evidence.status !== 'AVAILABLE' || visualGroups.status !== 'RESOLVED') throw new Error('Unadmitted fixture')
  const { graph, horizontalEvidence: hle } = evidence
  const page = hle.pageGeometry.physical
  const runKey = new Map(graph.runs.map((run) => [run.originalIndex, JSON.stringify([
    (run.x - page.minX) / page.width, run.y / page.width,
    run.width / page.width, run.height / page.width, run.geometryComparable,
  ])]))
  const runKeys = (ids: readonly number[]) => ids.map((id) => runKey.get(id)).sort()
  const candidateKey = new Map(graph.candidates.map((candidate) => [candidate.id, JSON.stringify([
    runKeys(candidate.runIds), candidate.geometryStatus,
  ])]))
  const intervalRun = new Map(hle.runIntervals.map((interval) => [interval.intervalId, runKey.get(interval.runId)]))
  const occupied = hle.pageGeometry.occupied
  return {
    pageOccupied: occupied && [
      (occupied.startX - page.minX) / page.width,
      (occupied.endX - page.minX) / page.width,
    ],
    runs: [...runKey.values()].sort(),
    groups: sortObjects(visualGroups.groups.map((group) => runKeys(group.runIds))),
    candidates: sortObjects(graph.candidates.map((candidate) => [runKeys(candidate.runIds), candidate.geometryStatus])),
    relations: sortObjects(graph.relations.map((relation) => ({
      endpoints: runKeys([relation.leftRunId, relation.rightRunId]), state: relation.state,
      baselineDifference: relation.evidence.baselineDifference === null ? null : relation.evidence.baselineDifference / page.width,
      heightRatio: relation.evidence.heightRatio,
      verticalOverlapRatio: relation.evidence.verticalOverlapRatio,
      geometryComparable: relation.evidence.geometryComparable,
    }))),
    intervals: sortObjects(hle.runIntervals.map((interval) => ({
      run: runKey.get(interval.runId),
      x: [interval.pageNormalized.start, interval.pageNormalized.end],
      glyphAdvance: interval.estimatedGlyphAdvance === null ? null : interval.estimatedGlyphAdvance / page.width,
    }))),
    slices: sortObjects(hle.slices.map((slice) => ({
      source: candidateKey.get(slice.sourceCandidateId),
      members: runKeys(slice.runIds),
      horizontalOrder: slice.orderedIntervalIds.map((id) => intervalRun.get(id)),
    }))),
    gaps: sortObjects(hle.sliceGaps.map((gap) => ({
      slice: candidateKey.get(gap.sliceId), endpoints: runKeys([gap.leftRunId, gap.rightRunId]),
      pageGap: gap.pageNormalizedGap, glyphGap: gap.leftGlyphNormalizedGap,
    }))),
    segments: sortObjects(hle.segments.map((segment) => ({
      x: [segment.pageNormalized.start, segment.pageNormalized.end],
      occupied: runKeys(segment.occupiedByRunIds),
      occupiedSlices: segment.occupiedInSliceIds.map((id) => candidateKey.get(id)).sort(),
      emptySlices: segment.emptyInSliceIds.map((id) => candidateKey.get(id)).sort(),
    }))),
    availability: {
      safeRunState: hle.availability.safeRunState,
      verticalContext: hle.availability.verticalContext,
      excludedUnsafeRuns: runKeys(hle.availability.excludedUnsafeRunIds),
    },
  }
}

export function canonicalRegionOwnershipSignature(fixture: RegionInvestigationFixture) {
  const { evidence, visualGroups } = fixture.input
  if (evidence.status !== 'AVAILABLE' || visualGroups.status !== 'RESOLVED' || fixture.result.status !== 'RESOLVED') {
    throw new Error('Unresolved fixture')
  }
  const page = evidence.horizontalEvidence.pageGeometry.physical
  const runs = new Map(evidence.graph.runs.map((run) => [run.originalIndex, JSON.stringify([
    (run.x - page.minX) / page.width, run.y / page.width,
    run.width / page.width, run.height / page.width,
  ])]))
  const groups = new Map(visualGroups.groups.map((group) => [group.groupId, group.runIds.map((id) => runs.get(id)).sort()]))
  return sortObjects(fixture.result.graph.regions.map((region) => ({
    members: sortObjects(region.groupIds.map((id) => groups.get(id))),
    role: region.role ?? null,
  })))
}

export function withJitter(runs: readonly AnonymousRegionRun[]): readonly AnonymousRegionRun[] {
  return runs.map((run, index) => index === 1 ? { ...run, x: run.x + 1 / 1024 } : run)
}
