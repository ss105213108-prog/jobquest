import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { resumeAnalyzer } from '../src/analyzers/resumeAnalyzer'
import { detectResumeSections } from '../src/analyzers/sectionDetector'
import { normalizeResumeText } from '../src/parsers/normalizeResumeText'
import type { ParsedResumeFile } from '../src/parsers/resumeParserTypes'

function analyzeText(text: string) {
  const normalized = normalizeResumeText(text)
  const parsed: ParsedResumeFile = {
    text,
    fileName: 'anonymous-resume.pdf',
    fileType: 'pdf',
    pageCount: 1,
    parserMessages: [],
  }
  return resumeAnalyzer.analyze(parsed, normalized)
}

describe('Phase 4.1 resume parser hardening', () => {
  it('does not identify Front End as a name', () => {
    expect(analyzeText('Front End\nSkills\nHTML CSS').name).toBe('')
  })

  it('does not identify Frontend Developer as a name', () => {
    expect(analyzeText('Frontend Developer\nSkills\nJavaScript').name).toBe('')
  })

  it('allows an unresolved name instead of guessing from a resume title', () => {
    const profile = analyzeText('個人履歷\nPortfolio\n購物網站')
    expect(profile.name).toBe('')
    expect(profile.parseMetadata?.warnings).toContain('NAME_NOT_FOUND')
  })

  it('stops Education when it reaches 自傳', () => {
    const result = detectResumeSections('學歷\n測試大學 設計系\n自傳\n這些是自我介紹')
    expect(result.sections.education).toBe('測試大學 設計系')
    expect(result.sections.profile).toBe('這些是自我介紹')
  })

  it('stops Education when it reaches 關於我 or About Me', () => {
    const chinese = detectResumeSections('學歷\n測試大學\n關於我\n中文簡介')
    const english = detectResumeSections('Education\nExample University\nAbout Me\nEnglish bio')
    expect(chinese.sections.education).toBe('測試大學')
    expect(english.sections.education).toBe('Example University')
  })

  it('routes 專案介紹 content into Projects', () => {
    const result = detectResumeSections('專案介紹\nVTUBER 購物網站\n商品瀏覽與購物車')
    expect(result.sections.projects).toContain('VTUBER 購物網站')
    expect(result.sections.experience).toBeUndefined()
  })

  it('does not treat a project date range as Work Experience', () => {
    const profile = analyzeText('專案介紹\nVTUBER 購物網站 2025/7~2026/7\n技術棧：HTML JavaScript')
    expect(profile.projects[0].name).toContain('VTUBER 購物網站')
    expect(profile.workExperiences).toEqual([])
  })

  it('keeps project skills detectable through the existing dictionary', () => {
    const text = readFileSync(resolve('tests/fixtures/resume-real-anonymized.txt'), 'utf8')
    const profile = analyzeText(text)
    expect(profile.projects[0].name).toContain('VTUBER 購物網站')
    expect(profile.projects[0].description).toContain('商品瀏覽')
    expect(profile.projects[0].skills).toEqual(expect.arrayContaining(['HTML', 'SCSS', 'JavaScript', 'PHP', 'MySQL', 'GitHub']))
    expect(profile.skills).toEqual(expect.arrayContaining(['HTML', 'SCSS', 'JavaScript', 'PHP', 'MySQL', 'GitHub']))
  })

  it('parses the anonymized real-resume shape without cross-section leakage', () => {
    const text = readFileSync(resolve('tests/fixtures/resume-real-anonymized.txt'), 'utf8')
    const profile = analyzeText(text)
    expect(profile.name).toBe('')
    expect(profile.education).toEqual({ school: '測試科技大學', department: '視覺傳達系', graduationStatus: '' })
    expect(profile.workExperiences).toEqual([])
    expect(profile.projects).toHaveLength(1)
    expect(profile.projects[0].name).toContain('VTUBER 購物網站 2025/7~2026/7')
    expect(profile.careerDirections).toEqual(expect.arrayContaining(['前端開發', 'AI 應用開發']))
  })
})
