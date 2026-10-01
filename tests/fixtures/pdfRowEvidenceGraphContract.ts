import { normalizeTextRunGeometry, type PdfTextRun } from '../../src/parsers/pdfTextGeometry'
import type {
  ProposedVisualGroups,
  TestRowEvidenceGraph,
  TestRowRelation,
} from '../helpers/rowEvidenceGraphContractHarness'

const comparableEvidence = {
  baselineDifference: 0,
  heightRatio: 1,
  verticalOverlapRatio: 1,
  geometryComparable: true,
} as const

const relation = (
  leftRunId: number,
  rightRunId: number,
  state: TestRowRelation['state'],
): TestRowRelation => ({ leftRunId, rightRunId, state, evidence: comparableEvidence })

const run = (
  originalIndex: number,
  text: string,
  x: number,
  baseline: number,
  width = 24,
  height = 12,
  overrides: Partial<PdfTextRun> = {},
) => normalizeTextRunGeometry({
  str: text,
  transform: [1, 0, 0, 1, x, baseline],
  width,
  height,
  dir: 'ltr',
  fontName: 'AnonymousContractFont',
  hasEOL: false,
  ...overrides,
}, originalIndex)

const completeRelations = (runIds: readonly number[], state: TestRowRelation['state']): TestRowRelation[] => {
  const relations: TestRowRelation[] = []
  for (let left = 0; left < runIds.length; left += 1) {
    for (let right = left + 1; right < runIds.length; right += 1) {
      relations.push(relation(runIds[left], runIds[right], state))
    }
  }
  return relations
}

export interface RowEvidenceContractCase {
  id: string
  graph: TestRowEvidenceGraph
  allowed: readonly ProposedVisualGroups[]
  forbidden: readonly ProposedVisualGroups[]
}

export const rowEvidenceContractCases: readonly RowEvidenceContractCase[] = [
  {
    id: 'same-y-separate-columns',
    graph: {
      runs: [run(0, 'Skills', 24, 200), run(1, 'Experience', 320, 200)],
      candidates: [{ id: 'row-0', runIds: [0, 1], geometryStatus: 'comparable' }],
      relations: [relation(0, 1, 'SUPPORTED')],
    },
    allowed: [[[0], [1]]],
    forbidden: [],
  },
  {
    id: 'split-cjk-heading',
    graph: {
      runs: [
        run(0, '工', 24, 180, 12),
        run(1, '作', 36, 180.6, 12),
        run(2, '經', 48, 180, 12),
        run(3, '驗', 60, 180.6, 12),
      ],
      candidates: [
        { id: 'row-0', runIds: [0, 2], geometryStatus: 'comparable' },
        { id: 'row-1', runIds: [1, 3], geometryStatus: 'comparable' },
      ],
      relations: completeRelations([0, 1, 2, 3], 'DEFERRED'),
    },
    allowed: [[[0, 1, 2, 3]], [[0, 2], [1, 3]]],
    forbidden: [],
  },
  {
    id: 'split-latin-fragments',
    graph: {
      runs: [run(0, 'Soft', 24, 160, 24), run(1, 'ware', 48, 160.5, 28)],
      candidates: [
        { id: 'row-0', runIds: [0], geometryStatus: 'comparable' },
        { id: 'row-1', runIds: [1], geometryStatus: 'comparable' },
      ],
      relations: [relation(0, 1, 'DEFERRED')],
    },
    allowed: [[[0, 1]], [[0], [1]]],
    forbidden: [],
  },
  {
    id: 'rejected-same-candidate',
    graph: {
      runs: [run(0, 'Software Engineer', 24, 140), run(1, '2023 - Present', 24, 112)],
      candidates: [{ id: 'row-0', runIds: [0, 1], geometryStatus: 'comparable' }],
      relations: [relation(0, 1, 'REJECTED')],
    },
    allowed: [[[0], [1]]],
    forbidden: [[[0, 1]]],
  },
  {
    id: 'pairwise-chaining',
    graph: {
      runs: [run(0, 'A', 24, 120), run(1, 'B', 42, 126), run(2, 'C', 60, 132)],
      candidates: [
        { id: 'row-0', runIds: [0], geometryStatus: 'comparable' },
        { id: 'row-1', runIds: [1], geometryStatus: 'comparable' },
        { id: 'row-2', runIds: [2], geometryStatus: 'comparable' },
      ],
      relations: [
        relation(0, 1, 'DEFERRED'),
        relation(1, 2, 'DEFERRED'),
        relation(0, 2, 'REJECTED'),
      ],
    },
    allowed: [[[0, 1], [2]], [[0], [1, 2]], [[0], [1], [2]]],
    forbidden: [[[0, 1, 2]]],
  },
  {
    id: 'supported-cross-candidate',
    graph: {
      runs: [run(0, 'Label', 24, 100), run(1, 'Value', 54, 100)],
      candidates: [
        { id: 'row-0', runIds: [0], geometryStatus: 'comparable' },
        { id: 'row-1', runIds: [1], geometryStatus: 'comparable' },
      ],
      relations: [relation(0, 1, 'SUPPORTED')],
    },
    allowed: [[[0, 1]], [[0], [1]]],
    forbidden: [],
  },
  {
    id: 'missing-cross-candidate-relation',
    graph: {
      runs: [run(0, 'Left', 24, 80), run(1, 'Right', 54, 80)],
      candidates: [
        { id: 'row-0', runIds: [0], geometryStatus: 'comparable' },
        { id: 'row-1', runIds: [1], geometryStatus: 'comparable' },
      ],
      relations: [],
    },
    allowed: [[[0], [1]]],
    forbidden: [[[0, 1]]],
  },
  {
    id: 'unsafe-isolation',
    graph: {
      runs: [
        run(0, 'Safe', 24, 60),
        run(1, 'Rotated', 54, 60, 36, 12, { transform: [0, 1, -1, 0, 54, 60] }),
      ],
      candidates: [
        { id: 'row-0', runIds: [0], geometryStatus: 'comparable' },
        { id: 'unsafe-1', runIds: [1], geometryStatus: 'isolated-unsafe' },
      ],
      relations: [],
    },
    allowed: [[[0], [1]]],
    forbidden: [[[0, 1]]],
  },
]

export const contractCaseById = (id: string): RowEvidenceContractCase => {
  const contractCase = rowEvidenceContractCases.find((candidate) => candidate.id === id)
  if (!contractCase) throw new Error(`Unknown RowEvidenceGraph contract case: ${id}`)
  return contractCase
}
