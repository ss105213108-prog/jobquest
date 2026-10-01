import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { SearchPreference } from '../src/types'

const db = vi.hoisted(() => ({ from: vi.fn(), read: vi.fn(), write: vi.fn() }))
vi.mock('../src/lib/supabase', () => ({ requireSupabase: () => ({ from: db.from }) }))
import { SearchPanel } from '../src/components/search/SearchPanel'
import { location104Map } from '../src/integrations/job104/locationMap'
import { createJobPreferencePersistence } from '../src/services/jobPreferencePersistence'
import { preferenceService } from '../src/services/preferenceService'

const defaults: SearchPreference = { source: '104', keyword: '', location: '全部地區', sortBy: 'match-desc' }
beforeEach(() => {
  vi.clearAllMocks()
  db.from.mockReturnValue({ select: () => ({ maybeSingle: db.read }), upsert: db.write })
  db.read.mockResolvedValue({ data: null, error: null })
  db.write.mockResolvedValue({ error: null })
})

describe('region labels round-trip through the frozen preference controller/service/repository', () => {
  it.each(Object.keys(location104Map))('explicitly saves and restores %s into a fresh SearchPanel without normalization', async location => {
    const preference: SearchPreference = { ...defaults, keyword: '前端工程師', location }
    const saveLocal = vi.fn(async (_value: SearchPreference) => {})
    const saving = createJobPreferencePersistence(saveLocal, defaults, () => {}, preferenceService)
    await saving.start('unit-owner')
    expect(db.write).not.toHaveBeenCalled()
    await saving.save(preference)
    expect(saveLocal).toHaveBeenCalledExactlyOnceWith(preference)
    expect(db.write).toHaveBeenCalledExactlyOnceWith({
      user_id: 'unit-owner', source: '104', keyword: '前端工程師', location, sort_by: 'match',
    }, { onConflict: 'user_id' })
    const savedRow = db.write.mock.calls[0][0]
    saving.discard()

    // Fresh controller and fresh render model the existing reload restore seam,
    // with repository I/O mocked; this is not a live DB or browser F5 acceptance.
    db.read.mockResolvedValue({ data: savedRow, error: null })
    let restored = { ...defaults }
    const restoring = createJobPreferencePersistence(async value => { restored = value }, defaults, () => {}, preferenceService)
    await restoring.start('unit-owner')
    expect(restored).toEqual(preference)
    expect(db.write).toHaveBeenCalledTimes(1)
    expect(db.from.mock.calls.every(([table]) => table === 'job_preferences')).toBe(true)
    const html = renderToStaticMarkup(<SearchPanel keyword={restored.keyword} location={restored.location} onSearch={() => {}} />)
    expect(html).toContain(`<option value="${location}" selected="">${location}</option>`)
    expect(html).toContain('value="前端工程師"')
  })
})
