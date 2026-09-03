import { useEffect, useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/auth-context'
import { supabase } from '../lib/supabase'

export default function ResetPassword() {
  const { session, isSessionLoading } = useAuth()
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

    const { data: authListener } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!mounted) return
      if (event === 'PASSWORD_RECOVERY' && nextSession) {
        setRecoveryReady(true)
        setCheckingRecovery(false)
      }
    })

    async function prepareRecovery() {
      const url = new URL(window.location.href)
      const code = url.searchParams.get('code')
      const hasImplicitRecovery = url.hash.includes('access_token=') && url.hash.includes('type=recovery')

      if (code) {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
        if (!mounted) return
        if (exchangeError) {
          setError('This password reset link is invalid or has expired. Please request a new one.')
          setCheckingRecovery(false)
          return
        }
        setRecoveryReady(true)
        setCheckingRecovery(false)
        window.history.replaceState({}, document.title, `${url.pathname}${url.hash}`)
        return
      }

      if (hasImplicitRecovery) {
        const { data } = await supabase.auth.getSession()
        if (!mounted) return
        if (data.session) setRecoveryReady(true)
        else setError('This password reset link is invalid or has expired. Please request a new one.')
        setCheckingRecovery(false)
        return
      }

      if (session) setRecoveryReady(true)
      setCheckingRecovery(false)
    }

    void prepareRecovery()

    return () => {
      mounted = false
      authListener.subscription.unsubscribe()
    }
  }, [session])

  if (isSessionLoading || checkingRecovery) {
    return <div className="min-h-screen bg-sidebar flex items-center justify-center px-5"><div className="text-center"><div className="font-display font-semibold text-3xl tracking-tight text-white"><span className="text-market-300">JIUZE</span> POS</div><p className="text-sm text-sidebar-muted mt-3">Verifying your password reset link…</p></div></div>
  }

  if (!recoveryReady) return <Navigate to="/login" replace state={{ resetError: error }} />

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setMessage(null)
    if (password.length < 8) { setError('New password must be at least 8 characters.'); return }
    if (password !== confirm) { setError('New passwords do not match.'); return }
    setIsSubmitting(true)
    const { error: updateError } = await supabase.auth.updateUser({ password })
    setIsSubmitting(false)
    if (updateError) {
      setError('Unable to reset your password. The reset link may have expired. Please request a new one.')
      return
    }
    setPassword('')
    setConfirm('')
    setMessage('Password reset successfully. Redirecting to sign in…')
    await supabase.auth.signOut()
    window.setTimeout(() => navigate('/login', { replace: true }), 1200)
  }

  return <div className="min-h-screen bg-sidebar flex items-center justify-center px-5 py-8"><div className="w-full max-w-md"><div className="text-center mb-8"><div className="font-display font-semibold text-3xl tracking-tight text-white"><span className="text-market-300">JIUZE</span> POS</div><p className="text-sm text-sidebar-muted mt-2">Retail management, simplified.</p></div><form onSubmit={handleSubmit} className="rounded-2xl border border-sidebar-line bg-sidebar-card p-6 sm:p-7 shadow-2xl" noValidate><div className="mb-6"><p className="text-xs font-medium uppercase tracking-[0.16em] text-market-300">Account recovery</p><h1 className="font-display font-semibold text-2xl text-white mt-2">Create a new password</h1><p className="text-sm text-sidebar-muted mt-2">Choose a new password for your JIUZE POS account.</p></div><div className="space-y-4"><div><label htmlFor="new-password" className="block text-xs font-medium text-sidebar-text mb-1.5">New password</label><input id="new-password" type="password" autoComplete="new-password" minLength={8} required value={password} onChange={(e) => setPassword(e.target.value)} disabled={isSubmitting} className="field bg-sidebar hover:border-sidebar-muted text-white placeholder:text-sidebar-muted border-sidebar-line" placeholder="At least 8 characters" /></div><div><label htmlFor="confirm-password" className="block text-xs font-medium text-sidebar-text mb-1.5">Confirm new password</label><input id="confirm-password" type="password" autoComplete="new-password" minLength={8} required value={confirm} onChange={(e) => setConfirm(e.target.value)} disabled={isSubmitting} className="field bg-sidebar hover:border-sidebar-muted text-white placeholder:text-sidebar-muted border-sidebar-line" placeholder="Repeat your new password" /></div></div>{error && <p role="alert" className="mt-4 text-xs text-red-200 bg-brick-500/15 border border-brick-500/30 rounded-lg px-3 py-2.5 leading-relaxed">{error}</p>}{message && <p role="status" className="mt-4 text-xs text-market-100 bg-market-500/15 border border-market-500/30 rounded-lg px-3 py-2.5 leading-relaxed">{message}</p>}<button type="submit" disabled={isSubmitting} className="mt-6 w-full rounded-lg bg-market-600 text-white text-sm font-semibold py-3 hover:bg-market-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed">{isSubmitting ? 'Resetting password…' : 'Set new password'}</button></form><p className="text-center text-xs text-sidebar-muted mt-6">Secure account recovery · JIUZE POS</p></div></div>
}
