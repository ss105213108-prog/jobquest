export interface PdfTextRun {
  str: string
  transform: ArrayLike<number>
  width: number
  height: number
  dir: string
  fontName: string
  hasEOL: boolean
}

export type TextOrientation = 'horizontal' | 'unsupported'

export interface GeometryRun {
  originalIndex: number
  text: string
  x: number
  y: number
  baseline: number
  width: number
  height: number
  endX: number | null
  orientation: TextOrientation
  direction: string
  fontName: string
  hasEOL: boolean
  geometryComparable: boolean
}

const hasFinitePositiveHeight = (run: GeometryRun) => Number.isFinite(run.height) && run.height > 0

export function normalizeTextRunGeometry(run: PdfTextRun, originalIndex: number): GeometryRun {
  const x = run.transform[4]
  const y = run.transform[5]
  const horizontalTransform = run.transform[1] === 0 && run.transform[2] === 0
  const finiteHorizontalGeometry = Number.isFinite(x)
    && Number.isFinite(y)
    && Number.isFinite(run.width)
    && run.width >= 0
  const orientation: TextOrientation = horizontalTransform && finiteHorizontalGeometry ? 'horizontal' : 'unsupported'
  const geometryComparable = orientation === 'horizontal' && run.dir === 'ltr'

  return {
    originalIndex,
    text: run.str,
    x,
    y,
    baseline: y,
    width: run.width,
    height: run.height,
    endX: geometryComparable ? x + run.width : null,
    orientation,
    direction: run.dir,
    fontName: run.fontName,
    hasEOL: run.hasEOL,
    geometryComparable,
  }
}

export function horizontalGap(left: GeometryRun, right: GeometryRun): number | null {
  if (!left.geometryComparable || !right.geometryComparable || left.endX === null) return null
  return right.x - left.endX
}

export function baselineDifference(first: GeometryRun, second: GeometryRun): number | null {
  if (!first.geometryComparable || !second.geometryComparable) return null
  return Math.abs(first.baseline - second.baseline)
}

export function heightRatio(first: GeometryRun, second: GeometryRun): number | null {
  if (!first.geometryComparable || !second.geometryComparable) return null
  if (!hasFinitePositiveHeight(first) || !hasFinitePositiveHeight(second)) return null
  return Math.max(first.height, second.height) / Math.min(first.height, second.height)
}

export function verticalOverlapRatio(first: GeometryRun, second: GeometryRun): number | null {
  if (!first.geometryComparable || !second.geometryComparable) return null
  if (!hasFinitePositiveHeight(first) || !hasFinitePositiveHeight(second)) return null
  const overlap = Math.max(0, Math.min(first.y + first.height, second.y + second.height) - Math.max(first.y, second.y))
  return overlap / Math.min(first.height, second.height)
}

export function estimatedGlyphAdvance(run: GeometryRun): number | null {
  if (!run.geometryComparable || !run.text.length) return null
  return run.width / run.text.length
}
