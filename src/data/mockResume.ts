import type { ResumeProfile } from '../types'

export const mockResume: ResumeProfile = {
  id: 'resume-demo-001',
  name: '王小明',
  careerDirections: ['前端開發', '網頁開發', 'Junior Full Stack'],
  level: 7,
  skills: ['HTML', 'CSS', 'JavaScript', 'TypeScript', 'React', 'Git', 'REST API', 'PHP', 'MySQL', 'Supabase'],
  projects: [
    { name: '電商網站', skills: ['HTML', 'CSS', 'JavaScript', 'PHP', 'MySQL'] },
    { name: '前端 SPA', skills: ['TypeScript', 'React', 'REST API'] },
  ],
  workExperiences: [{ title: 'Junior / Entry Level' }],
  education: { school: '', department: '資訊相關科系', graduationStatus: '' },
  updatedAt: '2026-09-19T10:00:00.000Z',
  abilities: [
    { label: '前端開發', value: 84 },
    { label: 'API 串接', value: 76 },
    { label: '資料庫', value: 65 },
    { label: 'Git / 協作', value: 62 },
  ],
}
