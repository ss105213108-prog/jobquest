import { describe, expect, it } from 'vitest'
import { visualGroupFixtureById } from './fixtures/pdfVisualGroupGroundTruth'
import {
  observeAnonymousMarkedPdf,
  type AnonymousMarkedPdfSpec,
  type MarkedGroup,
} from './helpers/anonymousPdfMarkedContentHarness'

const left: MarkedGroup = { role: 'Div', children: [0, 2, 4] }
const right: MarkedGroup = { role: 'Div', children: [1, 3, 5] }
const sides = [left, right]
const sharedParent: readonly MarkedGroup[] = [{ role: 'Div', children: sides }]
const rowGroups: readonly MarkedGroup[] = [
  { role: 'Div', children: [0, 1] },
  { role: 'Div', children: [2, 3] },
  { role: 'Div', children: [4, 5] },
]
const crossRegion: readonly MarkedGroup[] = [{ role: 'Div', children: [0, 1, 2, 3, 4, 5] }]

interface Scenario {
  readonly id: string
  readonly fixtureId: string
  readonly mode: AnonymousMarkedPdfSpec['mode']
  readonly groups?: readonly MarkedGroup[]
  readonly markedRunIndices?: readonly number[]
  readonly emitGroupBoundaries?: boolean
  readonly mcidRunGroups?: readonly (readonly number[])[]
}

const scenarios: readonly Scenario[] = [
  { id: 'columns-separate-mcids', fixtureId: 'TWO_COLUMN_50_50', mode: 'tagged', groups: sides },
  { id: 'inline-separate-mcids', fixtureId: 'INLINE_50_50_MATCHED', mode: 'tagged', groups: sides },
  { id: 'columns-shared-parent', fixtureId: 'TWO_COLUMN_50_50', mode: 'tagged', groups: sharedParent, emitGroupBoundaries: true },
  { id: 'inline-shared-parent', fixtureId: 'INLINE_50_50_MATCHED', mode: 'tagged', groups: sharedParent, emitGroupBoundaries: true },
  { id: 'columns-span-rows', fixtureId: 'TWO_COLUMN_50_50', mode: 'tagged', groups: sides, emitGroupBoundaries: true },
  { id: 'inline-span-rows', fixtureId: 'INLINE_50_50_MATCHED', mode: 'tagged', groups: sides, emitGroupBoundaries: true },
  { id: 'columns-cross-region', fixtureId: 'TWO_COLUMN_50_50', mode: 'tagged', groups: crossRegion, emitGroupBoundaries: true },
  { id: 'inline-cross-region', fixtureId: 'INLINE_50_50_MATCHED', mode: 'tagged', groups: crossRegion, emitGroupBoundaries: true },
  { id: 'columns-row-groups', fixtureId: 'TWO_COLUMN_50_50', mode: 'tagged', groups: rowGroups },
  { id: 'inline-row-groups', fixtureId: 'INLINE_50_50_MATCHED', mode: 'tagged', groups: rowGroups },
  { id: 'columns-untagged', fixtureId: 'TWO_COLUMN_50_50', mode: 'none' },
  { id: 'inline-untagged', fixtureId: 'INLINE_50_50_MATCHED', mode: 'none' },
  { id: 'sidebar-untagged', fixtureId: 'NARROW_SIDEBAR', mode: 'none' },
  { id: 'sidebar-inline-untagged', fixtureId: 'INLINE_NARROW_SIDEBAR_MATCHED', mode: 'none' },
  { id: 'same-y-untagged', fixtureId: 'SPARSE_SEPARATE_REGIONS_EXACT', mode: 'none' },
  { id: 'same-y-inline-untagged', fixtureId: 'SPARSE_INLINE_EXACT', mode: 'none' },
  { id: 'columns-mcid-only', fixtureId: 'TWO_COLUMN_50_50', mode: 'mcid' },
  { id: 'inline-mcid-only', fixtureId: 'INLINE_50_50_MATCHED', mode: 'mcid' },
  { id: 'columns-shared-mcid', fixtureId: 'TWO_COLUMN_50_50', mode: 'mcid', mcidRunGroups: [[0, 1], [2, 3], [4, 5]] },
  { id: 'inline-shared-mcid', fixtureId: 'INLINE_50_50_MATCHED', mode: 'mcid', mcidRunGroups: [[0, 1], [2, 3], [4, 5]] },
  { id: 'columns-bmc-only', fixtureId: 'TWO_COLUMN_50_50', mode: 'bmc' },
  { id: 'inline-bmc-only', fixtureId: 'INLINE_50_50_MATCHED', mode: 'bmc' },
  { id: 'columns-partial', fixtureId: 'TWO_COLUMN_50_50', mode: 'tagged', groups: [left], markedRunIndices: [0, 2, 4] },
  { id: 'inline-partial', fixtureId: 'INLINE_50_50_MATCHED', mode: 'tagged', groups: [left], markedRunIndices: [0, 2, 4] },
  { id: 'columns-role-div', fixtureId: 'TWO_COLUMN_50_50', mode: 'tagged', groups: sides },
  { id: 'inline-role-sect', fixtureId: 'INLINE_50_50_MATCHED', mode: 'tagged', groups: [
    { role: 'Sect', children: [0, 2, 4] }, { role: 'Sect', children: [1, 3, 5] },
  ] },
]

const scenarioById = (id: string) => {
  const scenario = scenarios.find((candidate) => candidate.id === id)
  if (!scenario) throw new Error(`Unknown anonymous marked scenario: ${id}`)
  return scenario
}
const cache = new Map<string, ReturnType<typeof observeAnonymousMarkedPdf>>()
const observe = (id: string) => {
  let observation = cache.get(id)
  if (!observation) {
    const scenario = scenarioById(id)
    observation = observeAnonymousMarkedPdf({
      fixture: visualGroupFixtureById(scenario.fixtureId),
      mode: scenario.mode,
      ...(scenario.groups ? { groups: scenario.groups } : {}),
      ...(scenario.markedRunIndices ? { markedRunIndices: scenario.markedRunIndices } : {}),
      ...(scenario.emitGroupBoundaries ? { emitGroupBoundaries: true } : {}),
      ...(scenario.mcidRunGroups ? { mcidRunGroups: scenario.mcidRunGroups } : {}),
    })
    cache.set(id, observation)
  }
  return observation
}

const exactOpposites = [
  ['SEPARATE_MCIDS', 'columns-separate-mcids', 'inline-separate-mcids'],
  ['SHARED_PARENT', 'columns-shared-parent', 'inline-shared-parent'],
  ['SPANS_ROWS', 'columns-span-rows', 'inline-span-rows'],
  ['CROSS_REGION', 'columns-cross-region', 'inline-cross-region'],
  ['ROW_GROUPS', 'columns-row-groups', 'inline-row-groups'],
  ['NO_TAG_COLUMNS', 'columns-untagged', 'inline-untagged'],
  ['NO_TAG_SIDEBAR', 'sidebar-untagged', 'sidebar-inline-untagged'],
  ['NO_TAG_SAME_Y', 'same-y-untagged', 'same-y-inline-untagged'],
  ['MCID_WITHOUT_TREE', 'columns-mcid-only', 'inline-mcid-only'],
  ['SHARED_MCID', 'columns-shared-mcid', 'inline-shared-mcid'],
  ['BMC_WITHOUT_MCID', 'columns-bmc-only', 'inline-bmc-only'],
  ['PARTIAL_TAGGING', 'columns-partial', 'inline-partial'],
] as const

describe('RP-076 anonymous PDF marked-content and structure investigation', () => {
  it('uses anonymous opposite ground truth and no drawing operators', async () => {
    expect(scenarios).toHaveLength(26)
    expect(new Set(scenarios.map((scenario) => scenario.id)).size).toBe(scenarios.length)
    for (const [, separatedId, inlineId] of exactOpposites) {
      expect(visualGroupFixtureById(scenarioById(separatedId).fixtureId).expectedGroups)
        .not.toEqual(visualGroupFixtureById(scenarioById(inlineId).fixtureId).expectedGroups)
      expect((await observe(separatedId)).drawingOperatorCount).toBe(0)
      expect((await observe(inlineId)).drawingOperatorCount).toBe(0)
    }
  })

  it.each(exactOpposites)('%s preserves exact text and marked structure across opposite ground truth', async (_, separatedId, inlineId) => {
    const separated = await observe(separatedId)
    const inline = await observe(inlineId)
    expect(separated.textSignature).toEqual(inline.textSignature)
    expect(separated.markedSignature).toEqual(inline.markedSignature)
  })

  it('observes BMC, BDC/MCID, EMC, and linked tagged-tree content at runtime', async () => {
    const bmc = await observe('columns-bmc-only')
    const mcid = await observe('columns-mcid-only')
    const tagged = await observe('columns-separate-mcids')
    expect(bmc.eventKinds).toContain('beginMarkedContent')
    expect(mcid.eventKinds).toContain('beginMarkedContentProps')
    expect(tagged.eventKinds).toContain('endMarkedContent')
    expect(bmc.markedSignature.tree).toBeNull()
    expect(mcid.markedSignature.tree).toBeNull()
    expect(tagged.markedSignature.tree).not.toBeNull()
    expect(tagged.linkedContentCount).toBe(6)
    expect(tagged.linkedTreeRunCount).toBe(6)
  })

  it('finds structural differences that matched negative controls can reproduce', async () => {
    const columns = await observe('columns-separate-mcids')
    const inlineRows = await observe('inline-row-groups')
    const columnsRows = await observe('columns-row-groups')
    expect(columns.textSignature).toEqual(inlineRows.textSignature)
    expect(columns.markedSignature.boundaries).toEqual(inlineRows.markedSignature.boundaries)
    expect(columns.markedSignature.tree).not.toEqual(inlineRows.markedSignature.tree)
    expect(columns.markedSignature).not.toEqual(inlineRows.markedSignature)
    expect(columnsRows.markedSignature).toEqual(inlineRows.markedSignature)
    const sharedMcidColumns = await observe('columns-shared-mcid')
    const sharedMcidInline = await observe('inline-shared-mcid')
    expect(sharedMcidColumns.textSignature).toEqual(sharedMcidInline.textSignature)
    expect(sharedMcidColumns.markedSignature).toEqual(sharedMcidInline.markedSignature)
  })

  it('isolates semantic role differences from structural topology', async () => {
    const columns = await observe('columns-role-div')
    const inline = await observe('inline-role-sect')
    expect(columns.textSignature).toEqual(inline.textSignature)
    expect(columns.markedSignature).toEqual(inline.markedSignature)
    expect(columns.semanticRoleInventory).not.toEqual(inline.semanticRoleInventory)
  })

  it('keeps visible geometry with and without tags while exposing text-extraction dependence', async () => {
    const tagged = await observe('columns-separate-mcids')
    const untagged = await observe('columns-untagged')
    expect(tagged.visibleTextGeometry).toEqual(untagged.visibleTextGeometry)
    expect(tagged.textSignature).not.toEqual(untagged.textSignature)
    expect(tagged.markedSignature).not.toEqual(untagged.markedSignature)
  })

  it('distinguishes complete, partial, boundary-only, MCID-only, and absent metadata coverage', async () => {
    const complete = await observe('columns-separate-mcids')
    const partial = await observe('columns-partial')
    const bmc = await observe('columns-bmc-only')
    const mcid = await observe('columns-mcid-only')
    const absent = await observe('columns-untagged')
    expect(complete.linkedContentCount).toBe(6)
    expect(partial.linkedContentCount).toBe(3)
    expect(partial.linkedTreeRunCount).toBe(3)
    expect(bmc.linkedContentCount).toBe(0)
    expect(mcid.linkedContentCount).toBe(0)
    expect(absent.eventKinds).toEqual([])
    expect(absent.markedSignature).toEqual({ boundaries: [], tree: null })
  })
})
