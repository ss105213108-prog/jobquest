export type JobSource = '104' | '1111'

export type MatchLevel = 'S' | 'A' | 'B' | 'C' | 'D'

export type MatchConfidence = 'high' | 'medium' | 'low'

export type CareerFamily =
  | 'frontend'
  | 'backend'
  | 'fullstack'
  | 'software'
  | 'ai'
  | 'data'
  | 'devops'
  | 'mobile'
  | 'semiconductor-software'
  | 'other'

export type JobStatus = 'favorite' | 'viewed' | 'applied' | 'rejected'

export type JobListingStatus = 'active' | 'closed'

export type SearchSort = 'match-desc' | 'newest'

export type ResumeFileType = 'pdf' | 'docx'

export type ResumeParseWarningCode =
  | 'LOW_TEXT_CONTENT'
  | 'NAME_NOT_DETECTED'
  | 'NAME_NOT_FOUND'
  | 'EDUCATION_NOT_DETECTED'
  | 'EXPERIENCE_NOT_DETECTED'
  | 'PROJECTS_NOT_DETECTED'
  | 'NO_SKILLS_FOUND'
  | 'DOCX_PARSER_WARNING'

export interface ResumeParseMetadata {
  parserVersion: 1
  source: { fileName: string; fileType: ResumeFileType; pageCount?: number }
  detectedSections: string[]
  skillAliasesMatched: Array<{ alias: string; canonical: string }>
  warnings: ResumeParseWarningCode[]
}

export interface ResumeEducation {
  school: string
  department: string
  graduationStatus: string
}

export interface WorkExperience {
  company?: string
  title: string
  location?: string
  startDate?: string
  endDate?: string
  durationText?: string
  description?: string
}

export interface ResumeProject {
  name: string
  description?: string
  skills: string[]
  tools?: string[]
}

export interface ResumeProfile {
  id: string
  name: string
  skills: string[]
  projects: ResumeProject[]
  workExperiences: WorkExperience[]
  education: ResumeEducation
  certifications?: string[]
  careerDirections: string[]
  updatedAt: string
  level: number
  abilities: Array<{ label: string; value: number }>
  parseMetadata?: ResumeParseMetadata
}

export interface Job {
  id: string
  externalId: string
  source: JobSource
  title: string
  company: string
  location: string
  salary: string
  experience: string
  category: string
  description: string
  requiredSkills: string[]
  url: string
  publishedAt: string
  collectedAt: string
  status: JobListingStatus
}

export interface JobMatch {
  jobId: string
  matchScore: number
  matchLevel: MatchLevel
  matchedSkills: string[]
  missingSkills: string[]
  matchReasons: string[]
  skillCoverage?: number
  matchConfidence?: MatchConfidence
  breakdown?: JobMatchBreakdown
}

export interface JobMatchBreakdown {
  skills: number
  career: number
  experience: number
  projects: number
  context: number
  penalty: number
}

export interface JobWithMatch {
  job: Job
  match: JobMatch
}

export interface SearchPreference {
  source: JobSource
  keyword: string
  location: string
  sortBy: SearchSort
}

export type GuildPage = 'board' | 'profile' | 'favorites' | 'history' | 'settings'

export type StatusMap = Record<string, JobStatus[]>

export interface JobActionStore {
  version: 1
  jobs: StatusMap
}

export interface JobActionHandlers {
  toggleFavorite: (jobId: string) => void | Promise<void>
  markViewed: (jobId: string) => void | Promise<void>
  markApplied: (jobId: string) => void | Promise<void>
  markRejected: (jobId: string) => void | Promise<void>
}

export type ServiceErrorCode = 'RESUME_ANALYSIS_FAILED' | 'JOB_SEARCH_FAILED' | 'MATCHING_FAILED'
