import { useEffect, useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'

import { useAuth } from '../contexts/auth-context'
import { supabase } from '../lib/supabase'

export default function ResetPassword() {
  const { isSessionLoading } = useAuth()
  const navigate = useNavigate()

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [checkingRecovery, setCheckingRecovery] = useState(true)
  const [recoveryReady, setRecoveryReady] = useState(false)

  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true

    const finishRecovery = () => {
      if (!mounted) return

      setRecoveryReady(true)
      setCheckingRecovery(false)
      setError(null)
    }

    const { data: authListener } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (!mounted) return

        if (event === 'PASSWORD_RECOVERY' && session) {
          finishRecovery()
        }
      },
    )

    async function prepareRecovery() {
      try {
        const url = new URL(window.location.href)
        const code = url.searchParams.get('code')

        const hasRecoveryHash =
          url.hash.includes('access_token=') &&
          url.hash.includes('type=recovery')

        /*
         * Supabase PKCE recovery flow.
         *
         * Modern Supabase password-reset links commonly arrive as:
         * /reset-password?code=...
         */
        if (code) {
          const { error: exchangeError } =
            await supabase.auth.exchangeCodeForSession(code)

          if (!mounted) return

          if (exchangeError) {
            setError(
              'This password reset link is invalid or has expired. Please request a new one.',
            )
            setCheckingRecovery(false)
            return
          }

          finishRecovery()

          /*
           * Remove the one-time code from the browser URL.
           * Keep the pathname clean instead of leaving the recovery
           * credentials/code visible in the address bar.
           */
          window.history.replaceState(
            {},
            document.title,
            url.pathname,
          )

          return
        }

        /*
         * Older/implicit recovery flow.
         *
         * Supabase may already have processed the access token from
         * the URL hash before this component finishes mounting.
         */
        if (hasRecoveryHash) {
          const { data, error: sessionError } =
            await supabase.auth.getSession()

          if (!mounted) return

          if (sessionError || !data.session) {
            setError(
              'This password reset link is invalid or has expired. Please request a new one.',
            )
            setCheckingRecovery(false)
            return
          }

          finishRecovery()

          /*
           * Remove access tokens from the visible URL once the session
           * has been established.
           */
          window.history.replaceState(
            {},
            document.title,
            url.pathname,
          )

          return
        }

        /*
         * There is no recovery token.
         *
         * A normal logged-in session is deliberately NOT sufficient
         * to access this page.
         */
        if (!mounted) return

        setCheckingRecovery(false)
      } catch (err) {
        if (!mounted) return

        console.error('Password recovery initialization failed:', err)

        setError(
          'Unable to verify this password reset link. Please request a new one.',
        )
        setCheckingRecovery(false)
      }
    }

    void prepareRecovery()

    return () => {
      mounted = false
      authListener.subscription.unsubscribe()
    }
  }, [])

  if (isSessionLoading || checkingRecovery) {
    return (
      <div className="min-h-screen bg-sidebar flex items-center justify-center px-5">
        <div className="text-center">
          <div className="font-display font-semibold text-3xl tracking-tight text-white">
            <span className="text-market-300">JIUZE</span> POS
          </div>

          <p className="text-sm text-sidebar-muted mt-3">
            Verifying your password reset link…
          </p>
        </div>
      </div>
    )
  }

  if (!recoveryReady) {
    return (
      <Navigate
        to="/login"
        replace
        state={{ resetError: error }}
      />
    )
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    setError(null)
    setMessage(null)

    const trimmedPassword = password
    const trimmedConfirm = confirm

    if (trimmedPassword.length < 8) {
      setError('New password must be at least 8 characters.')
      return
    }

    if (trimmedPassword !== trimmedConfirm) {
      setError('New passwords do not match.')
      return
    }

    setIsSubmitting(true)

    try {
      const { error: updateError } =
        await supabase.auth.updateUser({
          password: trimmedPassword,
        })

      if (updateError) {
        console.error(
          'Password update failed:',
          updateError,
        )

        setError(
          'Unable to reset your password. The reset link may have expired. Please request a new one.',
        )

        return
      }

      setPassword('')
      setConfirm('')

      setMessage(
        'Password reset successfully. Redirecting to sign in…',
      )

      /*
       * End the recovery session after the password has been changed.
       * The user must sign in again with the new password.
       */
      await supabase.auth.signOut()

      window.setTimeout(() => {
        navigate('/login', { replace: true })
      }, 1200)
    } catch (err) {
      console.error('Password reset failed:', err)

      setError(
        'Unable to reset your password. Please request a new reset link and try again.',
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-sidebar flex items-center justify-center px-5 py-8">
      <div className="w-full max-w-md">

        <div className="text-center mb-8">
          <div className="font-display font-semibold text-3xl tracking-tight text-white">
            <span className="text-market-300">JIUZE</span> POS
          </div>

          <p className="text-sm text-sidebar-muted mt-2">
            Retail management, simplified.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          noValidate
          className="rounded-2xl border border-sidebar-line bg-sidebar-card p-6 sm:p-7 shadow-2xl"
        >
          <div className="mb-6">
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-market-300">
              Account recovery
            </p>

            <h1 className="font-display font-semibold text-2xl text-white mt-2">
              Create a new password
            </h1>

            <p className="text-sm text-sidebar-muted mt-2">
              Choose a new password for your JIUZE POS account.
            </p>
          </div>

          <div className="space-y-4">

            <div>
              <label
                htmlFor="new-password"
                className="block text-xs font-medium text-sidebar-text mb-1.5"
              >
                New password
              </label>

              <input
                id="new-password"
                type="password"
                autoComplete="new-password"
                minLength={8}
                required
                value={password}
                onChange={(event) =>
                  setPassword(event.target.value)
                }
                disabled={isSubmitting}
                className="field bg-sidebar hover:border-sidebar-muted text-white placeholder:text-sidebar-muted border-sidebar-line"
                placeholder="At least 8 characters"
              />
            </div>

            <div>
              <label
                htmlFor="confirm-password"
                className="block text-xs font-medium text-sidebar-text mb-1.5"
              >
                Confirm new password
              </label>

              <input
                id="confirm-password"
                type="password"
                autoComplete="new-password"
                minLength={8}
                required
                value={confirm}
                onChange={(event) =>
                  setConfirm(event.target.value)
                }
                disabled={isSubmitting}
                className="field bg-sidebar hover:border-sidebar-muted text-white placeholder:text-sidebar-muted border-sidebar-line"
                placeholder="Repeat your new password"
              />
            </div>

          </div>

          {error && (
            <p
              role="alert"
              className="mt-4 text-xs text-red-200 bg-brick-500/15 border border-brick-500/30 rounded-lg px-3 py-2.5 leading-relaxed"
            >
              {error}
            </p>
          )}

          {message && (
            <p
              role="status"
              className="mt-4 text-xs text-market-100 bg-market-500/15 border border-market-500/30 rounded-lg px-3 py-2.5 leading-relaxed"
            >
              {message}
            </p>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="mt-6 w-full rounded-lg bg-market-600 text-white text-sm font-semibold py-3 hover:bg-market-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isSubmitting
              ? 'Resetting password…'
              : 'Set new password'}
          </button>
        </form>

        <p className="text-center text-xs text-sidebar-muted mt-6">
          Secure account recovery · JIUZE POS
        </p>

      </div>
    </div>
  )
}