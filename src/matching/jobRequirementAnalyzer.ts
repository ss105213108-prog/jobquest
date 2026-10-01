import type { Job, MatchConfidence } from '../types'
import { detectCareerFamilies } from './careerMatcher'
import { parseRequiredExperienceYears } from './experienceMatcher'
import { detectCanonicalSkills, normalizeRequiredSkills } from './skillMatcher'
import type { NormalizedJobRequirements } from './types'

const keywords = (value: string) => [...new Set(value.normalize('NFKC').toLocaleLowerCase('zh-Hant').split(/[^\p{L}\p{N}+#.]+/u).filter((item) => item.length >= 2))]

function getConfidence(job: Job, requiredSkills: string[], detectedSkills: string[], requiredExperienceYears: number | null): MatchConfidence {
  if (!requiredSkills.length && detectedSkills.length < 2) return 'low'
  let signals = 0
  if (requiredSkills.length >= 3) signals += 2
  else if (requiredSkills.length) signals += 1
  if (job.description.trim().length >= 50) signals += 1
  if (detectCareerFamilies(job.title, job.category).some((family) => family !== 'other')) signals += 1
  if (requiredExperienceYears !== null) signals += 1
  return signals >= 5 ? 'high' : signals >= 3 ? 'medium' : 'low'
}

export function analyzeJobRequirements(job: Job): NormalizedJobRequirements {
  const requiredSkills = normalizeRequiredSkills(job.requiredSkills)
  const allDetected = detectCanonicalSkills(`${job.title}\n${job.description}`)
  const detectedSkills = allDetected.filter((skill) => !requiredSkills.includes(skill))
  const careerFamilies = detectCareerFamilies(job.title, job.category)
  const requiredExperienceYears = parseRequiredExperienceYears(job.experience)
  return {
    job,
    requiredSkills,
    detectedSkills,
    careerFamilies,
    requiredExperienceYears,
    keywords: keywords(`${job.title} ${job.category}`),
    confidence: getConfidence(job, requiredSkills, detectedSkills, requiredExperienceYears),
  }
}
