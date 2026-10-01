import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { describe, expect, it } from 'vitest'
import { resumeAnalyzer } from '../src/analyzers/resumeAnalyzer'
import { reconstructPdfPage } from '../src/parsers/pdfLineReconstructor'
import { normalizeResumeText } from '../src/parsers/normalizeResumeText'
import { parseResumeFile } from '../src/parsers/resumeFileParser'
import type { ParsedResumeFile } from '../src/parsers/resumeParserTypes'
import { anonymousPdfLayouts, layoutById } from './fixtures/pdfReconstructionLayouts'
import { anonymousPdfFile } from './helpers/anonymousPdfFactory'
import { reconstructWithLegacyPageText } from './helpers/currentPdfPageTextHarness'

GlobalWorkerOptions.workerSrc = pathToFileURL(resolve('node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs')).href

const analyze = (text: string) => {
  const parsed: ParsedResumeFile = {
    text,
    fileName: 'anonymous-layout.pdf',
    fileType: 'pdf',
    pageCount: 1,
    parserMessages: [],
  }
  return resumeAnalyzer.analyze(parsed, normalizeResumeText(text))
}

const compactCharacterBag = (value: string) => [...value.replace(/\s/gu, '')].sort().join('')

const reconstructFixturePage = (runs: Parameters<typeof reconstructWithLegacyPageText>[0]) => reconstructPdfPage(
  runs.map((item) => ({
    str: item.text,
    transform: [1, 0, 0, 1, item.x, item.y],
    width: item.width,
    height: item.height,
    dir: item.direction,
    fontName: item.fontName,
    hasEOL: item.hasEOL,
  })),
  1,
)

describe('RP-014 anonymous geometry corpus invariants', () => {
  it.each(anonymousPdfLayouts)('$id preserves every non-empty fragment exactly once', ({ runs }) => {
    const reconstructed = reconstructFixturePage(runs)
    const input = runs.map((item) => item.text.trim()).filter(Boolean).join('')
    expect(compactCharacterBag(reconstructed)).toBe(compactCharacterBag(input))
  })

  it('matches the frozen pre-extraction pageText behavior for every representative fixture', () => {
    for (const layout of anonymousPdfLayouts) {
      expect(reconstructFixturePage(layout.runs), layout.id).toBe(reconstructWithLegacyPageText(layout.runs))
    }
  })
})

describe('RP-014 approved reconstruction behavior', () => {
  it('reconstructs a single-column resume', () => {
    const layout = layoutById('single-column')
    const reconstructed = reconstructFixturePage(layout.runs)
    expect.soft(reconstructed).toBe(layout.expectedText)

    const profile = analyze(reconstructed)
    expect(profile.name).toBe('Avery Stone')
    expect(profile.skills).toEqual(expect.arrayContaining(['React', 'TypeScript']))
    expect(profile.education.school).toBe('Example University')
  })

  it('keeps two-column sections in their own reading-order regions', () => {
    const layout = layoutById('two-column')
    const reconstructed = reconstructFixturePage(layout.runs)
    expect.soft(reconstructed).toBe(layout.expectedText)

    const profile = analyze(reconstructed)
    expect.soft(profile.skills).toEqual(expect.arrayContaining(['React', 'TypeScript']))
    expect.soft(profile.education.school).toBe('Example University')
    expect(profile.workExperiences).toHaveLength(1)
  })

  it('does not interleave sidebar content with the main experience region', () => {
    const layout = layoutById('sidebar')
    const reconstructed = reconstructFixturePage(layout.runs)
    expect.soft(reconstructed).toBe(layout.expectedText)

    const profile = analyze(reconstructed)
    expect.soft(profile.name).toBe('Morgan Lake')
    expect.soft(profile.skills).toEqual(expect.arrayContaining(['React', 'CSS', 'Git']))
    expect.soft(profile.education.school).toBe('Sample College')
    expect(profile.workExperiences).toHaveLength(1)
  })

  it('separates same-Y text that belongs to different columns', () => {
    const layout = layoutById('same-y-separate-columns')
    const reconstructed = reconstructFixturePage(layout.runs)
    expect.soft(reconstructed).toBe(layout.expectedText)
    expect.soft(reconstructed.split('\n')).toContain('Experience')
    expect(analyze(reconstructed).workExperiences).toHaveLength(1)
  })

  it('rejoins contiguous CJK heading fragments without inserting spaces', () => {
    const layout = layoutById('split-cjk-heading')
    const reconstructed = reconstructFixturePage(layout.runs)
    expect.soft(reconstructed).toBe(layout.expectedText)
    expect.soft(reconstructed.split('\n')).toContain('工作經驗')
    expect(analyze(reconstructed).workExperiences).toHaveLength(1)
  })

  it('keeps inline heading content together across a font change', () => {
    const layout = layoutById('inline-heading-content')
    const reconstructed = reconstructFixturePage(layout.runs)
    expect.soft(reconstructed).toBe(layout.expectedText)

    const profile = analyze(reconstructed)
    expect(profile.skills).toEqual(expect.arrayContaining(['React', 'TypeScript']))
    expect(profile.education.school).toBe('Example University')
  })

  it('preserves all three WorkExperience entries', () => {
    const layout = layoutById('multiple-work-experiences')
    const reconstructed = reconstructFixturePage(layout.runs)
    expect.soft(reconstructed).toBe(layout.expectedText)

    const experiences = analyze(reconstructed).workExperiences
    expect(experiences).toHaveLength(3)
    expect(experiences.map((item) => item.title)).toEqual([
      expect.stringContaining('Frontend Engineer'),
      expect.stringContaining('UI Designer'),
      expect.stringContaining('Web Developer'),
    ])
  })

  it('keeps three Project blocks separate', () => {
    const layout = layoutById('multiple-projects')
    const reconstructed = reconstructFixturePage(layout.runs)
    expect.soft(reconstructed).toBe(layout.expectedText)

    const projects = analyze(reconstructed).projects
    expect(projects).toHaveLength(3)
    expect(projects.map((item) => item.name)).toEqual(['Atlas Board', 'Beacon Portal', 'Cedar API'])
  })

  it('preserves English heading and Latin word spacing', () => {
    const layout = layoutById('english-headings')
    const reconstructed = reconstructFixturePage(layout.runs)
    expect.soft(reconstructed).toBe(layout.expectedText)
    expect.soft(reconstructed.split('\n')).toContain('Work Experience')

    const profile = analyze(reconstructed)
    expect(profile.workExperiences).toHaveLength(1)
    expect(profile.projects).toHaveLength(1)
  })
})

describe('RP-014 public PDF parser reproduction', () => {
  it('does not merge same-Y anonymous PDF fragments from separate columns', async () => {
    const file = anonymousPdfFile('anonymous-same-y-columns.pdf', [
      { text: 'Avery Stone', x: 48, y: 760 },
      { text: 'Skills', x: 48, y: 720 },
      { text: 'Experience', x: 286, y: 720 },
      { text: 'React TypeScript', x: 48, y: 698 },
      { text: 'Orbit Company - Frontend Engineer', x: 286, y: 698 },
      { text: 'Education', x: 48, y: 676 },
      { text: '2022/01 - 2024/06', x: 286, y: 676 },
      { text: 'Example University', x: 48, y: 654 },
    ])

    const parsed = await parseResumeFile(file)
    const lines = parsed.text.split('\n')
    expect.soft(lines).toContain('Skills')
    expect.soft(lines).toContain('Experience')
    expect.soft(lines.some((line) => line.includes('Skills') && line.includes('Experience'))).toBe(false)
    expect(analyze(parsed.text).workExperiences).toHaveLength(1)
  })
})
