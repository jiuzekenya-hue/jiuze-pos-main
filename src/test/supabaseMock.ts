import { vi } from 'vitest'

type AuthChangeCallback = (event: string, session: unknown) => void

export interface ProfilesQueryResult {
  data: Record<string, unknown> | null
  error: { code?: string; message: string } | null
}

/**
 * A minimal, scriptable stand-in for the Supabase client, used to test
 * AuthContext, Login, and ProtectedRoute without any network access.
 */
export function createSupabaseMock() {
  let currentSession: { user: { id: string; email: string } } | null = null
  let authChangeCallback: AuthChangeCallback | null = null
  let profilesQueryResult: ProfilesQueryResult = {
    data: null,
    error: { code: '42P01', message: 'relation "public.profiles" does not exist' },
  }

  const auth = {
    getSession: vi.fn(async () => ({ data: { session: currentSession } })),
    onAuthStateChange: vi.fn((callback: AuthChangeCallback) => {
      authChangeCallback = callback
      return { data: { subscription: { unsubscribe: vi.fn() } } }
    }),
    signInWithPassword: vi.fn(async ({ email, password }: { email: string; password: string }) => {
      if (email === 'owner@test.com' && password === 'correct-password') {
        currentSession = { user: { id: 'user-1', email } }
        authChangeCallback?.('SIGNED_IN', currentSession)
        return { error: null }
      }
      return { error: { message: 'Invalid login credentials' } }
    }),
    signOut: vi.fn(async () => {
      currentSession = null
      authChangeCallback?.('SIGNED_OUT', null)
      return { error: null }
    }),
  }

  const from = vi.fn(() => ({
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn(async () => profilesQueryResult),
  }))

  return {
    supabase: { auth, from },
    // Test-only helpers to script behavior:
    __setInitialSession: (session: { user: { id: string; email: string } } | null) => {
      currentSession = session
    },
    __setProfilesQueryResult: (result: ProfilesQueryResult) => {
      profilesQueryResult = result
    },
    __triggerAuthChange: (event: string, session: unknown) => {
      currentSession = session as typeof currentSession
      authChangeCallback?.(event, session)
    },
  }
}
