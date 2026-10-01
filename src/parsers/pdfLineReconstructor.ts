import {
  estimatedGlyphAdvance,
  heightRatio as measureHeightRatio,
  horizontalGap as measureHorizontalGap,
  normalizeTextRunGeometry,
  type GeometryRun,
  type PdfTextRun,
} from './pdfTextGeometry'

export type { PdfTextRun } from './pdfTextGeometry'

interface ComparableGapPair {
  leftItemIndex: number
  rightItemIndex: number
  horizontalGap: number
  gapToHeightRatio: number
  heightRatio: number
  estimatedGlyphAdvance: number | null
  gapToGlyphAdvanceRatio: number | null
  sameFontName: boolean
}

interface ExperienceAliasItemTrace {
  pageNumber: number
  itemIndex: number
  itemStringLength: number
  itemContainsExperienceAlias: boolean
  aliasPrefixLengthInsideItem: number
  x: number
  y: number
  previousX: number | null
  previousY: number | null
  numericYGap: number | null
  previousHasEOL: boolean | null
  flushBefore: boolean
  bufferItemCountBeforeAlias: number
  bufferCharCountBeforeAlias: number
}

function quantile(values: number[], position: number): number | null {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  const index = (sorted.length - 1) * position
  const lower = Math.floor(index)
  const upper = Math.ceil(index)
  if (lower === upper) return sorted[lower]
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower)
}

export function reconstructPdfPage(items: PdfTextRun[], pageNumber: number): string {
  const lines: string[] = []
  let current: string[] = []
  let previousY: number | null = null
  let tracePreviousX: number | null = null
  let tracePreviousY: number | null = null
  let tracePreviousHasEOL: boolean | null = null
  let pendingAliasTrace: ExperienceAliasItemTrace | null = null
  let geometryBuffer: GeometryRun[] = []
  const comparableGapPairs: ComparableGapPair[] = []
  let targetPairIndices: { leftItemIndex: number; rightItemIndex: number } | null = null
  const traceExperienceAlias = import.meta.env.DEV && typeof window !== 'undefined'
  const experienceAlias = '經歷'

  const flush = () => {
    const value = current.join(' ').replace(/\s+/g, ' ').trim()
    if (value) {
      const reconstructedLineIndex = lines.length + 1
      lines.push(value)
      if (pendingAliasTrace) {
        console.info('[RP-006][alias-item]', {
          ...pendingAliasTrace,
          reconstructedLineIndex,
          reconstructedPrefixLength: value.indexOf(experienceAlias),
        })
      }
    }
    pendingAliasTrace = null
    geometryBuffer = []
    current = []
  }

  let itemIndex = -1
  for (const item of items) {
    itemIndex += 1
    const geometry = normalizeTextRunGeometry(item, itemIndex)
    const { x, y } = geometry
    const numericYGap = tracePreviousY === null ? null : Math.abs(y - tracePreviousY)
    const flushBefore = previousY !== null && Math.abs(y - previousY) > 2
    if (flushBefore) flush()
    const itemText = item.str.trim()
    if (traceExperienceAlias && !pendingAliasTrace && itemText.includes(experienceAlias)) {
      const aliasGeometry = geometry
      const geometryItems = [...geometryBuffer, aliasGeometry]
      if (!targetPairIndices && geometryBuffer.length >= 2) {
        targetPairIndices = {
          leftItemIndex: geometryBuffer[0].originalIndex,
          rightItemIndex: geometryBuffer[1].originalIndex,
        }
      }
      const aliasSequenceIndex = geometryItems.length - 1
      console.info('[RP-008][horizontal-geometry]', {
        pageNumber,
        bufferItemCount: geometryBuffer.length,
        aliasItemIndex: itemIndex,
        items: geometryItems.map((geometry, index) => {
          const next = geometryItems[index + 1]
          const endX = geometry.endX
          const nextX = next?.x ?? null
          const horizontalGap = next ? measureHorizontalGap(geometry, next) : null
          return {
            relativeItemIndex: index - aliasSequenceIndex,
            itemIndex: geometry.originalIndex,
            x: geometry.x,
            y: geometry.y,
            width: geometry.width,
            height: geometry.height,
            endX,
            nextX,
            horizontalGap,
            dir: geometry.direction,
            hasEOL: geometry.hasEOL,
            geometryComparable: geometry.geometryComparable,
          }
        }),
      })
      pendingAliasTrace = {
        pageNumber,
        itemIndex,
        itemStringLength: item.str.length,
        itemContainsExperienceAlias: true,
        aliasPrefixLengthInsideItem: item.str.indexOf(experienceAlias),
        x,
        y,
        previousX: tracePreviousX,
        previousY: tracePreviousY,
        numericYGap,
        previousHasEOL: tracePreviousHasEOL,
        flushBefore,
        bufferItemCountBeforeAlias: current.length,
        bufferCharCountBeforeAlias: current.join(' ').length,
      }
    }
    if (itemText) {
      current.push(itemText)
      if (traceExperienceAlias) {
        const left = geometryBuffer[geometryBuffer.length - 1]
        const measuredGap = left ? measureHorizontalGap(left, geometry) : null
        const measuredHeightRatio = left ? measureHeightRatio(left, geometry) : null
        if (left && measuredGap !== null && measuredHeightRatio !== null) {
          const horizontalGap = measuredGap
          const averageHeight = (left.height + geometry.height) / 2
          const glyphAdvance = estimatedGlyphAdvance(left)
          comparableGapPairs.push({
            leftItemIndex: left.originalIndex,
            rightItemIndex: geometry.originalIndex,
            horizontalGap,
            gapToHeightRatio: horizontalGap / averageHeight,
            heightRatio: measuredHeightRatio,
            estimatedGlyphAdvance: glyphAdvance,
            gapToGlyphAdvanceRatio: glyphAdvance ? horizontalGap / glyphAdvance : null,
            sameFontName: left.fontName === geometry.fontName,
          })
        }
        geometryBuffer.push(geometry)
      }
    }
    previousY = y
    if (item.hasEOL) { flush(); previousY = null }
    tracePreviousX = x
    tracePreviousY = y
    tracePreviousHasEOL = item.hasEOL
  }
  flush()
  if (traceExperienceAlias && targetPairIndices) {
    const horizontalGaps = comparableGapPairs.map((pair) => pair.horizontalGap)
    const heightRatios = comparableGapPairs.map((pair) => pair.gapToHeightRatio)
    const nonZeroGaps = horizontalGaps.filter((gap) => gap !== 0)
    const target = comparableGapPairs.find((pair) => pair.leftItemIndex === targetPairIndices?.leftItemIndex && pair.rightItemIndex === targetPairIndices?.rightItemIndex)
    const targetRank = target ? horizontalGaps.filter((gap) => gap < target.horizontalGap).length + 1 : null
    const targetPercentile = target && horizontalGaps.length
      ? horizontalGaps.filter((gap) => gap <= target.horizontalGap).length / horizontalGaps.length * 100
      : null
    const medianNonZeroGap = quantile(nonZeroGaps, 0.5)
    console.info('[RP-010][page-gap-baseline]', {
      pageNumber,
      comparablePairCount: comparableGapPairs.length,
      nonZeroGapCount: nonZeroGaps.length,
      horizontalGap: {
        min: horizontalGaps.length ? Math.min(...horizontalGaps) : null,
        median: quantile(horizontalGaps, 0.5),
        p75: quantile(horizontalGaps, 0.75),
        p90: quantile(horizontalGaps, 0.9),
        p95: quantile(horizontalGaps, 0.95),
        max: horizontalGaps.length ? Math.max(...horizontalGaps) : null,
      },
      gapToHeightRatio: {
        median: quantile(heightRatios, 0.5),
        p75: quantile(heightRatios, 0.75),
        p90: quantile(heightRatios, 0.9),
        p95: quantile(heightRatios, 0.95),
      },
      target: target ? {
        horizontalGap: target.horizontalGap,
        gapToHeightRatio: target.gapToHeightRatio,
        rank: targetRank,
        percentile: targetPercentile,
        sameFontName: target.sameFontName,
        geometryComparable: true,
      } : {
        horizontalGap: null,
        gapToHeightRatio: null,
        rank: null,
        percentile: null,
        sameFontName: null,
        geometryComparable: false,
      },
      targetGapOverMedianNonZeroGap: target && medianNonZeroGap !== null && medianNonZeroGap !== 0
        ? target.horizontalGap / medianNonZeroGap
        : null,
    })

    const negativeGaps = comparableGapPairs.filter((pair) => pair.horizontalGap < 0).map((pair) => pair.horizontalGap)
    const positivePairs = comparableGapPairs.filter((pair) => pair.horizontalGap > 0)
    const positiveGaps = positivePairs.map((pair) => pair.horizontalGap)
    const sameFontPositiveGaps = positivePairs.filter((pair) => pair.sameFontName).map((pair) => pair.horizontalGap)
    const differentFontPositiveGaps = positivePairs.filter((pair) => !pair.sameFontName).map((pair) => pair.horizontalGap)
    const heightComparisonRatios = comparableGapPairs.map((pair) => pair.heightRatio)
    const summarizePositiveGaps = (values: number[]) => ({
      count: values.length,
      median: quantile(values, 0.5),
      p75: quantile(values, 0.75),
      p90: quantile(values, 0.9),
      p95: quantile(values, 0.95),
      max: values.length ? Math.max(...values) : null,
    })
    const targetPlacement = (values: number[]) => ({
      count: values.length,
      rank: target && target.horizontalGap > 0 && values.length
        ? values.filter((gap) => gap < target.horizontalGap).length + 1
        : null,
      percentile: target && target.horizontalGap > 0 && values.length
        ? values.filter((gap) => gap <= target.horizontalGap).length / values.length * 100
        : null,
      sampleInsufficient: values.length < 2,
    })

    console.info('[RP-012][refined-gap-baseline]', {
      pageNumber,
      counts: {
        totalComparablePairs: comparableGapPairs.length,
        exactZeroCount: comparableGapPairs.filter((pair) => pair.horizontalGap === 0).length,
        negativeGapCount: negativeGaps.length,
        positiveGapCount: positiveGaps.length,
        sameFontCount: comparableGapPairs.filter((pair) => pair.sameFontName).length,
        differentFontCount: comparableGapPairs.filter((pair) => !pair.sameFontName).length,
      },
      negativeGap: {
        min: negativeGaps.length ? Math.min(...negativeGaps) : null,
        median: quantile(negativeGaps, 0.5),
        max: negativeGaps.length ? Math.max(...negativeGaps) : null,
      },
      positiveGap: summarizePositiveGaps(positiveGaps),
      sameFontPositiveGap: summarizePositiveGaps(sameFontPositiveGaps),
      differentFontPositiveGap: summarizePositiveGaps(differentFontPositiveGaps),
      heightComparison: {
        comparableCount: heightComparisonRatios.length,
        heightRatioMedian: quantile(heightComparisonRatios, 0.5),
        heightRatioP90: quantile(heightComparisonRatios, 0.9),
        heightRatioP95: quantile(heightComparisonRatios, 0.95),
      },
      target: target ? {
        horizontalGap: target.horizontalGap,
        gapToHeightRatio: target.gapToHeightRatio,
        sameFontName: target.sameFontName,
        geometryComparable: true,
      } : {
        horizontalGap: null,
        gapToHeightRatio: null,
        sameFontName: null,
        geometryComparable: false,
      },
      targetInPositiveGap: targetPlacement(positiveGaps),
      targetInDifferentFontPositiveGap: targetPlacement(differentFontPositiveGaps),
    })
  }
  return lines.join('\n')
}
