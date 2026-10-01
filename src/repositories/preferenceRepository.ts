import { requireSupabase } from '../lib/supabase'
import type { SearchPreference } from '../types'

export const preferenceRepository = {
  async getCurrent(): Promise<SearchPreference | null> {
    const { data, error } = await requireSupabase().from('job_preferences').select('*').maybeSingle()
    if (error) throw error
    if (!data) return null
    if (data.source !== '104' && data.source !== '1111') return null
    return { source: data.source, keyword: data.keyword, location: data.location || '全部地區', sortBy: data.sort_by === 'newest' ? 'newest' : 'match-desc' }
  },
  async upsert(userId: string, preference: SearchPreference): Promise<void> {
    const { error } = await requireSupabase().from('job_preferences').upsert({
      user_id: userId,
      source: preference.source,
      keyword: preference.keyword,
      location: preference.location,
      sort_by: preference.sortBy === 'newest' ? 'newest' : 'match',
    }, { onConflict: 'user_id' })
    if (error) throw error
  },
}
