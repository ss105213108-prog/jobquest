const openRequirement = /經歷不拘|經驗不拘|無經驗可|entry[\s-]*level|no experience/iu

export function parseRequiredExperienceYears(value: string): number | null {
  const normalized = value.normalize('NFKC').trim()
  if (!normalized) return null
  if (openRequirement.test(normalized) || /^0\s*(?:年|years?)/iu.test(normalized)) return 0
  const match = normalized.match(/(\d+(?:\.\d+)?)\s*(?:年|\+\s*years?|years?\s*\+)/iu)
  return match ? Number(match[1]) : null
}

export function estimateResumeExperienceYears(value: string, updatedAt: string): number | null {
  const normalized = value.normalize('NFKC')
  const reference = new Date(updatedAt)
  const referenceYear = Number.isNaN(reference.getTime()) ? null : reference.getUTCFullYear()
  const referenceMonth = Number.isNaN(reference.getTime()) ? null : reference.getUTCMonth() + 1
  const durations: number[] = []
  const rangePattern = /((?:19|20)\d{2})(?:[/.\-](\d{1,2}))?\s*(?:-|–|—|~|至)\s*(?:((?:19|20)\d{2})(?:[/.\-](\d{1,2}))?|(present|current|now|至今))/giu
  for (const match of normalized.matchAll(rangePattern)) {
    const startYear = Number(match[1])
    const startMonth = Number(match[2] ?? 1)
    const endYear = match[5] ? referenceYear : Number(match[3])
    const endMonth = match[5] ? referenceMonth : Number(match[4] ?? 12)
    if (endYear === null || endMonth === null || endYear < startYear) continue
    const months = (endYear - startYear) * 12 + endMonth - startMonth
    if (months >= 0) durations.push(months / 12)
  }
  if (durations.length) return Math.round(Math.max(...durations) * 10) / 10
  const explicit = normalized.match(/(\d+(?:\.\d+)?)\s*(?:年(?:工作)?經驗|years?\s+(?:of\s+)?experience)/iu)
  return explicit ? Number(explicit[1]) : null
}

export function scoreExperienceFit(resumeYears: number | null, requiredYears: number | null) {
  if (requiredYears === null) return { score: 8, difference: null, state: 'unknown-requirement' as const }
  if (requiredYears === 0) return { score: 15, difference: 0, state: 'open' as const }
  if (resumeYears === null) return { score: 8, difference: null, state: 'unknown-resume' as const }
  const difference = Math.max(0, requiredYears - resumeYears)
  if (difference === 0) return { score: 15, difference, state: 'meets' as const }
  if (difference <= 1) return { score: 12, difference, state: 'slight-gap' as const }
  if (difference <= 3) return { score: 7, difference, state: 'gap' as const }
  return { score: 3, difference, state: 'large-gap' as const }
}
