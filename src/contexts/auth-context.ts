import { createContext, useContext } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import type { Profile, ProfileLoadResult } from '../services/profileService'
import type { Role } from '../types/auth'
import type { Permission } from '../lib/permissions'
export interface AuthContextValue {
  isSessionLoading: boolean; session: Session | null; user: User | null
  isProfileLoading: boolean; profile: Profile | null; role: Role | null
  customPermissions: readonly Permission[] | null
  isPermissionsLoading: boolean; permissionLoadError: string | null
  isSchemaPending: boolean; profileLoadResult: ProfileLoadResult | null
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
}
export const AuthContext = createContext<AuthContextValue | undefined>(undefined)
export function useAuth(): AuthContextValue {
 const ctx = useContext(AuthContext)
 if (!ctx) throw new Error('useAuth must be used within an AuthProvider')
 return ctx
}
