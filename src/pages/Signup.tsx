import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/auth-context'
import { supabase } from '../lib/supabase'

function mapSignupError(message: string): string {
  if (/already registered|already exists|user already registered/i.test(message)) {
    return 'An account with this email already exists. Sign in instead.'
  }
  if (/password/i.test(message) && /least|characters|weak|strength/i.test(message)) {
    return 'Choose a stronger password with at least 8 characters.'
  }
  if (/email/i.test(message) && /invalid/i.test(message)) {
    return 'Enter a valid email address.'
  }
  return 'Unable to create your account right now. Please try again.'
}

export default function Signup() {
  const { session, isSessionLoading } = useAuth()
  const navigate = useNavigate()
  const [businessName, setBusinessName] = useState('')
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [location, setLocation] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (!isSessionLoading && session) return <Navigate to="/" replace />

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setMessage(null)

    const cleanBusinessName = businessName.trim()
    const cleanFullName = fullName.trim()
    const cleanEmail = email.trim().toLowerCase()
    const cleanPhone = phone.trim()
    const cleanLocation = location.trim()

    if (!cleanBusinessName || !cleanFullName || !cleanEmail || !password) {
      setError('Complete all required fields.')
      return
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setIsSubmitting(true)

    const { data, error: signupError } = await supabase.auth.signUp({
      email: cleanEmail,
      password,
      options: {
        data: {
          signup_source: 'jiuze_pos',
          business_name: cleanBusinessName,
          full_name: cleanFullName,
          phone: cleanPhone || null,
          location: cleanLocation || null,
        },
      },
    })

    if (signupError) {
      setIsSubmitting(false)
      setError(mapSignupError(signupError.message))
      return
    }

    if (data.session) {
      setIsSubmitting(false)
      navigate('/', { replace: true })
      return
    }

    setIsSubmitting(false)
    setError('Account was created, but automatic sign-in is unavailable. Make sure email confirmation is disabled in Supabase Auth, then try signing up again.')
  }

  return (
    <div className="min-h-screen bg-sidebar flex items-center justify-center px-5 py-8 sm:px-6">
      <div className="w-full max-w-[520px]">
        <div className="text-center mb-7">
          <div className="font-display font-semibold text-3xl tracking-tight text-white">
            <span className="text-market-300">JIUZE</span> POS
          </div>
          <p className="text-xs uppercase tracking-[0.18em] text-sidebar-muted mt-2">Retail management</p>
        </div>

        <form onSubmit={handleSubmit} className="rounded-2xl border border-sidebar-line bg-sidebar-card p-6 sm:p-8 shadow-2xl" noValidate>
          <div className="mb-7">
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-market-300">New business</p>
            <h1 className="font-display font-semibold text-2xl sm:text-[28px] leading-tight text-white mt-2">Create your JIUZE POS account</h1>
            <p className="text-sm leading-relaxed text-sidebar-muted mt-2">Set up your business account and start with a 7-day free trial.</p>
          </div>

          <div className="space-y-5">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-sidebar-muted mb-3">Business details</p>
              <div className="space-y-4">
                <div>
                  <label htmlFor="business-name" className="block text-xs font-medium text-sidebar-text mb-1.5">Business name <span className="text-market-300">*</span></label>
                  <input id="business-name" required autoComplete="organization" value={businessName} onChange={(event) => setBusinessName(event.target.value)} disabled={isSubmitting} className="field bg-sidebar hover:border-sidebar-muted text-white placeholder:text-sidebar-muted border-sidebar-line" placeholder="e.g. TAMZ ENTERPRICES" />
                </div>
                <div>
                  <label htmlFor="location" className="block text-xs font-medium text-sidebar-text mb-1.5">Business location</label>
                  <input id="location" autoComplete="street-address" value={location} onChange={(event) => setLocation(event.target.value)} disabled={isSubmitting} className="field bg-sidebar hover:border-sidebar-muted text-white placeholder:text-sidebar-muted border-sidebar-line" placeholder="Town, area or address" />
                </div>
                <div>
                  <label htmlFor="business-phone" className="block text-xs font-medium text-sidebar-text mb-1.5">Business phone</label>
                  <input id="business-phone" type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={(event) => setPhone(event.target.value)} disabled={isSubmitting} className="field bg-sidebar hover:border-sidebar-muted text-white placeholder:text-sidebar-muted border-sidebar-line" placeholder="07XX XXX XXX" />
                </div>
              </div>
            </div>

            <div className="border-t border-sidebar-line pt-5">
              <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-sidebar-muted mb-3">Owner account</p>
              <div className="space-y-4">
                <div>
                  <label htmlFor="full-name" className="block text-xs font-medium text-sidebar-text mb-1.5">Owner name <span className="text-market-300">*</span></label>
                  <input id="full-name" required autoComplete="name" value={fullName} onChange={(event) => setFullName(event.target.value)} disabled={isSubmitting} className="field bg-sidebar hover:border-sidebar-muted text-white placeholder:text-sidebar-muted border-sidebar-line" placeholder="Your full name" />
                </div>
                <div>
                  <label htmlFor="email" className="block text-xs font-medium text-sidebar-text mb-1.5">Email address <span className="text-market-300">*</span></label>
                  <input id="email" required type="email" inputMode="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} disabled={isSubmitting} className="field bg-sidebar hover:border-sidebar-muted text-white placeholder:text-sidebar-muted border-sidebar-line" placeholder="you@business.co.ke" />
                </div>
                <div>
                  <label htmlFor="password" className="block text-xs font-medium text-sidebar-text mb-1.5">Password <span className="text-market-300">*</span></label>
                  <div className="relative">
                    <input id="password" required type={showPassword ? 'text' : 'password'} autoComplete="new-password" minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} disabled={isSubmitting} className="field bg-sidebar hover:border-sidebar-muted text-white placeholder:text-sidebar-muted border-sidebar-line pr-16" placeholder="At least 8 characters" />
                    <button type="button" onClick={() => setShowPassword((current) => !current)} disabled={isSubmitting} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md px-2 py-1.5 text-[11px] font-medium text-sidebar-muted hover:text-white" aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? 'Hide' : 'Show'}</button>
                  </div>
                </div>
                <div>
                  <label htmlFor="confirm-password" className="block text-xs font-medium text-sidebar-text mb-1.5">Confirm password <span className="text-market-300">*</span></label>
                  <div className="relative">
                    <input id="confirm-password" required type={showConfirmPassword ? 'text' : 'password'} autoComplete="new-password" minLength={8} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} disabled={isSubmitting} className="field bg-sidebar hover:border-sidebar-muted text-white placeholder:text-sidebar-muted border-sidebar-line pr-16" placeholder="Repeat your password" />
                    <button type="button" onClick={() => setShowConfirmPassword((current) => !current)} disabled={isSubmitting} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md px-2 py-1.5 text-[11px] font-medium text-sidebar-muted hover:text-white" aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}>{showConfirmPassword ? 'Hide' : 'Show'}</button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {error && <p role="alert" className="mt-5 text-xs text-red-200 bg-brick-500/15 border border-brick-500/30 rounded-lg px-3 py-2.5 leading-relaxed">{error}</p>}
          {message && <p role="status" className="mt-5 text-xs text-market-100 bg-market-500/15 border border-market-500/30 rounded-lg px-3 py-2.5 leading-relaxed">{message}</p>}

          <button type="submit" disabled={isSubmitting} className="mt-6 w-full rounded-lg bg-market-600 text-white text-sm font-semibold py-3 hover:bg-market-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed">{isSubmitting ? 'Creating account…' : 'Create account'}</button>

          <p className="text-center text-xs text-sidebar-muted mt-5">Already have an account? <Link to="/login" className="font-medium text-market-300 hover:text-white">Sign in</Link></p>
        </form>

        <p className="text-center text-[11px] text-sidebar-muted mt-6">7-day free trial · Secure business access · JIUZE POS</p>
      </div>
    </div>
  )
}
