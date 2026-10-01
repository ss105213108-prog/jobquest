import { requireSupabase } from '../lib/supabase'
import { detectSkills } from '../data/skillDictionary'
import type { ResumeEducation, ResumeParseMetadata, ResumeProfile, ResumeProject, WorkExperience } from '../types'
import type { Json } from '../types/database'

const stringArray = (value: Json): string[] => Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

const parseEducation = (value: Json | null): ResumeEducation => {
  if (isRecord(value)) return {
    school: typeof value.school === 'string' ? value.school : '',
    department: typeof value.department === 'string' ? value.department : '',
    graduationStatus: typeof value.graduationStatus === 'string' ? value.graduationStatus : '',
  }
  return { school: typeof value === 'string' ? value : '', department: '', graduationStatus: '' }
}

const parseWorkExperiences = (value: Json | null): WorkExperience[] => {
  if (typeof value === 'string') return value.trim() ? [{ title: value }] : []
  if (!Array.isArray(value)) return []
  return value.flatMap((item): WorkExperience[] => {
    if (!isRecord(item) || typeof item.title !== 'string' || !item.title.trim()) return []
    return [{
      title: item.title,
      ...(typeof item.company === 'string' ? { company: item.company } : {}),
      ...(typeof item.location === 'string' ? { location: item.location } : {}),
      ...(typeof item.startDate === 'string' ? { startDate: item.startDate } : {}),
      ...(typeof item.endDate === 'string' ? { endDate: item.endDate } : {}),
      ...(typeof item.durationText === 'string' ? { durationText: item.durationText } : {}),
      ...(typeof item.description === 'string' ? { description: item.description } : {}),
    }]
  })
}

const parseProjects = (value: Json): ResumeProject[] => {
  if (!Array.isArray(value)) return []
  return value.flatMap((item): ResumeProject[] => {
    if (typeof item === 'string') return item.trim() ? [{ name: item, skills: detectSkills(item).skills }] : []
    if (!isRecord(item) || typeof item.name !== 'string' || !item.name.trim()) return []
    if ('tools' in item && (!Array.isArray(item.tools) || !item.tools.every(tool => typeof tool === 'string'))) {
      throw new Error('無法還原專案開發工具資料。')
    }
    return [{
      name: item.name,
      skills: Array.isArray(item.skills) ? item.skills.filter((skill): skill is string => typeof skill === 'string') : [],
      ...(typeof item.description === 'string' ? { description: item.description } : {}),
      ...('tools' in item ? { tools: [...item.tools as string[]] } : {}),
    }]
  })
}

const parseMetadata = (value: Json | undefined): ResumeParseMetadata | undefined => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  if (value.parserVersion !== 1 || !value.source || typeof value.source !== 'object' || Array.isArray(value.source)) return undefined
  if (typeof value.source.fileName !== 'string' || (value.source.fileType !== 'pdf' && value.source.fileType !== 'docx')) return undefined
  return value as unknown as ResumeParseMetadata
}

export const resumeRepository = {
  async getCurrent(): Promise<ResumeProfile | null> {
    const { data, error } = await requireSupabase().from('resume_profiles').select('*').maybeSingle()
    if (error) throw error
    if (!data) return null
    const parsed = data.parsed_data && typeof data.parsed_data === 'object' && !Array.isArray(data.parsed_data) ? data.parsed_data : {}
    const abilities = Array.isArray(parsed.abilities) ? parsed.abilities.filter((item): item is { label: string; value: number } => item !== null && typeof item === 'object' && 'label' in item && 'value' in item && typeof item.label === 'string' && typeof item.value === 'number') : []
    return {
      id: typeof parsed.id === 'string' ? parsed.id : `resume-${data.user_id}`,
      name: data.name,
      skills: stringArray(data.skills),
      projects: parseProjects(data.projects),
      workExperiences: parseWorkExperiences(data.experience),
      education: parseEducation(data.education),
      careerDirections: stringArray(data.career_directions),
      ...(Array.isArray(parsed.certifications) ? { certifications: stringArray(parsed.certifications) } : {}),
      level: typeof parsed.level === 'number' ? parsed.level : 1,
      abilities,
      parseMetadata: parseMetadata(parsed.parseMetadata),
      updatedAt: data.updated_at,
    }
  },
  async upsert(userId: string, profile: ResumeProfile): Promise<void> {
    const { error } = await requireSupabase().from('resume_profiles').upsert({
      user_id: userId,
      name: profile.name,
      skills: profile.skills,
      projects: profile.projects as unknown as Json,
      experience: profile.workExperiences as unknown as Json,
      education: profile.education as unknown as Json,
      career_directions: profile.careerDirections,
      parsed_data: { id: profile.id, level: profile.level, abilities: profile.abilities, ...(profile.certifications !== undefined ? { certifications: profile.certifications } : {}), ...(profile.parseMetadata ? { parseMetadata: profile.parseMetadata as unknown as Json } : {}) },
    }, { onConflict: 'user_id' })
    if (error) throw error
  },
}
