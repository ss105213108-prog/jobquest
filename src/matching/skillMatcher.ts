import { detectSkills, normalizeSkillList } from '../data/skillDictionary'
import type { ResumeProfile } from '../types'

export function normalizeRequiredSkills(values: string[]): string[] {
  return normalizeSkillList(values)
}

export function detectCanonicalSkills(text: string): string[] {
  return detectSkills(text).skills
}

export function normalizeResumeSkills(resume: ResumeProfile): string[] {
  return normalizeSkillList(resume.skills)
}

export function getSkillCoverage(resumeSkills: Set<string>, requiredSkills: string[]) {
  const matchedSkills = requiredSkills.filter((skill) => resumeSkills.has(skill))
  const missingSkills = requiredSkills.filter((skill) => !resumeSkills.has(skill))
  const coverage = requiredSkills.length ? matchedSkills.length / requiredSkills.length : null
  return { matchedSkills, missingSkills, coverage }
}
