import { describe, expect, it } from 'vitest'
import {
  baselineDifference,
  estimatedGlyphAdvance,
  heightRatio,
  horizontalGap,
  normalizeTextRunGeometry,
  verticalOverlapRatio,
  type PdfTextRun,
} from '../src/parsers/pdfTextGeometry'

const textRun = (overrides: Partial<PdfTextRun> = {}): PdfTextRun => ({
  str: 'Test',
  transform: [1, 0, 0, 1, 10, 100],
  width: 20,
  height: 10,
  dir: 'ltr',
  fontName: 'AnonymousFont',
  hasEOL: false,
  ...overrides,
})

describe('PDF text geometry primitives', () => {
  it('normalizes x and endX while preserving the original index', () => {
    const geometry = normalizeTextRunGeometry(textRun(), 7)
    expect(geometry).toMatchObject({ originalIndex: 7, x: 10, endX: 30 })
  })

  it('measures the horizontal gap between comparable runs', () => {
    const left = normalizeTextRunGeometry(textRun(), 0)
    const right = normalizeTextRunGeometry(textRun({ transform: [1, 0, 0, 1, 35, 100] }), 1)
    expect(horizontalGap(left, right)).toBe(5)
  })

  it('preserves a negative gap for overlapping runs', () => {
    const left = normalizeTextRunGeometry(textRun(), 0)
    const right = normalizeTextRunGeometry(textRun({ transform: [1, 0, 0, 1, 25, 100] }), 1)
    expect(horizontalGap(left, right)).toBe(-5)
  })

  it('measures absolute baseline difference', () => {
    const first = normalizeTextRunGeometry(textRun(), 0)
    const second = normalizeTextRunGeometry(textRun({ transform: [1, 0, 0, 1, 10, 94] }), 1)
    expect(baselineDifference(first, second)).toBe(6)
  })

  it('returns one for equal-height runs', () => {
    const first = normalizeTextRunGeometry(textRun(), 0)
    const second = normalizeTextRunGeometry(textRun(), 1)
    expect(heightRatio(first, second)).toBe(1)
  })

  it('returns the larger-to-smaller ratio for unequal heights', () => {
    const first = normalizeTextRunGeometry(textRun({ height: 10 }), 0)
    const second = normalizeTextRunGeometry(textRun({ height: 20 }), 1)
    expect(heightRatio(first, second)).toBe(2)
  })

  it('measures vertical overlap relative to the smaller run', () => {
    const first = normalizeTextRunGeometry(textRun({ height: 10 }), 0)
    const second = normalizeTextRunGeometry(textRun({ transform: [1, 0, 0, 1, 10, 105], height: 10 }), 1)
    expect(verticalOverlapRatio(first, second)).toBe(0.5)
  })

  it('estimates glyph advance without inventing a value for empty text', () => {
    expect(estimatedGlyphAdvance(normalizeTextRunGeometry(textRun({ str: 'ABCD', width: 40 }), 0))).toBe(10)
    expect(estimatedGlyphAdvance(normalizeTextRunGeometry(textRun({ str: '', width: 0 }), 1))).toBeNull()
  })

  it('marks ordinary LTR text as horizontal and geometry-comparable', () => {
    expect(normalizeTextRunGeometry(textRun(), 0)).toMatchObject({
      orientation: 'horizontal',
      direction: 'ltr',
      geometryComparable: true,
    })
  })

  it('marks rotated text unsupported and refuses unsafe comparisons', () => {
    const rotated = normalizeTextRunGeometry(textRun({ transform: [0, 1, -1, 0, 10, 100] }), 0)
    const horizontal = normalizeTextRunGeometry(textRun(), 1)

    expect(rotated).toMatchObject({ orientation: 'unsupported', geometryComparable: false, endX: null })
    expect(horizontalGap(rotated, horizontal)).toBeNull()
    expect(baselineDifference(rotated, horizontal)).toBeNull()
    expect(heightRatio(rotated, horizontal)).toBeNull()
    expect(verticalOverlapRatio(rotated, horizontal)).toBeNull()
  })
})
