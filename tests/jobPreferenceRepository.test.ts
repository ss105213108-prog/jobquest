import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SearchPreference } from '../src/types'
import type { Database } from '../src/types/database'

const db = vi.hoisted(() => ({ from: vi.fn(), read: vi.fn(), write: vi.fn() }))
vi.mock('../src/lib/supabase', () => ({ requireSupabase: () => ({ from: db.from }) }))
import { preferenceRepository } from '../src/repositories/preferenceRepository'
import { preferenceService } from '../src/services/preferenceService'

type Row = Database['public']['Tables']['job_preferences']['Row']
beforeEach(() => {
  vi.clearAllMocks()
  db.from.mockReturnValue({ select: () => ({ maybeSingle: db.read }), upsert: db.write })
  db.write.mockResolvedValue({ error: null })
  db.read.mockResolvedValue({ data: null, error: null })
})
describe('existing job_preferences mapping and service contract', () => {
  it.each(['104', '1111'] as const)('round-trips every existing preference field for source %s', async source => {
    const preference: SearchPreference = { source, keyword: 'Synthetic Keyword', location: '台中市', sortBy: 'match-desc' }
    await preferenceService.save('unit-owner', preference)
    const saved = db.write.mock.calls[0][0]
    expect(saved).toEqual({ user_id: 'unit-owner', source, keyword: preference.keyword, location: preference.location, sort_by: 'match' })
    expect(db.write.mock.calls[0][1]).toEqual({ onConflict: 'user_id' })
    db.read.mockResolvedValue({ data: { ...saved, created_at: '', updated_at: '' } satisfies Row, error: null })
    expect(await preferenceService.load()).toEqual(preference)
    expect(db.from.mock.calls.every(([table]) => table === 'job_preferences')).toBe(true)
  })
  it('round-trips newest without introducing a second preference model', async () => {
    const preference: SearchPreference = { source: '104', keyword: '', location: '全部地區', sortBy: 'newest' }
    await preferenceRepository.upsert('unit-owner', preference)
    const saved = db.write.mock.calls[0][0]
    expect(saved.sort_by).toBe('newest')
    db.read.mockResolvedValue({ data: saved, error: null })
    expect(await preferenceRepository.getCurrent()).toEqual(preference)
  })
  it('returns null for no owner row and never creates default settings', async () => {
    expect(await preferenceService.load()).toBeNull()
    expect(db.write).not.toHaveBeenCalled()
  })
  it('retains the existing empty-location and unknown-sort mapping', async () => {
    db.read.mockResolvedValue({ data: { source: '104', keyword: '', location: '', sort_by: 'legacy' }, error: null })
    expect(await preferenceRepository.getCurrent()).toEqual({ source: '104', keyword: '', location: '全部地區', sortBy: 'match-desc' })
  })
  it('does not fabricate a preference for an unsupported stored source', async () => {
    db.read.mockResolvedValue({ data: { source: 'unknown' }, error: null })
    expect(await preferenceRepository.getCurrent()).toBeNull()
    expect(db.write).not.toHaveBeenCalled()
  })
  it('propagates load failure through the existing service', async () => {
    const error = new Error('offline test failure')
    db.read.mockResolvedValue({ data: null, error })
    await expect(preferenceService.load()).rejects.toBe(error)
  })
  it('propagates owner-write failure without accessing other tables', async () => {
    const error = new Error('offline owner rejection')
    db.write.mockResolvedValue({ error })
    await expect(preferenceService.save('unit-owner', { source: '104', keyword: '', location: '全部地區', sortBy: 'match-desc' })).rejects.toBe(error)
    expect(db.from).toHaveBeenCalledExactlyOnceWith('job_preferences')
  })
})
