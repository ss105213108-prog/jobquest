import type { CareerFamily, Job, MatchConfidence, ResumeProfile } from '../types'

export interface NormalizedJobRequirements {
  job: Job
  requiredSkills: string[]
  detectedSkills: string[]
  careerFamilies: CareerFamily[]
  requiredExperienceYears: number | null
  keywords: string[]
  confidence: MatchConfidence
}

export interface PreparedResumeProfile {
  resume: ResumeProfile
  skills: string[]
  skillSet: Set<string>
  careerFamilies: CareerFamily[]
  estimatedExperienceYears: number | null
  projectSkills: Set<string>
  projectText: string
}
