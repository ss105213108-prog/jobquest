import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  GlobalWorkerOptions,
  getDocument,
  type PDFPageProxy,
  type TextItem,
} from 'pdfjs-dist/legacy/build/pdf.mjs'
import { afterEach, describe, expect, it } from 'vitest'
import { normalizeTextRunGeometry } from '../src/parsers/pdfTextGeometry'
import { anonymousPdfFile } from './helpers/anonymousPdfFactory'

GlobalWorkerOptions.workerSrc = pathToFileURL(resolve('node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs')).href

const activeLoadingTasks: Array<{ destroy(): Promise<void> }> = []

afterEach(async () => {
  await Promise.all(activeLoadingTasks.splice(0).map((loadingTask) => loadingTask.destroy()))
})

async function inspectAnonymousPage(file: File): Promise<{
  page: PDFPageProxy
  item: TextItem
}> {
  const loadingTask = getDocument({ data: new Uint8Array(await file.arrayBuffer()), stopAtErrors: true })
  const document = await loadingTask.promise
  activeLoadingTasks.push(loadingTask)
  const page = await document.getPage(1)
  const content = await page.getTextContent()
  const item = content.items.find((candidate): candidate is TextItem => 'str' in candidate)
  if (!item) throw new Error('Anonymous coordinate fixture produced no TextItem')
  return { page, item }
}

const normalizedInView = (x: number, view: readonly number[]) => (x - view[0]) / (view[2] - view[0])

describe('RP-043 PDF.js page coordinate compatibility', () => {
  it('keeps horizontal TextItem geometry in page user space for an unrotated page', async () => {
    const { page, item } = await inspectAnonymousPage(anonymousPdfFile('coordinate-origin-zero.pdf', [
      { text: 'ANONYMOUS', x: 72, y: 700, fontSize: 12 },
    ]))
    const run = normalizeTextRunGeometry(item, 0)

    expect(page.view).toEqual([0, 0, 612, 792])
    expect(page.rotate).toBe(0)
    expect(page.userUnit).toBe(1)
    expect(item.transform).toEqual([12, 0, 0, 12, 72, 700])
    expect(run).toMatchObject({ x: 72, width: item.width, endX: 72 + item.width, geometryComparable: true })
    expect(normalizedInView(run.x, page.view)).toBeCloseTo(72 / 612, 12)
    expect(normalizedInView(run.endX as number, page.view)).toBeCloseTo((72 + item.width) / 612, 12)
  })

  it('uses the same nonzero page origin for page.view and TextItem coordinates', async () => {
    const { page, item } = await inspectAnonymousPage(anonymousPdfFile('coordinate-nonzero-origin.pdf', [
      { text: 'ORIGIN', x: 120, y: 900, fontSize: 10 },
    ], { mediaBox: [100, 200, 700, 1000] }))
    const run = normalizeTextRunGeometry(item, 0)
    const viewport = page.getViewport({ scale: 1 })
    const [viewportX] = viewport.convertToViewportPoint(run.x, run.y)

    expect(page.view).toEqual([100, 200, 700, 1000])
    expect(run.x).toBe(120)
    expect(viewport.rawDims).toEqual({ pageWidth: 600, pageHeight: 800, pageX: 100, pageY: 200 })
    expect(viewportX).toBe(20)
    expect(normalizedInView(run.x, page.view)).toBeCloseTo(20 / 600, 12)
    expect(viewportX / viewport.width).toBeCloseTo(normalizedInView(run.x, page.view), 12)
  })

  it('keeps TextItem geometry independent of viewport scale while viewport coordinates scale', async () => {
    const { page, item } = await inspectAnonymousPage(anonymousPdfFile('coordinate-scale.pdf', [
      { text: 'SCALE', x: 120, y: 900, fontSize: 10 },
    ], { mediaBox: [100, 200, 700, 1000] }))
    const runBeforeViewport = normalizeTextRunGeometry(item, 0)
    const viewport1 = page.getViewport({ scale: 1 })
    const viewport2 = page.getViewport({ scale: 2 })
    const [x1] = viewport1.convertToViewportPoint(runBeforeViewport.x, runBeforeViewport.y)
    const [x2] = viewport2.convertToViewportPoint(runBeforeViewport.x, runBeforeViewport.y)

    expect(viewport1.width).toBe(600)
    expect(viewport2.width).toBe(1200)
    expect(x2).toBe(x1 * 2)
    expect(x1 / viewport1.width).toBeCloseTo(x2 / viewport2.width, 12)
    expect(normalizeTextRunGeometry(item, 0)).toEqual(runBeforeViewport)
  })

  it('shows that UserUnit affects viewport scale but not page.view or TextItem user-space geometry', async () => {
    const { page, item } = await inspectAnonymousPage(anonymousPdfFile('coordinate-user-unit.pdf', [
      { text: 'USERUNIT', x: 120, y: 900, fontSize: 10 },
    ], { mediaBox: [100, 200, 700, 1000], userUnit: 2 }))
    const run = normalizeTextRunGeometry(item, 0)
    const viewport = page.getViewport({ scale: 1 })
    const [viewportX] = viewport.convertToViewportPoint(run.x, run.y)

    expect(page.userUnit).toBe(2)
    expect(page.view).toEqual([100, 200, 700, 1000])
    expect(run.x).toBe(120)
    expect(viewport.width).toBe(1200)
    expect(viewportX).toBe(40)
    expect(normalizedInView(run.x, page.view)).toBeCloseTo(viewportX / viewport.width, 12)
    expect(run.x / viewport.width).not.toBeCloseTo(normalizedInView(run.x, page.view), 12)
  })

  it('exposes page rotation separately while current GeometryRun remains unaware of visual rotation', async () => {
    const { page, item } = await inspectAnonymousPage(anonymousPdfFile('coordinate-rotation-90.pdf', [
      { text: 'ROTATED PAGE', x: 72, y: 700, fontSize: 12 },
    ], { rotate: 90 }))
    const run = normalizeTextRunGeometry(item, 0)
    const viewport = page.getViewport({ scale: 1 })
    const [visualX] = viewport.convertToViewportPoint(run.x, run.y)

    expect(page.rotate).toBe(90)
    expect(page.view).toEqual([0, 0, 612, 792])
    expect(viewport.width).toBe(792)
    expect(viewport.height).toBe(612)
    expect(item.transform).toEqual([12, 0, 0, 12, 72, 700])
    expect(run.geometryComparable).toBe(true)
    expect(visualX).toBe(700)
    expect(visualX / viewport.width).not.toBeCloseTo(normalizedInView(run.x, page.view), 12)
  })
})
