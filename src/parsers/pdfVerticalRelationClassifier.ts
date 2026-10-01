import {
  baselineDifference,
  heightRatio,
  verticalOverlapRatio,
  type GeometryRun,
} from './pdfTextGeometry'
import type { RowEvidenceCandidate, RunId, VerticalEvidence } from './pdfRowEvidenceGraph'
import type {
  PolicyResult,
  VerticalPairDecision,
  VerticalRelationClassifier,
} from './pdfRowEvidenceGraphBuilder'
import {
  observeNormalizedVerticalPair,
  type VerticalCalibrationSnapshot,
  type VerticalRunCalibrationEvidence,
} from './pdfVerticalCalibration'

export type VerticalRelationClassifierFailureCode =
  | 'DUPLICATE_CANONICAL_RUN_ID'
  | 'UNSAFE_CLASSIFIER_INPUT'
  | 'CALIBRATION_RUN_SET_MISMATCH'
  | 'DUPLICATE_CALIBRATION_RUN_EVIDENCE'
  | 'INVALID_CALIBRATION_SNAPSHOT'
  | 'UNKNOWN_CANDIDATE_RUN_ID'
  | 'RUN_WITHOUT_PRIMARY_CANDIDATE'
  | 'RUN_WITH_MULTIPLE_PRIMARY_CANDIDATES'

const failure = (
  code: VerticalRelationClassifierFailureCode,
): PolicyResult<readonly VerticalPairDecision[]> => ({ ok: false, code })

const hasUsableCalibrationEvidence = (
  evidence: VerticalRunCalibrationEvidence | undefined,
): boolean => evidence?.heightToRepresentativeRatio !== null
  && Number.isFinite(evidence?.heightToRepresentativeRatio)
  && (evidence?.heightToRepresentativeRatio ?? 0) > 0

const observeVerticalEvidence = (left: GeometryRun, right: GeometryRun): VerticalEvidence => ({
  baselineDifference: baselineDifference(left, right),
  heightRatio: heightRatio(left, right),
  verticalOverlapRatio: verticalOverlapRatio(left, right),
  geometryComparable: left.geometryComparable && right.geometryComparable,
})

const validateCandidateOwnership = (
  runs: readonly GeometryRun[],
  candidates: readonly RowEvidenceCandidate[],
): VerticalRelationClassifierFailureCode | null => {
  const knownRunIds = new Set(runs.map((run) => run.originalIndex))
  const ownerCounts = new Map<RunId, number>()
  for (const candidate of candidates) {
    for (const runId of new Set(candidate.runIds)) {
      if (!knownRunIds.has(runId)) return 'UNKNOWN_CANDIDATE_RUN_ID'
      ownerCounts.set(runId, (ownerCounts.get(runId) ?? 0) + 1)
    }
  }
  if (runs.some((run) => !ownerCounts.has(run.originalIndex))) return 'RUN_WITHOUT_PRIMARY_CANDIDATE'
  if (runs.some((run) => (ownerCounts.get(run.originalIndex) ?? 0) > 1)) {
    return 'RUN_WITH_MULTIPLE_PRIMARY_CANDIDATES'
  }
  return null
}

export const classifyVerticalRelations: VerticalRelationClassifier<VerticalCalibrationSnapshot> = ({
  runs: inputRuns,
  candidates,
  calibration,
}) => {
  const runIds = inputRuns.map((run) => run.originalIndex)
  if (new Set(runIds).size !== runIds.length) return failure('DUPLICATE_CANONICAL_RUN_ID')
  if (inputRuns.some((run) => !run.geometryComparable)) return failure('UNSAFE_CLASSIFIER_INPUT')

  if (calibration.schemaVersion !== 1
    || calibration.scope !== 'page'
    || !Number.isFinite(calibration.normalization.representativeHeight)
    || calibration.normalization.representativeHeight <= 0) {
    return failure('INVALID_CALIBRATION_SNAPSHOT')
  }

  const calibrationRunIds = calibration.runs.map((evidence) => evidence.runId)
  if (new Set(calibrationRunIds).size !== calibrationRunIds.length) {
    return failure('DUPLICATE_CALIBRATION_RUN_EVIDENCE')
  }
  const expectedRunIds = [...runIds].sort((left, right) => left - right)
  const actualRunIds = [...calibrationRunIds].sort((left, right) => left - right)
  if (expectedRunIds.length !== actualRunIds.length
    || expectedRunIds.some((runId, index) => runId !== actualRunIds[index])) {
    return failure('CALIBRATION_RUN_SET_MISMATCH')
  }

  const ownershipFailure = validateCandidateOwnership(inputRuns, candidates)
  if (ownershipFailure) return failure(ownershipFailure)

  const calibrationByRunId = new Map(calibration.runs.map((evidence) => [evidence.runId, evidence]))
  const runs = [...inputRuns].sort((left, right) => left.originalIndex - right.originalIndex)
  const decisions: VerticalPairDecision[] = []

  for (let leftIndex = 0; leftIndex < runs.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < runs.length; rightIndex += 1) {
      const left = runs[leftIndex]
      const right = runs[rightIndex]
      const evidence = observeVerticalEvidence(left, right)
      const normalized = observeNormalizedVerticalPair(left, right, calibration)
      const evidenceUsable = hasUsableCalibrationEvidence(calibrationByRunId.get(left.originalIndex))
        && hasUsableCalibrationEvidence(calibrationByRunId.get(right.originalIndex))
        && normalized.baselineDifferenceToRepresentativeHeight !== null
        && normalized.verticalOverlapRatio !== null

      if (!evidenceUsable) {
        decisions.push({
          outcome: 'MISSING',
          leftRunId: left.originalIndex,
          rightRunId: right.originalIndex,
          reason: 'UNUSABLE_VERTICAL_EVIDENCE',
        })
      } else if (normalized.baselineDifferenceToRepresentativeHeight === 0) {
        decisions.push({
          outcome: 'RELATION',
          leftRunId: left.originalIndex,
          rightRunId: right.originalIndex,
          state: 'SUPPORTED',
          evidence,
        })
      } else if (normalized.verticalOverlapRatio > 0) {
        decisions.push({
          outcome: 'RELATION',
          leftRunId: left.originalIndex,
          rightRunId: right.originalIndex,
          state: 'DEFERRED',
          evidence,
        })
      } else if (normalized.verticalOverlapRatio === 0) {
        decisions.push({
          outcome: 'MISSING',
          leftRunId: left.originalIndex,
          rightRunId: right.originalIndex,
          reason: 'NO_VERTICAL_OVERLAP',
        })
      } else {
        decisions.push({
          outcome: 'MISSING',
          leftRunId: left.originalIndex,
          rightRunId: right.originalIndex,
          reason: 'UNUSABLE_VERTICAL_EVIDENCE',
        })
      }
    }
  }

  return { ok: true, value: decisions }
}

