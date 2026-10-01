import { describe, expect, it } from 'vitest'
import {
  InvalidSerializedDocument, projectSourceDocumentDiagnostic, resumeSourceDocumentIssues,
  resumeSourcePageIssues, resumeSourceUnitIssues, toResumeSourceDocument,
} from '../src/parsers/resumeSourceDocument'
import type { SerializedDocument } from '../src/parsers/pdfSerialization'
import { admitted } from './helpers/resumeSourceDocumentContractHarness'

describe('RP-105 source-document production foundation', () => {
  it('validates standalone units/pages and exact source correspondence', () => {
    const { source, serialized } = admitted([' exact '])
    const page = source.pages[0]
    const sourcePage = serialized.pages[0]
    if (!page || !sourcePage) throw new Error('Invalid fixture')
    expect(resumeSourceUnitIssues(page.units[0])).toEqual([])
    expect(resumeSourcePageIssues(page, sourcePage)).toEqual([])
    expect(resumeSourceUnitIssues({ text: '', provenance: { pageNumber: 0, groupId: 'a', runId: 0 } }))
      .toContain('INVALID_SOURCE_UNIT')
    expect(resumeSourceUnitIssues({ text: '', provenance: { pageNumber: 1, groupId: 'a', runId: '0' } }))
      .toContain('INVALID_SOURCE_UNIT')
    expect(resumeSourcePageIssues({ ...page, units: [] }, sourcePage)).toContain('PAGE_OR_UNIT_COMPLETENESS')
    expect(resumeSourcePageIssues({ ...page, units: [page.units[0], page.units[0]] })).toContain('DUPLICATE_SOURCE_UNIT')
  })

  it('does not admit a plausible but fabricated provenance or duplicate canonical run', () => {
    const { pageManifest, serialized, source } = admitted(['text'])
    const unit = source.pages[0]?.units[0]
    if (!unit) throw new Error('Invalid fixture')
    expect(resumeSourceDocumentIssues(pageManifest, serialized, { sourceKind: 'PDF', pages: [{
      pageNumber: 1, units: [{ ...unit, provenance: { ...unit.provenance, groupId: 'foreign' } }],
    }] })).toContain('UNIT_OR_PROVENANCE_MISMATCH')
    expect(resumeSourcePageIssues({ pageNumber: 1, units: [unit,
      { ...unit, provenance: { ...unit.provenance, groupId: 'other' } }] })).toContain('DUPLICATE_SOURCE_UNIT')
  })

  it('rejects runtime bypass without exposing exception content or adding evidence states', () => {
    const { pageManifest, entries } = admitted(['text'])
    const malformed = { get pages() { throw new Error('private@example.invalid C:\\private\\resume.pdf') } }
    expect(() => toResumeSourceDocument(pageManifest, entries, malformed as unknown as SerializedDocument))
      .toThrow(InvalidSerializedDocument)
    try {
      toResumeSourceDocument(pageManifest, entries, malformed as unknown as SerializedDocument)
    } catch (error) {
      expect((error as Error).message).toBe('INVALID_SERIALIZED_DOCUMENT')
      expect(error).not.toHaveProperty('status')
      expect(error).not.toHaveProperty('cause')
    }
    expect(resumeSourceUnitIssues(null)).not.toEqual([])
    expect(resumeSourcePageIssues(undefined)).not.toEqual([])
  })

  it('projects safe diagnostics even when a malformed getter throws', () => {
    const { pageManifest, serialized } = admitted(['private@example.invalid'])
    const malformed = { sourceKind: 'PDF', get pages() { throw new Error('private@example.invalid') } }
    expect(projectSourceDocumentDiagnostic(pageManifest, serialized, malformed))
      .toEqual({ code: 'INVALID_SOURCE_DOCUMENT' })
  })

  it('works on frozen source pages and creates isolated page/unit/provenance objects', () => {
    const { pageManifest, entries, serialized } = admitted(['text'])
    for (const page of serialized.pages) {
      page.orderedUnits.forEach(Object.freeze)
      Object.freeze(page.orderedUnits)
      Object.freeze(page)
    }
    Object.freeze(serialized.pages)
    Object.freeze(serialized)
    const first = toResumeSourceDocument(pageManifest, entries, serialized)
    const second = toResumeSourceDocument(pageManifest, entries, serialized)
    expect(first).toEqual(second)
    expect(first.pages).not.toBe(second.pages)
    expect(first.pages[0]?.units[0]?.provenance).not.toBe(second.pages[0]?.units[0]?.provenance)
    const unit = first.pages[0]?.units[0]
    if (!unit) throw new Error('Invalid fixture')
    ;(unit as { text: string }).text = 'changed output'
    expect(serialized.pages[0]?.orderedUnits[0]?.text).toBe('text')
    expect(second.pages[0]?.units[0]?.text).toBe('text')
  })
})
