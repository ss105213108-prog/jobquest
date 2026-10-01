import type { User } from '@supabase/supabase-js'
import { requireSupabase } from '../lib/supabase'
import { deriveSyntheticIdentifier } from './authIdentity'

// Only in-flight reads are shared. A successful identity must not survive logout.
let initializationPromise: Promise<{ user: User | null }> | null = null

export const authService = {
  initialize(): Promise<{ user: User | null }> {
    if (initializationPromise) return initializationPromise
    const reading = (async () => {
      const client = requireSupabase()
      const { data: existing, error: sessionError } = await client.auth.getSession()
      if (sessionError) throw sessionError
      if (!existing.session) return { user: null }
      const verified = await client.auth.getUser()
      if (verified.error || !verified.data.user || verified.data.user.id !== existing.session.user.id) throw new Error('AUTH_UNAVAILABLE')
      return { user: verified.data.user }
    })().finally(() => { if (initializationPromise === reading) initializationPromise = null })
    initializationPromise = reading
    return reading
  },
  async enterGuest() {
    if ((await this.initialize()).user) throw new Error('SESSION_ALREADY_PRESENT')
    const { data, error } = await requireSupabase().auth.signInAnonymously()
    if (error || !data.session || !data.user || data.user.id !== data.session.user.id || data.user.is_anonymous !== true) throw new Error('AUTH_UNAVAILABLE')
  },
  async exitGuest(uid: string) {
    const current = await this.initialize()
    if (current.user?.id !== uid || current.user.is_anonymous !== true) throw new Error('UID_MISMATCH')
    const result = await requireSupabase().auth.signOut({ scope: 'local' })
    if ((await this.initialize()).user) throw result.error ?? new Error('SIGNOUT_INCOMPLETE')
  },
  async finishPendingUpgrade(uid: string, username: string, password: string) {
    if (Array.from(password).length < 8) throw new Error('PASSWORD_TOO_SHORT')
    const check = async () => {
      const { user } = await this.initialize()
      if (!user || user.id !== uid || user.is_anonymous !== false || user.email !== deriveSyntheticIdentifier(username) || user.new_email || !user.email_confirmed_at) throw new Error('IDENTITY_MISMATCH')
    }
    // A marker requests continuation; a fresh server identity authorizes it.
    await check()
    const result = await requireSupabase().auth.updateUser({ password })
    if (result.error || result.data.user?.id !== uid) throw new Error('AUTH_UNAVAILABLE')
    await check()
  },
  subscribe(callback: (user: User | null) => void) {
    const client = requireSupabase()
    return client.auth.onAuthStateChange((_event, session) => {
      initializationPromise = null
      callback(session?.user ?? null)
    })
  },
}
