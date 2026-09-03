import { useState, type FormEvent } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/auth-context'
import { supabase } from '../lib/supabase'

export default function Login() {
  const { session, isSessionLoading, signIn } = useAuth()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isResetMode, setIsResetMode] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (!isSessionLoading && session) return <Navigate to={(location.state as { from?: string } | null)?.from ?? '/'} replace />

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setMessage(null)
    if (!email || (!isResetMode && !password)) {
      setError(isResetMode ? 'Enter your email address.' : 'Enter your email and password.')
      return
    }

    setIsSubmitting(true)
    if (isResetMode) {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/reset-password`,
      })
      setIsSubmitting(false)
      if (resetError) {
        setError('Unable to send the password reset email. Please check your email address and try again.')
        return
      }
      setMessage('If an account exists for that email, a password reset link has been sent.')
      return
    }

    const { error: signInError } = await signIn(email.trim(), password)
    setIsSubmitting(false)
    if (signInError) setError(signInError)
  }

  return <div className="min-h-screen bg-sidebar flex items-center justify-center px-5 py-8"><div className="w-full max-w-md"><div className="text-center mb-8"><div className="font-display font-semibold text-3xl tracking-tight text-white"><span className="text-market-300">JIUZE</span> POS</div><p className="text-sm text-sidebar-muted mt-2">Retail management, simplified.</p></div><form onSubmit={handleSubmit} className="rounded-2xl border border-sidebar-line bg-sidebar-card p-6 sm:p-7 shadow-2xl" noValidate><div className="mb-6"><p className="text-xs font-medium uppercase tracking-[0.16em] text-market-300">{isResetMode ? 'Account recovery' : 'Welcome back'}</p><h1 className="font-display font-semibold text-2xl text-white mt-2">{isResetMode ? 'Reset your password' : 'Sign in to your business'}</h1><p className="text-sm text-sidebar-muted mt-2">{isResetMode ? 'Enter your account email and we will send you a secure reset link.' : 'Access your JIUZE POS business account.'}</p></div><div className="space-y-4"><div><label htmlFor="email" className="block text-xs font-medium text-sidebar-text mb-1.5">Email</label><input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={isSubmitting} className="field bg-sidebar hover:border-sidebar-muted text-white placeholder:text-sidebar-muted border-sidebar-line" placeholder="you@business.co.ke" /></div>{!isResetMode && <div><label htmlFor="password" className="block text-xs font-medium text-sidebar-text mb-1.5">Password</label><input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} disabled={isSubmitting} className="field bg-sidebar hover:border-sidebar-muted text-white placeholder:text-sidebar-muted border-sidebar-line" placeholder="••••••••" /></div>}</div>{error && <p role="alert" className="mt-4 text-xs text-red-200 bg-brick-500/15 border border-brick-500/30 rounded-lg px-3 py-2.5 leading-relaxed">{error}</p>}{message && <p role="status" className="mt-4 text-xs text-market-100 bg-market-500/15 border border-market-500/30 rounded-lg px-3 py-2.5 leading-relaxed">{message}</p>}<button type="submit" disabled={isSubmitting} className="mt-6 w-full rounded-lg bg-market-600 text-white text-sm font-semibold py-3 hover:bg-market-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed">{isSubmitting ? (isResetMode ? 'Sending reset link…' : 'Signing in…') : (isResetMode ? 'Send reset link' : 'Sign in')}</button>{!isResetMode ? <button type="button" onClick={() => { setIsResetMode(true); setError(null); setMessage(null) }} className="mt-4 w-full text-xs font-medium text-market-300 hover:text-white transition-colors">Forgot password?</button> : <button type="button" onClick={() => { setIsResetMode(false); setError(null); setMessage(null) }} className="mt-4 w-full text-xs font-medium text-sidebar-muted hover:text-white transition-colors">Back to sign in</button>}</form><p className="text-center text-xs text-sidebar-muted mt-6">Secure business access · JIUZE POS</p></div></div>
}
