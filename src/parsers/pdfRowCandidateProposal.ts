import type { GeometryRun } from './pdfTextGeometry'
import type { RunId } from './pdfRowEvidenceGraph'
import type {
  PolicyResult,
  RowCandidateProposal,
  RowCandidateProposalPolicy,
} from './pdfRowEvidenceGraphBuilder'
import {
  observeNormalizedVerticalPair,
  type VerticalCalibrationSnapshot,
  type VerticalRunCalibrationEvidence,
} from './pdfVerticalCalibration'

export type RowCandidateProposalFailureCode =
  | 'UNSAFE_CANDIDATE_INPUT'
  | 'DUPLICATE_CANONICAL_RUN_ID'
  | 'CALIBRATION_RUN_SET_MISMATCH'
  | 'DUPLICATE_CALIBRATION_RUN_EVIDENCE'
  | 'INVALID_CALIBRATION_SNAPSHOT'

const failure = (code: RowCandidateProposalFailureCode): PolicyResult<readonly RowCandidateProposal[]> => ({
  ok: false,
  code,
})

const proposalCompare = (left: RowCandidateProposal, right: RowCandidateProposal): number => {
  const sharedLength = Math.min(left.runIds.length, right.runIds.length)
  for (let index = 0; index < sharedLength; index += 1) {
    const difference = left.runIds[index] - right.runIds[index]
    if (difference !== 0) return difference
  }
  return left.runIds.length - right.runIds.length
}

const isUsableEvidence = (evidence: VerticalRunCalibrationEvidence): boolean => (
  evidence.heightToRepresentativeRatio !== null
)

const hasValidEvidenceShape = (evidence: VerticalRunCalibrationEvidence): boolean => (
  evidence.heightToRepresentativeRatio === null
  || (Number.isFinite(evidence.heightToRepresentativeRatio) && evidence.heightToRepresentativeRatio > 0)
)

export const proposeRowCandidates: RowCandidateProposalPolicy<VerticalCalibrationSnapshot> = (
  inputRuns,
  calibration,
) => {
  const runIds = inputRuns.map((run) => run.originalIndex)
  const seenRunIds = new Set<RunId>()
  for (const runId of runIds) {
    if (seenRunIds.has(runId)) return failure('DUPLICATE_CANONICAL_RUN_ID')
    seenRunIds.add(runId)
  }

  if (inputRuns.some((run) => !run.geometryComparable || !Number.isFinite(run.baseline))) {
    return failure('UNSAFE_CANDIDATE_INPUT')
  }

  if (calibration.schemaVersion !== 1
    || calibration.scope !== 'page'
    || !Number.isFinite(calibration.normalization.representativeHeight)
    || calibration.normalization.representativeHeight <= 0
    || calibration.runs.some((evidence) => !hasValidEvidenceShape(evidence))) {
    return failure('INVALID_CALIBRATION_SNAPSHOT')
  }

  const evidenceIds = calibration.runs.map((evidence) => evidence.runId)
  const seenEvidenceIds = new Set<RunId>()
  for (const runId of evidenceIds) {
    if (seenEvidenceIds.has(runId)) return failure('DUPLICATE_CALIBRATION_RUN_EVIDENCE')
    seenEvidenceIds.add(runId)
  }

  const expectedIds = [...runIds].sort((left, right) => left - right)
  const actualIds = [...evidenceIds].sort((left, right) => left - right)
  if (expectedIds.length !== actualIds.length
    || expectedIds.some((runId, index) => runId !== actualIds[index])) {
    return failure('CALIBRATION_RUN_SET_MISMATCH')
  }

  const evidenceByRunId = new Map(calibration.runs.map((evidence) => [evidence.runId, evidence]))
  const exactBaselineGroups: Array<{ anchor: GeometryRun; runIds: RunId[] }> = []
  const proposals: RowCandidateProposal[] = []
  const canonicalRuns = [...inputRuns].sort((left, right) => left.originalIndex - right.originalIndex)

  for (const run of canonicalRuns) {
    const evidence = evidenceByRunId.get(run.originalIndex)
    if (!evidence || !isUsableEvidence(evidence)) {
      proposals.push({ runIds: Object.freeze([run.originalIndex]) })
      continue
    }

    const group = exactBaselineGroups.find(({ anchor }) => (
      observeNormalizedVerticalPair(anchor, run, calibration).baselineDifferenceToRepresentativeHeight === 0
    ))
    if (group) group.runIds.push(run.originalIndex)
    else exactBaselineGroups.push({ anchor: run, runIds: [run.originalIndex] })
  }

  for (const group of exactBaselineGroups) {
    proposals.push({ runIds: Object.freeze([...group.runIds].sort((left, right) => left - right)) })
  }

  return {
    ok: true,
    value: Object.freeze([...proposals].sort(proposalCompare).map((proposal) => Object.freeze(proposal))),
  }
}
