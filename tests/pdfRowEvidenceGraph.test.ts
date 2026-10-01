import { describe, expect, it } from 'vitest'
import { normalizeTextRunGeometry } from '../src/parsers/pdfTextGeometry'
import {
  validateRowEvidenceGraph,
  type RowEvidenceGraph,
  type VerticalEvidence,
  type VerticalRelationState,
} from '../src/parsers/pdfRowEvidenceGraph'

const evidence: VerticalEvidence = {
  baselineDifference: 0,
  heightRatio: 1,
  verticalOverlapRatio: 1,
  geometryComparable: true,
}

const run = (originalIndex: number, geometryComparable = true) => normalizeTextRunGeometry({
  str: `anonymous-${originalIndex}`,
  transform: geometryComparable ? [1, 0, 0, 1, originalIndex * 20, 100] : [0, 1, -1, 0, 0, 100],
  width: 16,
  height: 10,
  dir: 'ltr',
  fontName: 'AnonymousGraphFont',
  hasEOL: false,
}, originalIndex)

const relation = (
  leftRunId: number,
  rightRunId: number,
  state: VerticalRelationState,
) => ({ leftRunId, rightRunId, state, evidence })

const validGraph = (): RowEvidenceGraph => ({
  runs: [run(0), run(1)],
  candidates: [
    { id: 'row-0', runIds: [0], geometryStatus: 'comparable' },
    { id: 'row-1', runIds: [1], geometryStatus: 'comparable' },
  ],
  relations: [relation(0, 1, 'DEFERRED')],
})

const issueCodes = (graph: RowEvidenceGraph) => validateRowEvidenceGraph(graph).issues.map((issue) => issue.code)

describe('RP-023 production RowEvidenceGraph invariant validator', () => {
  it('accepts a valid graph without adding or repairing evidence', () => {
    const graph = validGraph()
    const snapshot = structuredClone(graph)

    expect(validateRowEvidenceGraph(graph)).toEqual({ valid: true, issues: [] })
    expect(graph).toEqual(snapshot)
  })

  it('rejects duplicate canonical run IDs', () => {
    const graph = validGraph()
    expect(issueCodes({ ...graph, runs: [run(0), run(0)] })).toContain('DUPLICATE_CANONICAL_RUN_ID')
  })

  it('rejects duplicate candidate IDs', () => {
    const graph = validGraph()
    expect(issueCodes({
      ...graph,
      candidates: graph.candidates.map((candidate) => ({ ...candidate, id: 'same-id' })),
    })).toContain('DUPLICATE_CANDIDATE_ID')
  })

  it('rejects an unknown candidate run ID', () => {
    const graph = validGraph()
    expect(issueCodes({
      ...graph,
      candidates: [{ id: 'row-0', runIds: [0, 99], geometryStatus: 'comparable' }, graph.candidates[1]],
    })).toContain('UNKNOWN_CANDIDATE_RUN_ID')
  })

  it('rejects an unknown relation endpoint', () => {
    const graph = validGraph()
    expect(issueCodes({ ...graph, relations: [relation(0, 99, 'DEFERRED')] })).toContain('UNKNOWN_RELATION_ENDPOINT')
  })

  it('rejects a self relation', () => {
    const graph = validGraph()
    expect(issueCodes({ ...graph, relations: [relation(0, 0, 'SUPPORTED')] })).toContain('SELF_RELATION')
  })

  it('normalizes endpoint direction when identifying a duplicate relation', () => {
    const graph = validGraph()
    expect(issueCodes({
      ...graph,
      relations: [relation(0, 1, 'DEFERRED'), relation(1, 0, 'DEFERRED')],
    })).toContain('DUPLICATE_RELATION')
  })

  it('rejects conflicting states for one unordered relation identity', () => {
    const graph = validGraph()
    expect(issueCodes({
      ...graph,
      relations: [relation(0, 1, 'SUPPORTED'), relation(1, 0, 'REJECTED')],
    })).toContain('CONFLICTING_RELATION_STATES')
  })

  it.each(['DEFERRED', 'SUPPORTED'] as const)(
    'rejects an unsafe run with a %s relation',
    (state) => {
      const graph: RowEvidenceGraph = {
        runs: [run(0), run(1, false)],
        candidates: [
          { id: 'row-0', runIds: [0], geometryStatus: 'comparable' },
          { id: 'unsafe-1', runIds: [1], geometryStatus: 'isolated-unsafe' },
        ],
        relations: [relation(0, 1, state)],
      }
      expect(issueCodes(graph)).toContain('UNSAFE_MERGE_CAPABLE_RELATION')
    },
  )

  it('requires every canonical run to have exactly one primary candidate', () => {
    const graph = validGraph()
    expect(issueCodes({ ...graph, candidates: [graph.candidates[0]] })).toContain('RUN_WITHOUT_PRIMARY_CANDIDATE')
    expect(issueCodes({
      ...graph,
      candidates: [...graph.candidates, { id: 'row-2', runIds: [0], geometryStatus: 'comparable' }],
    })).toContain('RUN_WITH_MULTIPLE_PRIMARY_CANDIDATES')
  })

  it('keeps isolated-unsafe candidates singleton', () => {
    const graph = validGraph()
    expect(issueCodes({
      ...graph,
      candidates: [{ id: 'unsafe', runIds: [0, 1], geometryStatus: 'isolated-unsafe' }],
    })).toContain('UNSAFE_CANDIDATE_NOT_SINGLETON')
  })

  it('returns the same structured issues regardless of graph input ordering', () => {
    const graph = validGraph()
    const invalid: RowEvidenceGraph = {
      ...graph,
      candidates: [
        ...graph.candidates,
        { id: 'row-2', runIds: [0], geometryStatus: 'comparable' },
      ],
      relations: [
        relation(0, 1, 'SUPPORTED'),
        relation(1, 0, 'REJECTED'),
      ],
    }
    const permuted: RowEvidenceGraph = {
      runs: [...invalid.runs].reverse(),
      candidates: [...invalid.candidates].reverse().map((candidate) => ({
        ...candidate,
        runIds: [...candidate.runIds].reverse(),
      })),
      relations: [...invalid.relations].reverse(),
    }

    expect(validateRowEvidenceGraph(permuted)).toEqual(validateRowEvidenceGraph(invalid))
  })
})
