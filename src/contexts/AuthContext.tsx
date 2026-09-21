import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { fetchProfile, type ProfileLoadResult } from '../services/profileService'
import { AuthContext, type AuthContextValue } from './auth-context'

const DEFAULT_IDLE_TIMEOUT_MINUTES = 30

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isSessionLoading, setIsSessionLoading] = useState(true)
  const [session, setSession] = useState<Session | null>(null)
  const [idleTimeoutMinutes, setIdleTimeoutMinutes] = useState(DEFAULT_IDLE_TIMEOUT_MINUTES)
  const [idleTimeoutLoaded, setIdleTimeoutLoaded] = useState(false)
  const lastActivityRef = useRef(Date.now())

  const [isProfileLoading, setIsProfileLoading] = useState(false)
  const [profileLoadResult, setProfileLoadResult] = useState<ProfileLoadResult | null>(null)
  const [profileUserId, setProfileUserId] = useState<string | null>(null)

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

  const userId = session?.user.id

  // Load the business-specific inactivity timeout after the authenticated
  // user's profile is available. A missing/unreadable setting safely falls
  // back to the default 30-minute timeout.
  useEffect(() => {
    const businessId = effectiveBusinessId(profileLoadResult, profileUserId, userId)

    if (!businessId) {
      setIdleTimeoutMinutes(DEFAULT_IDLE_TIMEOUT_MINUTES)
      setIdleTimeoutLoaded(false)
      return
    }

    let isCancelled = false

    supabase
      .from('settings')
      .select('idle_timeout_minutes')
      .eq('business_id', businessId)
      .single()
      .then(({ data, error }) => {
        if (isCancelled) return

        const configuredMinutes = Number(data?.idle_timeout_minutes)
        setIdleTimeoutMinutes(
          !error && [0, 5, 15, 30].includes(configuredMinutes)
            ? configuredMinutes
            : DEFAULT_IDLE_TIMEOUT_MINUTES,
        )
        setIdleTimeoutLoaded(true)
      })

    return () => {
      isCancelled = true
    }
  }, [profileLoadResult, profileUserId, userId])

  // Keep sessions private on shared POS devices. The owner can configure
  // 5, 15, 30 minutes, or Never. Activity is tracked in a ref so event
  // listeners are not recreated on every interaction.
  useEffect(() => {
    if (!session || !userId || !idleTimeoutLoaded || idleTimeoutMinutes === 0) return

    lastActivityRef.current = Date.now()

    const events = ['pointerdown', 'keydown', 'touchstart', 'scroll'] as const
    const markActivity = () => {
      lastActivityRef.current = Date.now()
    }

    events.forEach((event) => {
      window.addEventListener(event, markActivity, { passive: true })
    })

    const timeoutMs = idleTimeoutMinutes * 60 * 1000

    const timer = window.setInterval(() => {
      if (Date.now() - lastActivityRef.current >= timeoutMs) {
        void supabase.auth.signOut()
      }
    }, 10_000)

    return () => {
      events.forEach((event) => {
        window.removeEventListener(event, markActivity)
      })
      window.clearInterval(timer)
    }
  }, [session, userId, idleTimeoutLoaded, idleTimeoutMinutes])

  // Whenever the authenticated user changes, (re)load their profile/role.
  // When there's no user, we deliberately do nothing here — the "no
  // session" case is derived at render time below, rather than reset
  // via setState inside the effect.
  useEffect(() => {
    if (!userId) {
      setIsProfileLoading(false)
      setProfileLoadResult(null)
      setProfileUserId(null)
      return
    }

    let isCancelled = false
    setIsProfileLoading(true)
    setProfileLoadResult(null)
    setProfileUserId(null)

    fetchProfile(userId)
      .then((result) => {
        if (isCancelled) return
        setProfileLoadResult(result)
        setProfileUserId(userId)
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
  const effectiveProfileLoadResult = userId && profileUserId === userId ? profileLoadResult : null

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

/** Resolve the current user's business ID without exposing a stale profile. */
function effectiveBusinessId(
  result: ProfileLoadResult | null,
  profileUserId: string | null,
  userId: string | undefined,
): string | null {
  if (!userId || profileUserId !== userId || result?.status !== 'loaded') return null
  return result.profile.businessId
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
