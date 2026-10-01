import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs'
import type { TextItem } from 'pdfjs-dist/types/src/display/api'
import { adaptPdfPageGeometry } from '../../src/parsers/pdfPageGeometry'
import { constructPageLayoutEvidence } from '../../src/parsers/pdfPageLayoutEvidence'
import { canonicalVisualGroupEvidenceSignature, type MaterializedVisualGroupGroundTruth } from './pdfVisualGroupGroundTruthHarness'
import type { VisualGroupGroundTruthFixture } from '../fixtures/pdfVisualGroupGroundTruth'

export interface MarkedGroup {
  readonly role: string
  readonly children: readonly (MarkedGroup | number)[]
}

export interface AnonymousMarkedPdfSpec {
  readonly fixture: VisualGroupGroundTruthFixture
  readonly mode: 'none' | 'bmc' | 'mcid' | 'tagged'
  readonly groups?: readonly MarkedGroup[]
  readonly markedRunIndices?: readonly number[]
  readonly emitGroupBoundaries?: boolean
  readonly mcidRunGroups?: readonly (readonly number[])[]
}

const escapePdfText = (value: string) => value.replace(/([\\()])/g, '\\$1')
const isGroup = (child: MarkedGroup | number): child is MarkedGroup => typeof child !== 'number'

export function anonymousMarkedPdfBytes(spec: AnonymousMarkedPdfSpec): Uint8Array {
  const marked = new Set(spec.markedRunIndices ?? spec.fixture.runs.map((_, index) => index))
  const mcidByRun = new Map([...marked].sort((left, right) => left - right)
    .map((runIndex, mcid) => [runIndex, mcid]))
  const text = (index: number) => {
    const item = spec.fixture.runs[index].item
    return `BT /F1 10 Tf 1 0 0 1 ${item.transform[4]} ${item.transform[5]} Tm (${escapePdfText(item.str)}) Tj ET`
  }
  const leaf = (index: number) => {
    const body = text(index)
    if (!marked.has(index) || spec.mode === 'none') return body
    if (spec.mode === 'bmc') return `/Span BMC\n${body}\nEMC`
    return `/Span << /MCID ${mcidByRun.get(index)} >> BDC\n${body}\nEMC`
  }
  const covered = new Set<number>()
  const renderGroup = (group: MarkedGroup): string => {
    const children = group.children.map((child) => {
      if (isGroup(child)) return renderGroup(child)
      if (covered.has(child)) throw new Error('Duplicate anonymous marked run')
      covered.add(child)
      return leaf(child)
    }).join('\n')
    return `/Span BMC\n${children}\nEMC`
  }
  const grouped = spec.groups?.map(renderGroup) ?? []
  const remaining = spec.fixture.runs.map((_, index) => index)
    .filter((index) => !covered.has(index)).map(leaf)
  const content = spec.mcidRunGroups
    ? spec.mcidRunGroups.map((indices, mcid) => `/Span << /MCID ${mcid} >> BDC\n${indices.map(text).join('\n')}\nEMC`).join('\n')
    : (spec.emitGroupBoundaries ? [...grouped, ...remaining]
      : spec.fixture.runs.map((_, index) => leaf(index))).join('\n')
  const tagged = spec.mode === 'tagged'
  const objects = [
    `<< /Type /Catalog /Pages 2 0 R${tagged ? ' /MarkInfo << /Marked true >> /StructTreeRoot 6 0 R' : ''} >>`,
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 800] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R${tagged ? ' /StructParents 0' : ''} >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
  ]
  if (tagged) {
    objects.push('', '')
    const parentByMcid: number[] = []
    const allocate = () => { objects.push(''); return objects.length }
    const emit = (group: MarkedGroup | number, parent: number): number => {
      const ref = allocate()
      if (typeof group === 'number') {
        const mcid = mcidByRun.get(group)
        if (mcid === undefined) throw new Error('Tagged child has no MCID')
        parentByMcid[mcid] = ref
        objects[ref - 1] = `<< /Type /StructElem /S /Span /P ${parent} 0 R /Pg 3 0 R /K ${mcid} >>`
      } else {
        if (!/^[A-Za-z]+$/.test(group.role)) throw new Error('Unsafe anonymous role')
        const children = group.children.map((child) => emit(child, ref))
        objects[ref - 1] = `<< /Type /StructElem /S /${group.role} /P ${parent} 0 R /Pg 3 0 R /K [${children.map((child) => `${child} 0 R`).join(' ')}] >>`
      }
      return ref
    }
    const roots = (spec.groups ?? []).map((group) => emit(group, 6))
    for (const index of marked) {
      if (parentByMcid[mcidByRun.get(index) as number] !== undefined) continue
      roots.push(emit(index, 6))
    }
    objects[5] = `<< /Type /StructTreeRoot /K [${roots.map((ref) => `${ref} 0 R`).join(' ')}] /ParentTree 7 0 R /ParentTreeNextKey 1 >>`
    objects[6] = `<< /Nums [0 [${parentByMcid.map((ref) => `${ref} 0 R`).join(' ')}]] >>`
  }
  let pdf = '%PDF-1.4\n'
  const offsets = [0]
  objects.forEach((body, index) => {
    offsets.push(pdf.length)
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`
  })
  const xrefOffset = pdf.length
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (const offset of offsets.slice(1)) pdf += `${String(offset).padStart(10, '0')} 00000 n \n`
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`
  return new TextEncoder().encode(pdf)
}

interface MarkNode {
  readonly children: Array<MarkNode | string>
  readonly hasMcid: boolean
  readonly id?: string
}

const sorted = (values: readonly unknown[]) => [...values]
  .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)))

export async function observeAnonymousMarkedPdf(spec: AnonymousMarkedPdfSpec) {
  const loadingTask = getDocument({ data: anonymousMarkedPdfBytes(spec), useSystemFonts: true, disableFontFace: true })
  try {
    const document = await loadingTask.promise
    const page = await document.getPage(1)
    try {
      const admission = adaptPdfPageGeometry({ view: page.view, rotate: page.rotate })
      if (!admission.ok) throw new Error(`Anonymous page admission failed: ${admission.code}`)
      const content = await page.getTextContent({ includeMarkedContent: true })
      const plainContent = await page.getTextContent()
      const items = plainContent.items.filter((item): item is TextItem => 'str' in item)
      const layout = constructPageLayoutEvidence({ items, pageBounds: admission.pageBounds, pageNumber: 1 })
      if (layout.status !== 'AVAILABLE') throw new Error(`Anonymous layout unavailable: ${layout.status}`)
      const markedTextItems = content.items.filter((item): item is TextItem => 'str' in item && item.str.trim().length > 0)
      const ranked = markedTextItems.map((item, index) => ({ index, x: item.transform[4], y: item.transform[5] }))
        .sort((left, right) => right.y - left.y || left.x - right.x)
      const canonicalRun = new Map(ranked.map((item, rank) => [item.index, `R${rank + 1}`]))
      const roots: MarkNode[] = []
      const stack: MarkNode[] = []
      const runIdsByMcid = new Map<string, string[]>()
      const eventKinds: string[] = []
      let itemIndex = 0
      for (const entry of content.items) {
        if ('str' in entry) {
          if (!entry.str.trim()) continue
          const runId = canonicalRun.get(itemIndex++) as string
          if (stack.length) stack[stack.length - 1].children.push(runId)
          for (const node of stack) {
            if (node.id) runIdsByMcid.set(node.id, [...(runIdsByMcid.get(node.id) ?? []), runId])
          }
        } else {
          eventKinds.push(entry.type)
          if (entry.type === 'endMarkedContent') {
            if (!stack.pop()) throw new Error('Unbalanced anonymous marked content')
          } else {
            const node: MarkNode = { children: [], hasMcid: entry.type === 'beginMarkedContentProps', id: entry.id }
            if (stack.length) stack[stack.length - 1].children.push(node)
            else roots.push(node)
            stack.push(node)
          }
        }
      }
      if (stack.length) throw new Error('Unclosed anonymous marked content')
      const canonicalMark = (node: MarkNode): unknown => ({
        hasMcid: node.hasMcid,
        children: sorted(node.children.map((child) => typeof child === 'string' ? child : canonicalMark(child))),
      })
      const tree = await page.getStructTree()
      const inventory = new Set<string>()
      let linkedTreeRunCount = 0
      const canonicalTree = (node: { role?: string; type?: string; id?: string; children?: readonly unknown[] }): unknown => {
        if (node.role) inventory.add(node.role)
        if (node.type === 'content') {
          const members = runIdsByMcid.get(node.id ?? '') ?? []
          linkedTreeRunCount += members.length
          return { content: sorted(members) }
        }
        return { children: sorted((node.children ?? []).map((child) => canonicalTree(child as typeof node))) }
      }
      const operators = await page.getOperatorList()
      return {
        textSignature: canonicalVisualGroupEvidenceSignature({ result: layout } as MaterializedVisualGroupGroundTruth),
        visibleTextGeometry: items.filter((item) => item.str.trim().length > 0)
          .map((item) => ({ x: item.transform[4], y: item.transform[5], width: item.width, height: item.height }))
          .sort((left, right) => right.y - left.y || left.x - right.x),
        markedSignature: {
          boundaries: sorted(roots.map(canonicalMark)),
          tree: tree ? canonicalTree(tree) : null,
        },
        semanticRoleInventory: [...inventory].sort(),
        eventKinds,
        linkedContentCount: tree ? runIdsByMcid.size : 0,
        linkedTreeRunCount,
        drawingOperatorCount: operators.fnArray.filter((op) => op === OPS.constructPath || op === OPS.paintImageXObject).length,
      }
    } finally {
      page.cleanup()
    }
  } finally {
    await loadingTask.destroy()
  }
}
