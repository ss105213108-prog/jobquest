import type { GeometryRun } from '../../src/parsers/pdfTextGeometry'
import type {
  BuildRowEvidenceGraphResult,
  PolicyResult,
  RowCandidateProposal,
  RowEvidenceGraphBuilderDependencies,
  VerticalPairDecision,
} from '../../src/parsers/pdfRowEvidenceGraphBuilder'
import type { RowEvidenceCandidate, RunId } from '../../src/parsers/pdfRowEvidenceGraph'

export type BuilderContractResult = BuildRowEvidenceGraphResult
export interface TestCalibration {
  readonly status: 'READY'
  readonly marker: string
}
export type TestCandidateProposal = RowCandidateProposal
export type TestRelationProposal = VerticalPairDecision

export interface FakeDependencyOptions {
  calibrationResult?: PolicyResult<TestCalibration>
  candidateResult?: PolicyResult<readonly TestCandidateProposal[]>
  relationResult?: PolicyResult<readonly TestRelationProposal[]>
}

export interface FakeDependencyRecord {
  callOrder: string[]
  calibrationRunIds: RunId[][]
  candidateRunIds: RunId[][]
  classifierRunIds: RunId[][]
  classifierCandidateIds: string[][]
}

export function fakeBuilderDependencies(options: FakeDependencyOptions = {}): {
  dependencies: RowEvidenceGraphBuilderDependencies<TestCalibration>
  record: FakeDependencyRecord
} {
  const record: FakeDependencyRecord = {
    callOrder: [],
    calibrationRunIds: [],
    candidateRunIds: [],
    classifierRunIds: [],
    classifierCandidateIds: [],
  }
  const dependencies: RowEvidenceGraphBuilderDependencies<TestCalibration> = {
    calibrationPolicy(runs: readonly GeometryRun[]) {
      record.callOrder.push('calibration')
      record.calibrationRunIds.push(runs.map((run) => run.originalIndex))
      return options.calibrationResult ?? { ok: true, value: { status: 'READY', marker: 'anonymous-calibration' } }
    },
    candidateProposer(runs: readonly GeometryRun[]) {
      record.callOrder.push('candidate-proposal')
      record.candidateRunIds.push(runs.map((run) => run.originalIndex))
      return options.candidateResult ?? {
        ok: true,
        value: runs.map((run) => ({ runIds: [run.originalIndex] })),
      }
    },
    relationClassifier(input: {
      runs: readonly GeometryRun[]
      candidates: readonly RowEvidenceCandidate[]
      calibration: TestCalibration
    }) {
      record.callOrder.push('relation-classification')
      record.classifierRunIds.push(input.runs.map((run) => run.originalIndex))
      record.classifierCandidateIds.push(input.candidates.map((candidate) => candidate.id))
      if (options.relationResult) return options.relationResult
      const decisions: VerticalPairDecision[] = []
      for (let leftIndex = 0; leftIndex < input.runs.length; leftIndex += 1) {
        for (let rightIndex = leftIndex + 1; rightIndex < input.runs.length; rightIndex += 1) {
          decisions.push({
            outcome: 'MISSING',
            leftRunId: input.runs[leftIndex].originalIndex,
            rightRunId: input.runs[rightIndex].originalIndex,
            reason: 'UNUSABLE_VERTICAL_EVIDENCE',
          })
        }
      }
      return { ok: true, value: decisions }
    },
  }
  return { dependencies, record }
}
