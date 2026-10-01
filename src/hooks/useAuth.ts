import { createContext, useContext } from 'react'
import type { AuthIntegration, AuthSnapshot } from '../services/authIntegration'

export type AuthContextValue = AuthSnapshot & { authenticated: boolean; retry: () => void; controller: AuthIntegration }
export const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth() {
  const auth = useContext(AuthContext)
  if (!auth) throw new Error('JobQuest requires its Auth boundary.')
  return auth
}
