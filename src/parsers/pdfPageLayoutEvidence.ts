import {
  observeHorizontalLayout,
  type HorizontalLayoutEvidence,
  type HorizontalLayoutObservationResult,
} from './pdfHorizontalLayoutEvidence'
import type { PhysicalPageBounds } from './pdfPageGeometry'
import { proposeRowCandidates } from './pdfRowCandidateProposal'
import type { RowEvidenceGraph, VerticalRelation } from './pdfRowEvidenceGraph'
import {
  buildRowEvidenceGraph,
  type BuildRowEvidenceGraphResult,
  type RowCandidateProposalPolicy,
  type RowEvidenceGraphBuilderDependencies,
  type VerticalCalibrationPolicy,
  type VerticalRelationClassifier,
} from './pdfRowEvidenceGraphBuilder'
import {
  normalizeTextRunGeometry,
  type GeometryRun,
  type PdfTextRun,
} from './pdfTextGeometry'
import {
  calibrateVerticalEvidence,
  type VerticalCalibrationSnapshot,
} from './pdfVerticalCalibration'
import { classifyVerticalRelations } from './pdfVerticalRelationClassifier'

export type PageLayoutEvidenceConstructionStage =
  | 'geometry'
  | 'vertical-calibration'
  | 'candidate-proposal'
  | 'relation-classification'
  | 'row-evidence-graph'
  | 'horizontal-observation'

export interface PageLayoutEvidenceConstructionIssue {
  readonly code: string
  readonly runIds?: readonly number[]
  readonly candidateIds?: readonly string[]
  readonly count?: number
}

export interface PrivacySafeGraphSummary {
  readonly runIds: readonly number[]
  readonly unsafeRunIds: readonly number[]
  readonly candidates: RowEvidenceGraph['candidates']
  readonly relations: readonly VerticalRelation[]
}

export interface PageLayoutEvidenceConstructionInput {
  readonly items: readonly PdfTextRun[]
  readonly pageBounds: PhysicalPageBounds
  readonly pageNumber: number
}

export type InternalPageLayoutEvidenceResult =
  | {
      readonly status: 'AVAILABLE'
      readonly pageNumber: number
      readonly graph: RowEvidenceGraph
      readonly horizontalEvidence: HorizontalLayoutEvidence
    }
  | {
      readonly status: 'UNAVAILABLE'
      readonly pageNumber: number
      readonly stage: 'vertical-calibration'
      readonly code: 'INSUFFICIENT_CALIBRATION'
    }
  | {
      readonly status: 'FAILED'
      readonly pageNumber: number
      readonly stage: PageLayoutEvidenceConstructionStage
      readonly code: string
      readonly issues?: readonly PageLayoutEvidenceConstructionIssue[]
    }

export type PageLayoutEvidenceDiagnostic =
  | {
      readonly status: 'AVAILABLE'
      readonly pageNumber: number
      readonly graphSummary: PrivacySafeGraphSummary
      readonly horizontalEvidence: HorizontalLayoutEvidence
    }
  | {
      readonly status: 'UNAVAILABLE'
      readonly pageNumber: number
      readonly stage: 'vertical-calibration'
      readonly code: 'INSUFFICIENT_CALIBRATION'
    }
  | {
      readonly status: 'FAILED'
      readonly pageNumber: number
      readonly stage: PageLayoutEvidenceConstructionStage
      readonly code: string
      readonly issues?: readonly PageLayoutEvidenceConstructionIssue[]
    }

export interface PageLayoutEvidenceConstructionDependencies {
  readonly geometry?: (run: PdfTextRun, originalIndex: number) => GeometryRun
  readonly calibration?: VerticalCalibrationPolicy<VerticalCalibrationSnapshot>
  readonly candidate?: RowCandidateProposalPolicy<VerticalCalibrationSnapshot>
  readonly relation?: VerticalRelationClassifier<VerticalCalibrationSnapshot>
  readonly graph?: (
    runs: readonly GeometryRun[],
    dependencies: RowEvidenceGraphBuilderDependencies<VerticalCalibrationSnapshot>,
  ) => BuildRowEvidenceGraphResult
  readonly horizontal?: (input: {
    readonly graph: RowEvidenceGraph
    readonly pageBounds: PhysicalPageBounds
  }) => HorizontalLayoutObservationResult
  readonly observeStage?: (stage: PageLayoutEvidenceConstructionStage) => void
}

const issueKey = (issue: PageLayoutEvidenceConstructionIssue) => [
  issue.code,
  ...(issue.runIds ?? []),
  ...(issue.candidateIds ?? []),
  issue.count ?? '',
].join('|')

const normalizeIssues = (
  issues: readonly PageLayoutEvidenceConstructionIssue[],
): readonly PageLayoutEvidenceConstructionIssue[] => issues
  .map((issue) => ({
    code: issue.code,
    ...(issue.runIds ? { runIds: [...issue.runIds].sort((left, right) => left - right) } : {}),
    ...(issue.candidateIds ? { candidateIds: [...issue.candidateIds].sort() } : {}),
    ...(issue.count !== undefined ? { count: issue.count } : {}),
  }))
  .sort((left, right) => issueKey(left).localeCompare(issueKey(right)))

const graphFailureStage = (
  stage: Exclude<BuildRowEvidenceGraphResult, { ok: true }>['stage'],
): PageLayoutEvidenceConstructionStage => {
  if (stage === 'calibration') return 'vertical-calibration'
  if (stage === 'candidate-proposal') return 'candidate-proposal'
  if (stage === 'relation-classification') return 'relation-classification'
  return 'row-evidence-graph'
}

export function constructPageLayoutEvidence(
  input: PageLayoutEvidenceConstructionInput,
  dependencies: PageLayoutEvidenceConstructionDependencies = {},
): InternalPageLayoutEvidenceResult {
  const observeStage = dependencies.observeStage

  observeStage?.('geometry')
  const geometry = dependencies.geometry ?? normalizeTextRunGeometry
  const runs = input.items.map((item, index) => geometry(item, index))

  const calibration = dependencies.calibration ?? calibrateVerticalEvidence
  const candidate = dependencies.candidate ?? proposeRowCandidates
  const relation = dependencies.relation ?? classifyVerticalRelations
  const builderDependencies: RowEvidenceGraphBuilderDependencies<VerticalCalibrationSnapshot> = {
    calibrationPolicy: (safeRuns) => {
      observeStage?.('vertical-calibration')
      return calibration(safeRuns)
    },
    candidateProposer: (safeRuns, snapshot) => {
      observeStage?.('candidate-proposal')
      return candidate(safeRuns, snapshot)
    },
    relationClassifier: (classifierInput) => {
      observeStage?.('relation-classification')
      return relation(classifierInput)
    },
  }

  const graphResult = (dependencies.graph ?? buildRowEvidenceGraph)(runs, builderDependencies)
  if (!graphResult.ok) {
    const issues = normalizeIssues(graphResult.issues)
    if (graphResult.stage === 'calibration'
      && issues.some((issue) => issue.code === 'INSUFFICIENT_CALIBRATION')) {
      return {
        status: 'UNAVAILABLE',
        pageNumber: input.pageNumber,
        stage: 'vertical-calibration',
        code: 'INSUFFICIENT_CALIBRATION',
      }
    }
    return {
      status: 'FAILED',
      pageNumber: input.pageNumber,
      stage: graphFailureStage(graphResult.stage),
      code: issues[0]?.code ?? 'UNKNOWN_EVIDENCE_CONSTRUCTION_FAILURE',
      ...(issues.length ? { issues } : {}),
    }
  }

  observeStage?.('row-evidence-graph')
  observeStage?.('horizontal-observation')
  const horizontalResult = (dependencies.horizontal ?? observeHorizontalLayout)({
    graph: graphResult.graph,
    pageBounds: input.pageBounds,
  })
  if (!horizontalResult.ok) {
    const issues = normalizeIssues(horizontalResult.issues)
    return {
      status: 'FAILED',
      pageNumber: input.pageNumber,
      stage: 'horizontal-observation',
      code: horizontalResult.code,
      ...(issues.length ? { issues } : {}),
    }
  }

  return {
    status: 'AVAILABLE',
    pageNumber: input.pageNumber,
    graph: graphResult.graph,
    horizontalEvidence: horizontalResult.value,
  }
}

const summarizeGraph = (graph: RowEvidenceGraph): PrivacySafeGraphSummary => ({
  runIds: graph.runs.map((run) => run.originalIndex),
  unsafeRunIds: graph.runs
    .filter((run) => !run.geometryComparable)
    .map((run) => run.originalIndex),
  candidates: graph.candidates.map((candidate) => ({
    ...candidate,
    runIds: [...candidate.runIds],
  })),
  relations: graph.relations.map((relation) => ({
    ...relation,
    evidence: { ...relation.evidence },
  })),
})

const projectIssue = (issue: PageLayoutEvidenceConstructionIssue): PageLayoutEvidenceConstructionIssue => ({
  code: issue.code,
  ...(issue.runIds ? { runIds: [...issue.runIds] } : {}),
  ...(issue.candidateIds ? { candidateIds: [...issue.candidateIds] } : {}),
  ...(issue.count !== undefined ? { count: issue.count } : {}),
})

export function projectPageLayoutEvidenceDiagnostic(
  result: InternalPageLayoutEvidenceResult,
): PageLayoutEvidenceDiagnostic {
  if (result.status === 'AVAILABLE') {
    return {
      status: 'AVAILABLE',
      pageNumber: result.pageNumber,
      graphSummary: summarizeGraph(result.graph),
      horizontalEvidence: result.horizontalEvidence,
    }
  }
  if (result.status === 'UNAVAILABLE') return { ...result }
  return {
    status: 'FAILED',
    pageNumber: result.pageNumber,
    stage: result.stage,
    code: result.code,
    ...(result.issues ? { issues: result.issues.map(projectIssue) } : {}),
  }
}
