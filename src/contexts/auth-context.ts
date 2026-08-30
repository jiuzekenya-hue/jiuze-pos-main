import { createContext, useContext } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import type { Profile, ProfileLoadResult } from '../services/profileService'
import type { Role } from '../types/auth'

export interface AuthContextValue {
  /** True until the initial session check has completed. */
  isSessionLoading: boolean
  session: Session | null
  user: User | null
  /** True while loading the profile/role after a session is established. */
  isProfileLoading: boolean
  profile: Profile | null
  role: Role | null
  /** Set when profileLoadResult.status is 'schema_pending' (Phase 3 not deployed yet). */
  isSchemaPending: boolean
  profileLoadResult: ProfileLoadResult | null
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider')
  return ctx
}
