import { describe, expect, it } from 'vitest'
import { visualGroupFixtureById } from './fixtures/pdfVisualGroupGroundTruth'
import {
  observeAnonymousGraphicsPdf,
  type AnonymousGraphicsPdfSpec,
} from './helpers/anonymousPdfGraphicsHarness'

const divider = 'q 0 0 0 RG 2 w 280 600 m 280 740 l S Q'
const sidebarPanel = 'q 0.9 0.9 0.9 rg 20 600 130 160 re f Q'
const leftBox = 'q 0 0 0 RG 1 w 20 600 220 160 re S Q'
const rightBox = 'q 0 0 0 RG 1 w 300 600 240 160 re S Q'
const sharedBox = 'q 0 0 0 RG 1 w 20 600 520 160 re S Q'
const horizontalRule = 'q 0 0 0 RG 1 w 20 690 m 540 690 l S Q'
const fullWidthPanel = 'q 0.8 0.8 0.8 rg 20 600 520 160 re f Q'
const logoBox = 'q 0.3 0.3 0.3 rg 540 760 30 20 re f Q'
const clipAndDivider = 'q 20 580 520 180 re W n 0 0 0 RG 2 w 280 600 m 280 740 l S Q'

interface Scenario {
  readonly id: string
  readonly fixtureId: string
  readonly drawings: readonly string[]
  readonly page?: AnonymousGraphicsPdfSpec['page']
  readonly drawingPlacement?: AnonymousGraphicsPdfSpec['drawingPlacement']
}

const scenarios: readonly Scenario[] = [
  { id: 'column-divider', fixtureId: 'TWO_COLUMN_50_50', drawings: [divider] },
  { id: 'inline-divider', fixtureId: 'INLINE_50_50_MATCHED', drawings: [divider] },
  { id: 'inline-no-divider', fixtureId: 'INLINE_50_50_MATCHED', drawings: [] },
  { id: 'sidebar-panel', fixtureId: 'NARROW_SIDEBAR', drawings: [sidebarPanel] },
  { id: 'inline-panel', fixtureId: 'INLINE_NARROW_SIDEBAR_MATCHED', drawings: [sidebarPanel] },
  { id: 'separate-boxes', fixtureId: 'CANDIDATE_SPLIT_WITH_CONTEXT', drawings: [leftBox, rightBox] },
  { id: 'inline-separate-boxes', fixtureId: 'REPEATED_INLINE_NO_SPAN', drawings: [leftBox, rightBox] },
  { id: 'inline-shared-box', fixtureId: 'REPEATED_INLINE_NO_SPAN', drawings: [sharedBox] },
  { id: 'column-horizontal-rule', fixtureId: 'TWO_COLUMN_50_50', drawings: [horizontalRule] },
  { id: 'inline-horizontal-rule', fixtureId: 'INLINE_50_50_MATCHED', drawings: [horizontalRule] },
  { id: 'column-no-graphics', fixtureId: 'TWO_COLUMN_50_50', drawings: [] },
  { id: 'inline-no-graphics', fixtureId: 'INLINE_50_50_MATCHED', drawings: [] },
  { id: 'sidebar-no-graphics', fixtureId: 'NARROW_SIDEBAR', drawings: [] },
  { id: 'sidebar-inline-no-graphics', fixtureId: 'INLINE_NARROW_SIDEBAR_MATCHED', drawings: [] },
  { id: 'same-y-no-graphics', fixtureId: 'SPARSE_SEPARATE_REGIONS_EXACT', drawings: [] },
  { id: 'same-y-inline-no-graphics', fixtureId: 'SPARSE_INLINE_EXACT', drawings: [] },
  { id: 'inline-logo', fixtureId: 'INLINE_50_50_MATCHED', drawings: [logoBox] },
  { id: 'inline-icon', fixtureId: 'INLINE_50_50_MATCHED', drawings: ['q 0 0 0 RG 1 w 550 670 12 12 re S Q'] },
  { id: 'inline-decoration', fixtureId: 'INLINE_50_50_MATCHED', drawings: ['q 0 0 0 RG 1 w 20 780 m 100 780 l S Q'] },
  { id: 'inline-page-border', fixtureId: 'INLINE_50_50_MATCHED', drawings: ['q 0 0 0 RG 1 w 5 5 590 790 re S Q'] },
  { id: 'inline-underline', fixtureId: 'INLINE_50_50_MATCHED', drawings: ['q 0 0 0 RG 1 w 40 680 m 140 680 l S Q'] },
  { id: 'column-overlap-panel', fixtureId: 'TWO_COLUMN_50_50', drawings: [fullWidthPanel] },
  { id: 'inline-overlap-panel', fixtureId: 'INLINE_50_50_MATCHED', drawings: [fullWidthPanel] },
  { id: 'draw-order-a', fixtureId: 'TWO_COLUMN_50_50', drawings: [divider, logoBox] },
  { id: 'draw-order-b', fixtureId: 'TWO_COLUMN_50_50', drawings: [logoBox, divider] },
  { id: 'column-clipped', fixtureId: 'TWO_COLUMN_50_50', drawings: [clipAndDivider] },
  { id: 'inline-clipped', fixtureId: 'INLINE_50_50_MATCHED', drawings: [clipAndDivider] },
  { id: 'divider-scale-2x', fixtureId: 'TWO_COLUMN_50_50', drawings: [divider], page: { minX: 0, minY: 0, scale: 2 } },
  { id: 'divider-nonzero-origin', fixtureId: 'TWO_COLUMN_50_50', drawings: [divider], page: { minX: 100, minY: 50, scale: 1 } },
  { id: 'divider-transformed', fixtureId: 'TWO_COLUMN_50_50', drawings: ['q 0 0 0 RG 1 w 2 0 0 2 0 0 cm 140 300 m 140 370 l S Q'] },
]

const scenarioById = (id: string) => {
  const scenario = scenarios.find((candidate) => candidate.id === id)
  if (!scenario) throw new Error(`Unknown anonymous graphics scenario: ${id}`)
  return scenario
}

const cache = new Map<string, ReturnType<typeof observeAnonymousGraphicsPdf>>()
const observe = (id: string) => {
  let observation = cache.get(id)
  if (!observation) {
    const scenario = scenarioById(id)
    observation = observeAnonymousGraphicsPdf({
      fixture: visualGroupFixtureById(scenario.fixtureId),
      drawings: scenario.drawings,
      ...(scenario.page ? { page: scenario.page } : {}),
      ...(scenario.drawingPlacement ? { drawingPlacement: scenario.drawingPlacement } : {}),
    })
    cache.set(id, observation)
  }
  return observation
}

const matchedOpposites = [
  { id: 'DIVIDER_MATCHED', separated: 'column-divider', inline: 'inline-divider', graphics: 'equal' },
  { id: 'DIVIDER_ABSENT', separated: 'column-divider', inline: 'inline-no-divider', graphics: 'different' },
  { id: 'BACKGROUND_MATCHED', separated: 'sidebar-panel', inline: 'inline-panel', graphics: 'equal' },
  { id: 'SEPARATE_BOXES_MATCHED', separated: 'separate-boxes', inline: 'inline-separate-boxes', graphics: 'equal' },
  { id: 'SHARED_BOX_CONTRAST', separated: 'separate-boxes', inline: 'inline-shared-box', graphics: 'different' },
  { id: 'HORIZONTAL_RULE_MATCHED', separated: 'column-horizontal-rule', inline: 'inline-horizontal-rule', graphics: 'equal' },
  { id: 'NO_GRAPHICS_COLUMNS', separated: 'column-no-graphics', inline: 'inline-no-graphics', graphics: 'equal' },
  { id: 'NO_GRAPHICS_SIDEBAR', separated: 'sidebar-no-graphics', inline: 'sidebar-inline-no-graphics', graphics: 'equal' },
  { id: 'NO_GRAPHICS_SAME_Y', separated: 'same-y-no-graphics', inline: 'same-y-inline-no-graphics', graphics: 'equal' },
  { id: 'FULL_WIDTH_OVERLAP', separated: 'column-overlap-panel', inline: 'inline-overlap-panel', graphics: 'equal' },
  { id: 'CLIPPING_MATCHED', separated: 'column-clipped', inline: 'inline-clipped', graphics: 'equal' },
] as const

describe('RP-075 anonymous PDF graphics and operator investigation', () => {
  it('keeps the corpus anonymous and matched against existing opposite ground truth', () => {
    expect(scenarios).toHaveLength(30)
    expect(matchedOpposites).toHaveLength(11)
    const ids = scenarios.map((scenario) => scenario.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const pair of matchedOpposites) {
      const separated = visualGroupFixtureById(scenarioById(pair.separated).fixtureId)
      const inline = visualGroupFixtureById(scenarioById(pair.inline).fixtureId)
      expect(separated.expectedGroups).not.toEqual(inline.expectedGroups)
    }
  })

  it.each(matchedOpposites)(
    '$id compares actual PDF.js text and graphics evidence for opposite membership',
    async (pair) => {
      const separated = await observe(pair.separated)
      const inline = await observe(pair.inline)
      expect(separated.textSignature).toEqual(inline.textSignature)
      if (pair.graphics === 'equal') expect(separated.graphicsSignature).toEqual(inline.graphicsSignature)
      else expect(separated.graphicsSignature).not.toEqual(inline.graphicsSignature)
    },
  )

  it('observes stroke, fill, box, and clipping facts without operator arguments or text', async () => {
    const dividerResult = await observe('column-divider')
    const panelResult = await observe('sidebar-panel')
    const boxesResult = await observe('separate-boxes')
    const clippedResult = await observe('column-clipped')
    expect(dividerResult.graphicsSignature.map((path) => path.kind)).toEqual(['stroke'])
    expect(panelResult.graphicsSignature.map((path) => path.kind)).toEqual(['fill'])
    expect(boxesResult.graphicsSignature.map((path) => path.kind)).toEqual(['stroke', 'stroke'])
    expect(clippedResult.graphicsSignature.map((path) => path.kind)).toContain('clip')
    const serialized = JSON.stringify([
      dividerResult.graphicsSignature,
      panelResult.graphicsSignature,
      boxesResult.graphicsSignature,
      clippedResult.graphicsSignature,
    ])
    expect(serialized).not.toContain('TOKEN')
    expect(serialized).not.toContain('fragment:')
  })

  it.each([
    'inline-logo', 'inline-icon', 'inline-decoration', 'inline-page-border', 'inline-underline',
  ])('%s has graphics while ground truth remains inline', async (id) => {
    expect((await observe(id)).graphicsSignature.length).toBeGreaterThan(0)
    const fixture = visualGroupFixtureById(scenarioById(id).fixtureId)
    expect(fixture.expectedGroups.some((group) => group.length > 1)).toBe(true)
  })

  it('keeps equivalent nonoverlapping graphics stable when drawing order changes', async () => {
    const first = await observe('draw-order-a')
    const second = await observe('draw-order-b')
    expect(first.textSignature).toEqual(second.textSignature)
    expect(first.graphicsSignature).toEqual(second.graphicsSignature)
    expect(first.rawOperatorKinds).not.toEqual(second.rawOperatorKinds)
  })

  it('normalizes uniform scale, page origin, and an equivalent PDF coordinate transform', async () => {
    const base = (await observe('column-divider')).graphicsSignature
    expect((await observe('divider-scale-2x')).graphicsSignature).toEqual(base)
    expect((await observe('divider-nonzero-origin')).graphicsSignature).toEqual(base)
    expect((await observe('divider-transformed')).graphicsSignature).toEqual(base)
  })
})
