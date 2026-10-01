export type ResumeSectionKey = 'basicInfo' | 'skills' | 'projects' | 'experience' | 'education' | 'profile'

const sectionAliases: Record<ResumeSectionKey, string[]> = {
  basicInfo: ['個人基本資料', '個人資料', '基本資料', 'personal information', 'basic information', 'contact information'],
  skills: ['技能', '專長', '技術', 'skills', 'technical skills'],
  projects: ['專案', '專案介紹', '專案經歷', '作品', '作品集', '個人專案', '團隊專案', 'project', 'projects', 'portfolio'],
  experience: ['工作經驗', '工作經歷', '經歷', 'experience', 'work experience', 'work history'],
  education: ['學歷', '教育', 'education'],
  profile: ['自傳', '自我介紹', '關於我', 'about me', 'about', 'profile', 'personal profile', 'summary'],
}

const cleanHeading = (value: string) => value
  .replace(/^[#>*•\-\s]+/, '')
  .replace(/^[【\[]\s*/, '')
  .replace(/\s*[】\]]$/, '')
  .trim()
  .toLocaleLowerCase()

function matchHeading(line: string): { key: ResumeSectionKey; inline: string } | null {
  const cleaned = cleanHeading(line)
  for (const [key, aliases] of Object.entries(sectionAliases) as Array<[ResumeSectionKey, string[]]>) {
    for (const alias of [...aliases].sort((a, b) => b.length - a.length)) {
      const normalizedAlias = alias.toLocaleLowerCase()
      if (cleaned === normalizedAlias || cleaned === `${normalizedAlias}:` || cleaned === `${normalizedAlias}：`) {
        return { key, inline: '' }
      }
      const inlineMatch = cleaned.match(new RegExp(`^${normalizedAlias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*[：:]\\s*(.+)$`, 'iu'))
      if (inlineMatch) return { key, inline: line.slice(line.search(/[：:]/) + 1).trim() }
    }
  }
  return null
}

interface ExperienceHeadingTrace {
  lineIndex: number
  supportedAliasFound: true
  matchedAlias: string
  exactMatch: boolean
  startsWithAlias: boolean
  containsAlias: boolean
  colonAfterAlias: boolean
  extraPrefixLength: number
  extraSuffixLength: number
  middleDotSegmentIndex: number
  finalMatched: boolean
}

function traceExperienceHeadingCandidates(lines: string[]): void {
  if (!import.meta.env.DEV || typeof window === 'undefined') return
  const aliases = [...sectionAliases.experience]
    .map((alias) => alias.toLocaleLowerCase())
    .sort((a, b) => b.length - a.length)
  const candidates: ExperienceHeadingTrace[] = []

  lines.forEach((line, lineIndex) => {
    const hasMiddleDot = line.includes('・')
    const parts = hasMiddleDot ? line.split('・').map((part) => part.trim()).filter(Boolean) : [line]
    const directMatch = matchHeading(line)?.key === 'experience'
    const firstMatchedSegmentIndex = hasMiddleDot ? parts.findIndex((part) => matchHeading(part) !== null) : -1

    parts.forEach((part, segmentIndex) => {
      const cleaned = cleanHeading(part)
      const matchedAlias = aliases.find((alias) => cleaned.includes(alias))
      if (!matchedAlias) return
      const aliasIndex = cleaned.indexOf(matchedAlias)
      const startsWithAlias = aliasIndex === 0
      const suffix = cleaned.slice(aliasIndex + matchedAlias.length)
      const colonAfterAlias = startsWithAlias && (suffix.trimStart().startsWith(':') || suffix.trimStart().startsWith('：'))
      const segmentApplied = hasMiddleDot
        && firstMatchedSegmentIndex > 0
        && segmentIndex >= firstMatchedSegmentIndex
        && matchHeading(part)?.key === 'experience'

      candidates.push({
        lineIndex: lineIndex + 1,
        supportedAliasFound: true,
        matchedAlias,
        exactMatch: cleaned === matchedAlias,
        startsWithAlias,
        containsAlias: true,
        colonAfterAlias,
        extraPrefixLength: aliasIndex,
        extraSuffixLength: cleaned.length - aliasIndex - matchedAlias.length,
        middleDotSegmentIndex: hasMiddleDot ? segmentIndex : -1,
        finalMatched: directMatch || segmentApplied,
      })
    })
  })

  console.info('[RP-004][summary]', { experienceAliasSubstringCount: candidates.length })
  candidates.forEach((candidate) => console.info('[RP-004][heading-candidate]', candidate))
}

export function detectResumeSections(text: string) {
  const sections: Partial<Record<ResumeSectionKey, string>> = {}
  const preamble: string[] = []
  let current: ResumeSectionKey | null = null
  const lines = text.split('\n')

  traceExperienceHeadingCandidates(lines)

  for (const line of lines) {
    const heading = matchHeading(line)
    if (heading) {
      current = heading.key
      if (!(current in sections)) sections[current] = ''
      if (heading.inline) sections[current] = heading.inline
      continue
    }
    if (!line.trim()) continue
    const inlineParts = line.split(/[・]/).map((part) => part.trim()).filter(Boolean)
    const inlineHeadingIndex = inlineParts.findIndex((part) => matchHeading(part) !== null)
    if (inlineHeadingIndex > 0) {
      const beforeHeading = inlineParts.slice(0, inlineHeadingIndex).join('・')
      if (!current) preamble.push(beforeHeading)
      else sections[current] = [sections[current], beforeHeading].filter(Boolean).join('\n')
      for (const part of inlineParts.slice(inlineHeadingIndex)) {
        const partHeading = matchHeading(part)
        if (partHeading) {
          current = partHeading.key
          if (!(current in sections)) sections[current] = ''
          if (partHeading.inline) sections[current] = [sections[current], partHeading.inline].filter(Boolean).join('\n')
        } else if (current) {
          sections[current] = [sections[current], part].filter(Boolean).join('\n')
        }
      }
      continue
    }
    if (!current) preamble.push(line.trim())
    else sections[current] = [sections[current], line.trim()].filter(Boolean).join('\n')
  }

  return { sections, preamble, detectedSections: Object.keys(sections) as ResumeSectionKey[] }
}
