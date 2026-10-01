import { createClient } from '@supabase/supabase-js'

export const EXPECTED_SUPABASE_URL = 'https://neqwkiruqfevlchiajor.supabase.co'
export const AUTH_TIMEOUT_MS = 8_000

export function createUserAuthenticator(url: string | undefined, publicKey: string | undefined, authFetch: typeof fetch) {
  return async (token: string): Promise<string | null> => {
    if (url !== EXPECTED_SUPABASE_URL || !publicKey) return null
    const client = createClient(url, publicKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { fetch: (input, init) => authFetch(input, { ...init, signal: AbortSignal.timeout(AUTH_TIMEOUT_MS) }) },
    })
    try {
      const { data, error } = await client.auth.getUser(token)
      return !error && data.user?.id && data.user.role === 'authenticated' ? data.user.id : null
    } catch { return null }
  }
}
