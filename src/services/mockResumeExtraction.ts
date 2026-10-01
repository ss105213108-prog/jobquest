import type { ResumeProfile } from '../types'

const MAX_SELECTION_BYTES = 10 * 1024 * 1024

export function validateMockResumeSelection(file: File): void {
  if (!file.name.toLowerCase().endsWith('.pdf') || (file.type && file.type !== 'application/pdf')) {
    throw new Error('DEMO 模式目前僅接受 PDF 檔案。')
  }
  if (file.size === 0 || file.size > MAX_SELECTION_BYTES) throw new Error('請選擇非空白、10 MB 以下的 PDF 檔案。')
}

// Metadata-only selection: never read PDF bytes or send this File anywhere.
export async function mockResumeExtraction(file: File): Promise<ResumeProfile> {
  validateMockResumeSelection(file)
  return {
    id: crypto.randomUUID(), name: 'Demo Adventurer',
    skills: ['React', 'TypeScript', 'JavaScript', 'HTML', 'CSS', 'Git', 'REST API'],
    education: { school: 'Demo University', department: 'Computer Science', graduationStatus: 'Graduated' },
    workExperiences: [{ company: 'Demo Studio', title: 'Frontend Engineer', location: '台北市',
      startDate: '2024/01', endDate: '2026/09', description: 'Synthetic web interface project.' }],
    projects: [{ name: 'Demo Quest Board', skills: ['React', 'TypeScript', 'REST API'], description: 'Synthetic local job board project.' }],
    certifications: ['DEMO Web Foundations Certificate'], careerDirections: ['前端開發', '網頁開發'],
    updatedAt: new Date().toISOString(), level: 1,
    abilities: [{ label: 'Demo 前端', value: 70 }, { label: 'Demo 協作', value: 60 }],
  }
}

export async function mockIncompleteResumeExtraction(file: File): Promise<ResumeProfile> {
  const profile = await mockResumeExtraction(file)
  return {
    ...profile,
    education: { school: '', department: '', graduationStatus: '' },
    workExperiences: [{ title: profile.workExperiences[0].title }],
    projects: [{ name: profile.projects[0].name, skills: [] }],
    certifications: [],
  }
}
