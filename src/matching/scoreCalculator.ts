import type { JobMatch, JobMatchBreakdown, ResumeProfile } from '../types'
import { getMatchLevel } from '../utils/getMatchLevel'
import { scoreCareerFit } from './careerMatcher'
import { estimateResumeExperienceYears, scoreExperienceFit } from './experienceMatcher'
import { getSkillCoverage, normalizeResumeSkills, detectCanonicalSkills } from './skillMatcher'
import type { NormalizedJobRequirements, PreparedResumeProfile } from './types'
import { detectResumeCareerFamilies } from './careerMatcher'

export const MATCH_WEIGHTS = Object.freeze({ skills: 55, career: 15, experience: 15, projects: 10, context: 5 })

export const COVERAGE_CEILINGS = Object.freeze([
  { below: 0.25, ceiling: 55 },
  { below: 0.5, ceiling: 69 },
  { below: 0.7, ceiling: 79 },
])

const clampScore = (value: number) => Math.max(0, Math.min(100, Math.round(value)))

export function prepareResumeForMatching(resume: ResumeProfile): PreparedResumeProfile {
  const skills = normalizeResumeSkills(resume)
  const projectText = resume.projects.map((project) => [project.name, project.description, ...project.skills].filter(Boolean).join(' ')).join('\n')
  const experienceText = resume.workExperiences.map((item) => {
    const dates = item.startDate && item.endDate ? `${item.startDate}~${item.endDate}` : item.startDate || item.endDate
    return [item.company, item.title, item.location, dates, item.durationText, item.description].filter(Boolean).join(' ')
  }).join('\n')
  return {
    resume,
    skills,
    skillSet: new Set(skills),
    careerFamilies: detectResumeCareerFamilies(resume, skills),
    estimatedExperienceYears: estimateResumeExperienceYears(experienceText, resume.updatedAt),
    projectSkills: new Set(detectCanonicalSkills(projectText)),
    projectText: projectText.toLocaleLowerCase('zh-Hant'),
  }
}

function getScoreCeiling(coverage: number | null, confidence: NormalizedJobRequirements['confidence']) {
  let ceiling = coverage === null ? 59 : COVERAGE_CEILINGS.find((rule) => coverage < rule.below)?.ceiling ?? 100
  if (confidence === 'low') ceiling = Math.min(ceiling, 59)
  if (confidence === 'medium') ceiling = Math.min(ceiling, 89)
  return ceiling
}

function careerReason(relationship: ReturnType<typeof scoreCareerFit>['relationship']) {
  if (relationship === 'exact') return '履歷職涯方向與職缺角色一致'
  if (relationship === 'related') return '履歷職涯方向與職缺角色具有關聯'
  if (relationship === 'different') return '履歷職涯方向與職缺角色差異較大'
  return '職涯方向資料不足，採中性評估'
}

function experienceReason(result: ReturnType<typeof scoreExperienceFit>, resumeYears: number | null, requiredYears: number | null) {
  if (result.state === 'open') return '職缺經歷不拘，不扣除年資分數'
  if (result.state === 'unknown-requirement') return '職缺未提供明確年資，年資採中性評估'
  if (result.state === 'unknown-resume') return `職缺要求 ${requiredYears} 年經驗，履歷年資無法可靠判斷`
  if (result.state === 'meets') return `履歷約 ${resumeYears} 年經驗，符合職缺 ${requiredYears} 年要求`
  return `職缺要求 ${requiredYears} 年經驗，目前履歷約 ${resumeYears} 年`
}

function buildReasons(
  requirements: NormalizedJobRequirements,
  matchedSkills: string[],
  missingSkills: string[],
  coverage: number | null,
  career: ReturnType<typeof scoreCareerFit>,
  experience: ReturnType<typeof scoreExperienceFit>,
  resumeYears: number | null,
  evidencedSkills: string[],
) {
  const reasons: string[] = []
  if (coverage === null) reasons.push('職缺未提供明確主要技能，技能匹配採保守計分')
  else reasons.push(`${matchedSkills.length} / ${requirements.requiredSkills.length} 項主要技能符合`)
  reasons.push(careerReason(career.relationship))
  reasons.push(experienceReason(experience, resumeYears, requirements.requiredExperienceYears))
  if (evidencedSkills.length) reasons.push(`履歷專案中有 ${evidencedSkills.slice(0, 3).join(' / ')} 實作紀錄`)
  else if (requirements.requiredSkills.length) reasons.push('履歷專案中尚未找到主要技能的明確佐證')
  if (missingSkills.length) reasons.push(`仍需補強 ${missingSkills.slice(0, 4).join(' / ')}`)
  if (requirements.confidence === 'low') reasons.push('職缺提供的技能需求較少，匹配結果參考性較低。')
  return reasons
}

export function calculateJobMatch(prepared: PreparedResumeProfile, requirements: NormalizedJobRequirements): JobMatch {
  const { matchedSkills, missingSkills, coverage } = getSkillCoverage(prepared.skillSet, requirements.requiredSkills)
  const skills = coverage === null ? 0 : Math.round(MATCH_WEIGHTS.skills * coverage)
  const careerResult = scoreCareerFit(prepared.careerFamilies, requirements.careerFamilies)
  const experienceResult = scoreExperienceFit(prepared.estimatedExperienceYears, requirements.requiredExperienceYears)
  const evidencedSkills = matchedSkills.filter((skill) => prepared.projectSkills.has(skill))
  const projects = requirements.requiredSkills.length
    ? Math.round(MATCH_WEIGHTS.projects * evidencedSkills.length / requirements.requiredSkills.length)
    : 0
  const contextualMatches = requirements.detectedSkills.filter((skill) => prepared.skillSet.has(skill))
  const context = Math.min(MATCH_WEIGHTS.context, contextualMatches.length * 2)
  const rawScore = skills + careerResult.score + experienceResult.score + projects + context
  let ceiling = getScoreCeiling(coverage, requirements.confidence)
  const qualifiesForExceptionalScore = coverage !== null && coverage >= 0.95 && careerResult.score >= 12 && experienceResult.score >= 12 && projects >= 7
  if (!qualifiesForExceptionalScore) ceiling = Math.min(ceiling, 94)
  const matchScore = clampScore(Math.min(rawScore, ceiling))
  const breakdown: JobMatchBreakdown = {
    skills,
    career: careerResult.score,
    experience: experienceResult.score,
    projects,
    context,
    penalty: matchScore - rawScore,
  }

  return {
    jobId: requirements.job.id,
    matchScore,
    matchLevel: getMatchLevel(matchScore),
    matchedSkills,
    missingSkills,
    matchReasons: buildReasons(requirements, matchedSkills, missingSkills, coverage, careerResult, experienceResult, prepared.estimatedExperienceYears, evidencedSkills),
    skillCoverage: coverage === null ? 0 : Math.round(coverage * 100),
    matchConfidence: requirements.confidence,
    breakdown,
  }
}

export function createConservativeMatch(jobId: string): JobMatch {
  return {
    jobId,
    matchScore: 0,
    matchLevel: getMatchLevel(0),
    matchedSkills: [],
    missingSkills: [],
    matchReasons: ['職缺需求資料無法完整分析，本次採保守評估。'],
    skillCoverage: 0,
    matchConfidence: 'low',
    breakdown: { skills: 0, career: 0, experience: 0, projects: 0, context: 0, penalty: 0 },
  }
}
