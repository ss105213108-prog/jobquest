import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ResumeProfile } from '../src/types'
import type { Database } from '../src/types/database'

const db = vi.hoisted(() => ({ from: vi.fn(), read: vi.fn(), write: vi.fn() }))
vi.mock('../src/lib/supabase', () => ({ requireSupabase: () => ({ from: db.from }) }))
import { resumeRepository } from '../src/repositories/resumeRepository'

type Row = Database['public']['Tables']['resume_profiles']['Row']
const profile = (): ResumeProfile => ({
  id: 'synthetic-profile', name: 'Synthetic Candidate', skills: ['Custom Skill'],
  education: { school: '', department: 'Edited Department', graduationStatus: '' },
  workExperiences: [{ title: 'Synthetic Role', company: '', description: 'Edited work', endDate: '' }],
  projects: [{ name: 'Synthetic Project', skills: ['Custom Project Skill'], description: '' }],
  certifications: ['Custom Certificate'], careerDirections: ['Custom Direction'],
  updatedAt: '2026-09-28T00:00:00.000Z', level: 2, abilities: [{ label: 'Custom Ability', value: 45 }],
})

beforeEach(() => {
  vi.clearAllMocks()
  db.from.mockReturnValue({ select: () => ({ maybeSingle: db.read }), upsert: db.write })
  db.write.mockResolvedValue({ error: null })
  db.read.mockResolvedValue({ data: null, error: null })
})

describe('existing confirmed ResumeProfile repository mapping', () => {
  it.each([['Custom Certificate'], [], undefined])('round-trips certificates %j without a new schema', async certifications => {
    const original = { ...profile(), certifications }
    await resumeRepository.upsert('unit-owner', original)
    const [saved, options] = db.write.mock.calls[0]
    expect(options).toEqual({ onConflict: 'user_id' })
    expect(saved.user_id).toBe('unit-owner')
    expect(db.from).toHaveBeenCalledWith('resume_profiles')
    const row: Row = { ...saved, created_at: original.updatedAt, updated_at: original.updatedAt }
    db.read.mockResolvedValue({ data: row, error: null })
    expect(await resumeRepository.getCurrent()).toEqual(original)
  })
  it('returns no profile for an empty owner row rather than synthesizing Mock content', async () => {
    expect(await resumeRepository.getCurrent()).toBeNull()
  })
  it('does not invent certificates for older rows', async () => {
    const original = profile()
    delete original.certifications
    await resumeRepository.upsert('unit-owner', original)
    db.read.mockResolvedValue({ data: { ...db.write.mock.calls[0][0], updated_at: original.updatedAt }, error: null })
    expect((await resumeRepository.getCurrent())?.certifications).toBeUndefined()
  })
  it('retains only string certificates from JSON and preserves existing field semantics', async () => {
    await resumeRepository.upsert('unit-owner', profile())
    const saved = db.write.mock.calls[0][0]
    saved.parsed_data.certifications = ['Valid Certificate', null, 4]
    db.read.mockResolvedValue({ data: { ...saved, updated_at: profile().updatedAt }, error: null })
    expect((await resumeRepository.getCurrent())?.certifications).toEqual(['Valid Certificate'])
  })
  it('propagates save and restore errors without querying unrelated tables', async () => {
    db.write.mockResolvedValue({ error: new Error('save unavailable') })
    await expect(resumeRepository.upsert('unit-owner', profile())).rejects.toThrow('save unavailable')
    db.read.mockResolvedValue({ data: null, error: new Error('restore unavailable') })
    await expect(resumeRepository.getCurrent()).rejects.toThrow('restore unavailable')
    expect(db.from.mock.calls.every(([table]) => table === 'resume_profiles')).toBe(true)
  })
})
