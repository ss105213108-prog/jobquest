import { describe, expect, it } from 'vitest'
import { analyzeJobRequirements } from '../src/matching/jobRequirementAnalyzer'
import { calculateJobMatch, prepareResumeForMatching } from '../src/matching/scoreCalculator'
import { sortMatchedJobs } from '../src/services/matchingService'
import type { Job, JobWithMatch, ResumeProfile } from '../src/types'
import { getMatchLevel } from '../src/utils/getMatchLevel'

const resume = (overrides: Partial<ResumeProfile> = {}): ResumeProfile => ({
  id: 'resume-test',
  name: 'Test Adventurer',
  skills: ['React', 'TypeScript', 'Git', 'REST API'],
  projects: [{ name: 'Quest Board', skills: ['React', 'TypeScript', 'Git', 'REST API'] }],
  workExperiences: [{ company: 'Example Co.', title: 'Frontend Engineer', startDate: '2022/01', endDate: '2026/09' }],
  education: { school: 'Example University', department: '', graduationStatus: '' },
  careerDirections: ['前端開發'],
  updatedAt: '2026-09-20T00:00:00.000Z',
  level: 4,
  abilities: [],
  ...overrides,
})

const job = (overrides: Partial<Job> = {}): Job => ({
  id: 'job-test',
  externalId: 'external-test',
  source: '104',
  title: 'Frontend Engineer',
  company: 'Example Co.',
  location: '台北市',
  salary: '月薪 50K',
  experience: '2 年以上',
  category: '前端',
  description: 'Build and maintain production web interfaces with the product team and review code quality.',
  requiredSkills: ['React', 'TypeScript', 'Git', 'REST API'],
  url: 'https://example.com/job',
  publishedAt: '2026-09-20T00:00:00.000Z',
  collectedAt: '2026-09-20T01:00:00.000Z',
  status: 'active',
  ...overrides,
})

const match = (profile: ResumeProfile, listing: Job) => calculateJobMatch(prepareResumeForMatching(profile), analyzeJobRequirements(listing))

describe('deterministic matching engine', () => {
  it('scores complete required-skill, career, experience, and project fit highly', () => {
    const result = match(resume(), job())
    expect(result.matchScore).toBeGreaterThanOrEqual(90)
    expect(result.matchLevel).toBe('S')
    expect(result.matchedSkills).toEqual(['React', 'TypeScript', 'Git', 'REST API'])
    expect(result.missingSkills).toEqual([])
    expect(Object.values(result.breakdown!).reduce((sum, value) => sum + value, 0)).toBe(result.matchScore)
  })

  it('does not inflate an AI job for an unrelated frontend resume', () => {
    const result = match(resume({ skills: ['React', 'TypeScript'], projects: [{ name: 'React website', skills: ['React'] }] }), job({
      title: 'AI Engineer', category: 'AI', requiredSkills: ['Python', 'PyTorch', 'LLM'], experience: '2+ years',
    }))
    expect(result.matchScore).toBeLessThan(60)
    expect(result.matchedSkills).toEqual([])
    expect(result.missingSkills).toEqual(['Python', 'PyTorch', 'LLM'])
  })

  it('never treats JavaScript as Java', () => {
    const result = match(resume({ skills: ['JavaScript'], projects: [] }), job({ requiredSkills: ['Java'], title: 'Java Developer' }))
    expect(result.matchedSkills).toEqual([])
    expect(result.missingSkills).toEqual(['Java'])
  })

  it('normalizes React.js and Postgres aliases to canonical skills', () => {
    const result = match(resume({ skills: ['React.js', 'Postgres'], projects: [{ name: 'Data UI', skills: ['React', 'PostgreSQL'] }] }), job({ requiredSkills: ['React', 'PostgreSQL'] }))
    expect(result.matchedSkills).toEqual(['React', 'PostgreSQL'])
    expect(result.missingSkills).toEqual([])
  })

  it('caps a career-aligned job when most core skills are missing', () => {
    const result = match(resume({ skills: ['React'], projects: [{ name: 'Landing Page', skills: ['React'] }] }), job({ requiredSkills: ['React', 'TypeScript', 'Next.js', 'REST API', 'Git'] }))
    expect(result.skillCoverage).toBe(20)
    expect(result.matchScore).toBeLessThanOrEqual(55)
    expect(['A', 'S']).not.toContain(result.matchLevel)
  })

  it('applies only a light penalty for a one-year experience gap', () => {
    const result = match(resume({ workExperiences: [{ title: 'Frontend Engineer', durationText: '1 年工作經驗' }] }), job({ experience: '2 年以上' }))
    expect(result.breakdown?.experience).toBe(12)
    expect(result.matchScore).toBeGreaterThanOrEqual(85)
  })

  it('marks a low-information job as low confidence and keeps the score conservative', () => {
    const result = match(resume(), job({ title: '軟體工程師', category: '軟體', description: '參與產品開發。', requiredSkills: [], experience: '未提供' }))
    expect(result.matchConfidence).toBe('low')
    expect(result.matchScore).toBeLessThanOrEqual(59)
    expect(result.matchReasons).toContain('職缺提供的技能需求較少，匹配結果參考性較低。')
  })

  it('scores a different semiconductor equipment role conservatively', () => {
    const result = match(resume(), job({ title: '半導體設備工程師', category: '半導體設備', requiredSkills: ['C++', 'Python', 'Linux'], description: '維護晶圓設備與產線控制系統。' }))
    expect(result.matchScore).toBeLessThan(60)
    expect(result.matchedSkills).toEqual([])
  })

  it('uses project evidence only for required skills actually found in projects', () => {
    const result = match(resume({ projects: [{ name: 'Design System', skills: ['CSS'] }], skills: ['React', 'TypeScript', 'Git', 'REST API', 'CSS'] }), job())
    expect(result.breakdown?.projects).toBe(0)
    expect(result.matchReasons).toContain('履歷專案中尚未找到主要技能的明確佐證')
  })

  it('returns identical output for identical inputs', () => {
    const prepared = prepareResumeForMatching(resume())
    const requirements = analyzeJobRequirements(job())
    expect(calculateJobMatch(prepared, requirements)).toEqual(calculateJobMatch(prepared, requirements))
  })

  it('keeps source neutral and normalizes RESTful API', () => {
    const from104 = match(resume(), job({ source: '104', requiredSkills: ['RESTful API'] }))
    const from1111 = match(resume(), job({ source: '1111', requiredSkills: ['REST API'] }))
    expect(from104.matchScore).toBe(from1111.matchScore)
    expect(from104.matchedSkills).toEqual(['REST API'])
  })

  it('uses score, publish date, and id as stable sort keys', () => {
    const baseMatch = match(resume(), job())
    const entries: JobWithMatch[] = [
      { job: job({ id: 'older', publishedAt: '2026-09-18T00:00:00.000Z' }), match: { ...baseMatch, jobId: 'older' } },
      { job: job({ id: 'newer', publishedAt: '2026-09-19T00:00:00.000Z' }), match: { ...baseMatch, jobId: 'newer' } },
    ]
    expect(sortMatchedJobs(entries).map((item) => item.job.id)).toEqual(['newer', 'older'])
    expect(sortMatchedJobs(entries).map((item) => item.job.id)).toEqual(['newer', 'older'])
  })

  it('keeps match-level boundaries in the shared utility', () => {
    expect([getMatchLevel(90), getMatchLevel(80), getMatchLevel(70), getMatchLevel(60), getMatchLevel(59)]).toEqual(['S', 'A', 'B', 'C', 'D'])
  })
})
