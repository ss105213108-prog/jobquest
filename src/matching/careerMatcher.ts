import { skillDictionary } from '../data/skillDictionary'
import type { CareerFamily, ResumeProfile } from '../types'

const familyPatterns: Array<[CareerFamily, RegExp]> = [
  ['semiconductor-software', /半導體.*(?:軟體|software)|(?:軟體|software).*半導體|semiconductor.*software/iu],
  ['fullstack', /全端|full[\s-]*stack/iu],
  ['frontend', /前端|front[\s-]*end|web (?:developer|engineer)|網頁(?:開發|工程)/iu],
  ['backend', /後端|back[\s-]*end|server[\s-]*side/iu],
  ['ai', /(?:^|\s)AI(?:\s|$)|人工智慧|machine learning|生成式/iu],
  ['data', /資料(?:工程|分析|平台)|data (?:engineer|analyst|scientist|platform)/iu],
  ['devops', /devops|sre|site reliability|雲端工程|cloud engineer/iu],
  ['mobile', /行動(?:應用|開發)|mobile|ios|android/iu],
  ['software', /軟體|software|developer|engineer|程式/iu],
]

export function detectCareerFamilies(title: string, category = ''): CareerFamily[] {
  const titleMatches = familyPatterns.filter(([, pattern]) => pattern.test(title)).map(([family]) => family)
  if (titleMatches.length) return [...new Set(titleMatches)]
  const categoryMatches = familyPatterns.filter(([, pattern]) => pattern.test(category)).map(([family]) => family)
  return categoryMatches.length ? [...new Set(categoryMatches)] : ['other']
}

function directionFamilies(directions: string[]): CareerFamily[] {
  return directions.flatMap((direction) => detectCareerFamilies(direction)).filter((family) => family !== 'other')
}

export function detectResumeCareerFamilies(resume: ResumeProfile, skills: string[]): CareerFamily[] {
  const families = new Set<CareerFamily>(directionFamilies(resume.careerDirections))
  const countGroup = (group: 'frontend' | 'backend' | 'database' | 'cloud' | 'tools' | 'ai-data') =>
    skills.filter((skill) => skillDictionary.find((item) => item.canonical === skill)?.group === group).length
  const frontend = countGroup('frontend')
  const backend = countGroup('backend')
  const data = countGroup('ai-data')

  if (frontend >= 3) families.add('frontend')
  if (backend >= 2) families.add('backend')
  if (frontend >= 2 && backend >= 2) families.add('fullstack')
  if (data >= 2 && skills.some((skill) => ['Pandas', 'NumPy', 'Airflow', 'BigQuery', 'SQL'].includes(skill))) families.add('data')
  if (skills.some((skill) => ['AI', 'LLM', 'PyTorch', 'OpenAI API'].includes(skill))) families.add('ai')
  return families.size ? [...families] : ['other']
}

const relatedFamilies: Record<CareerFamily, CareerFamily[]> = {
  frontend: ['fullstack', 'software', 'mobile'],
  backend: ['fullstack', 'software', 'devops', 'data'],
  fullstack: ['frontend', 'backend', 'software'],
  software: ['frontend', 'backend', 'fullstack', 'mobile', 'semiconductor-software'],
  ai: ['data', 'software'],
  data: ['ai', 'backend', 'software'],
  devops: ['backend', 'software'],
  mobile: ['frontend', 'software'],
  'semiconductor-software': ['software'],
  other: [],
}

export function scoreCareerFit(resumeFamilies: CareerFamily[], jobFamilies: CareerFamily[]) {
  const knownResume = resumeFamilies.filter((family) => family !== 'other')
  const knownJob = jobFamilies.filter((family) => family !== 'other')
  if (!knownResume.length || !knownJob.length) return { score: 7, relationship: 'unknown' as const }
  if (knownJob.some((family) => knownResume.includes(family))) return { score: 15, relationship: 'exact' as const }
  if (knownJob.some((jobFamily) => knownResume.some((resumeFamily) => relatedFamilies[jobFamily].includes(resumeFamily)))) {
    return { score: 9, relationship: 'related' as const }
  }
  return { score: 1, relationship: 'different' as const }
}
