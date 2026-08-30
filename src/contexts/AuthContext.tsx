import { useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { fetchProfile, type ProfileLoadResult } from '../services/profileService'
import { AuthContext, type AuthContextValue } from './auth-context'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isSessionLoading, setIsSessionLoading] = useState(true)
  const [session, setSession] = useState<Session | null>(null)

  const [isProfileLoading, setIsProfileLoading] = useState(false)
  const [profileLoadResult, setProfileLoadResult] = useState<ProfileLoadResult | null>(null)

  // Restore any existing session on mount (page refresh), then subscribe
  // to future auth state changes (sign in, sign out, token refresh).
  useEffect(() => {
    let isMounted = true

    supabase.auth.getSession().then(({ data }) => {
      if (!isMounted) return
      setSession(data.session)
      setIsSessionLoading(false)
    })

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!isMounted) return
      setSession(nextSession)
      setIsSessionLoading(false)
    })

    return () => {
      isMounted = false
      subscription.subscription.unsubscribe()
    }
  }, [])

  // Whenever the authenticated user changes, (re)load their profile/role.
  // When there's no user, we deliberately do nothing here — the "no
  // session" case is derived at render time below, rather than reset
  // via setState inside the effect.
  const userId = session?.user.id

  useEffect(() => {
    if (!userId) return

    let isCancelled = false
    setIsProfileLoading(true)

    fetchProfile(userId)
      .then((result) => {
        if (isCancelled) return
        setProfileLoadResult(result)
      })
      .finally(() => {
        if (!isCancelled) setIsProfileLoading(false)
      })

    return () => {
      isCancelled = true
    }
  }, [userId])

  // Derived, not stored: if there's no authenticated user, there is no
  // profile to show, regardless of what was loaded for a previous user.
  const effectiveProfileLoadResult = userId ? profileLoadResult : null

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error: error ? mapAuthError(error.message) : null }
  }

  async function signOut() {
    await supabase.auth.signOut()
  }

  const profile =
    effectiveProfileLoadResult?.status === 'loaded' ? effectiveProfileLoadResult.profile : null

  const value: AuthContextValue = {
    isSessionLoading,
    session,
    user: session?.user ?? null,
    isProfileLoading,
    profile,
    role: profile?.role ?? null,
    isSchemaPending: effectiveProfileLoadResult?.status === 'schema_pending',
    profileLoadResult: effectiveProfileLoadResult,
    signIn,
    signOut,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

/** Turn Supabase's raw auth error messages into clean, user-facing copy. */
function mapAuthError(message: string): string {
  if (/invalid login credentials/i.test(message)) {
    return 'Incorrect email or password.'
  }
  if (/email not confirmed/i.test(message)) {
    return 'Please confirm your email before signing in.'
  }
  return 'Unable to sign in right now. Please try again.'
}
