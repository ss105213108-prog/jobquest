import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../types/database'

export const EXPECTED_SUPABASE_PROJECT_REF = 'neqwkiruqfevlchiajor'
const expectedUrl = `https://${EXPECTED_SUPABASE_PROJECT_REF}.supabase.co`
const configuredUrl = import.meta.env.VITE_SUPABASE_URL?.trim()
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim()

export const supabaseConfigError = !configuredUrl || !publishableKey
  ? '缺少 Supabase 公開連線設定，請檢查 VITE_SUPABASE_URL 與 VITE_SUPABASE_PUBLISHABLE_KEY。'
  : configuredUrl !== expectedUrl
    ? 'BLOCKED: SUPABASE_TARGET_MISMATCH'
    : null

export const supabase: SupabaseClient<Database> | null = supabaseConfigError
  ? null
  : createClient<Database>(configuredUrl, publishableKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })

export function requireSupabase(): SupabaseClient<Database> {
  if (!supabase) throw new Error(supabaseConfigError ?? '目前無法建立公會雲端連線。')
  return supabase
}
