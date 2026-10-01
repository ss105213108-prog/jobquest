import type { ResumeProfile } from '../types'

/** A local, unconfirmed draft. Only the existing Review confirmation can publish it. */
export function createEmptyResumeDraft(): ResumeProfile {
  return {
    id: crypto.randomUUID(), name: '', skills: [],
    education: { school: '', department: '', graduationStatus: '' },
    workExperiences: [], projects: [], certifications: [], careerDirections: [],
    updatedAt: new Date().toISOString(), level: 1, abilities: [],
  }
}
