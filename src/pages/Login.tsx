import { useEffect, useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/auth-context'
import { supabase } from '../lib/supabase'

type BusinessOption = { id: string; name: string }
type CashierOption = { id: string; fullName: string }

const keypadRows = [['1', '2', '3'], ['4', '5', '6'], ['7', '8', '9']]

export default function Login() {
  const { session, isSessionLoading } = useAuth()
  const location = useLocation()
  const [businesses, setBusinesses] = useState<BusinessOption[]>([])
  const [cashiers, setCashiers] = useState<CashierOption[]>([])
  const [businessId, setBusinessId] = useState('')
  const [cashierId, setCashierId] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isDirectoryLoading, setIsDirectoryLoading] = useState(true)
  const [directoryError, setDirectoryError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function loadBusinesses() {
      setIsDirectoryLoading(true)
      setDirectoryError(null)
      const { data, error: requestError } = await supabase.functions.invoke('cashier-login', {
        body: { action: 'businesses' },
      })
      if (cancelled) return
      if (requestError || !Array.isArray(data?.businesses)) {
        setDirectoryError('Cashier sign-in setup is not available yet. Use the existing email sign-in or contact your administrator.')
        setIsDirectoryLoading(false)
        return
      }
      setBusinesses(data.businesses as BusinessOption[])
      setBusinessId(data.businesses[0]?.id ?? '')
      setIsDirectoryLoading(false)
    }
    void loadBusinesses()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (!businessId) {
      setCashiers([])
      setCashierId('')
      return
    }
    let cancelled = false
    async function loadCashiers() {
      setCashiers([])
      setCashierId('')
      const { data, error: requestError } = await supabase.functions.invoke('cashier-login', {
        body: { action: 'cashiers', businessId },
      })
      if (cancelled) return
      if (requestError || !Array.isArray(data?.cashiers)) {
        setDirectoryError('Unable to load cashiers for this business.')
        return
      }
      setDirectoryError(null)
      setCashiers(data.cashiers as CashierOption[])
      setCashierId(data.cashiers[0]?.id ?? '')
    }
    void loadCashiers()
    return () => { cancelled = true }
  }, [businessId])

  if (!isSessionLoading && session) {
    return <Navigate to={(location.state as { from?: string } | null)?.from ?? '/'} replace />
  }

  function pressKey(key: string) {
    setError(null)
    if (key === 'clear') {
      setPassword('')
    } else if (key === 'backspace') {
      setPassword((current) => current.slice(0, -1))
    } else {
      setPassword((current) => current + key)
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    if (!businessId || !cashierId) {
      setError('Select your business and cashier name.')
      return
    }
    if (!password) {
      setError('Enter your password.')
      return
    }
    setIsSubmitting(true)
    const { data, error: signInError } = await supabase.functions.invoke('cashier-login', {
      body: { action: 'sign_in', businessId, cashierId, password },
    })
    setIsSubmitting(false)
    if (signInError || data?.error) {
      setError(data?.error || 'Unable to sign in. Check your password and try again.')
      return
    }
    if (!data?.session?.access_token || !data?.session?.refresh_token) {
      setError('Sign-in could not be completed. Please try again.')
      return
    }
    const { error: sessionError } = await supabase.auth.setSession({
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
    })
    if (sessionError) setError('Sign-in could not be completed. Please try again.')
  }

  return (
    <main className="min-h-screen bg-sidebar text-white">
      <div className="mx-auto grid min-h-screen w-full max-w-[1600px] lg:grid-cols-[1fr_1fr]">
        <section className="flex flex-col justify-center px-7 py-10 sm:px-12 lg:px-16 xl:px-20">
          <div className="my-auto">
            <div className="font-display text-4xl font-semibold tracking-tight sm:text-5xl">
              <span>JIUZE</span> <span className="text-market-300">POS</span>
            </div>
            <p className="mt-3 text-xs uppercase tracking-[0.25em] text-sidebar-muted">Retail management</p>
            <div className="mt-9 h-[3px] w-20 bg-maize-400" />
            <h2 className="mt-8 font-display text-2xl font-semibold leading-snug sm:text-3xl">
              Simple. Powerful.<br />Built for Your Business.
            </h2>
          </div>
          <footer className="mt-12 border-t border-sidebar-line pt-5 text-xs text-sidebar-text sm:text-sm">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <a href="tel:0710307318" className="hover:text-market-300">0710 307 318</a>
              <span className="text-sidebar-muted">/</span>
              <a href="tel:0754242954" className="hover:text-market-300">0754 242 954</a>
              <span className="hidden text-sidebar-muted sm:inline">|</span>
              <span>@Jiuze Kenya</span>
              <span className="hidden text-sidebar-muted sm:inline">|</span>
              <a href="https://www.jiuze.co.ke" target="_blank" rel="noreferrer" className="hover:text-market-300">www.jiuze.co.ke</a>
            </div>
            <p className="mt-4 text-[10px] uppercase tracking-[0.2em] text-sidebar-muted">JIUZE POS · Retail management</p>
          </footer>
        </section>

        <section className="flex items-center justify-center border-t border-sidebar-line bg-black/10 px-5 py-8 sm:px-8 lg:border-l lg:border-t-0">
          <form onSubmit={handleSubmit} className="w-full max-w-[540px] rounded-2xl border border-sidebar-line bg-[#0b1b15]/90 p-6 shadow-2xl sm:p-9" noValidate>
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-market-300">Business access</p>
            <h1 className="mt-3 font-display text-2xl font-semibold tracking-tight sm:text-3xl">Sign in to JIUZE <span className="text-market-300">POS</span></h1>
            <p className="mt-2 text-sm leading-relaxed text-sidebar-muted">Select your cashier account and enter your password to continue.</p>

            <div className="mt-6 space-y-4">
              <div>
                <label htmlFor="business" className="mb-1.5 block text-sm text-sidebar-text">Business</label>
                <select id="business" value={businessId} onChange={(event) => setBusinessId(event.target.value)} disabled={isDirectoryLoading || isSubmitting || businesses.length === 0} className="field border-sidebar-line bg-sidebar text-white">
                  <option value="">{isDirectoryLoading ? 'Loading businesses…' : 'Select business'}</option>
                  {businesses.map((business) => <option key={business.id} value={business.id}>{business.name}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="cashier" className="mb-1.5 block text-sm text-sidebar-text">Cashier name</label>
                <select id="cashier" value={cashierId} onChange={(event) => setCashierId(event.target.value)} disabled={!businessId || isSubmitting || cashiers.length === 0} className="field border-sidebar-line bg-sidebar text-white">
                  <option value="">{businessId ? 'Select cashier' : 'Select a business first'}</option>
                  {cashiers.map((cashier) => <option key={cashier.id} value={cashier.id}>{cashier.fullName || 'Unnamed cashier'}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="password" className="mb-1.5 block text-sm text-sidebar-text">Password</label>
                <div className="relative">
                  <input id="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={(event) => { setPassword(event.target.value); setError(null) }} disabled={isSubmitting} className="field border-sidebar-line bg-sidebar pr-16 text-white placeholder:text-sidebar-muted" placeholder="Enter your password" />
                  <button type="button" onClick={() => setShowPassword((current) => !current)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md px-2 py-1.5 text-xs text-sidebar-muted hover:text-white">{showPassword ? 'Hide' : 'Show'}</button>
                </div>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-2" aria-label="On-screen numeric keypad">
              {keypadRows.flat().map((key) => (
                <button key={key} type="button" onClick={() => pressKey(key)} disabled={isSubmitting} className="min-h-12 rounded-lg border border-white/5 bg-white/[0.05] text-lg font-semibold transition hover:bg-white/10 active:scale-[0.98] disabled:opacity-50">{key}</button>
              ))}
              <button type="button" onClick={() => pressKey('0')} disabled={isSubmitting} className="min-h-12 rounded-lg border border-white/5 bg-white/[0.05] text-lg font-semibold transition hover:bg-white/10 disabled:opacity-50">0</button>
              <button type="button" onClick={() => pressKey('backspace')} disabled={isSubmitting} aria-label="Delete last password character" className="min-h-12 rounded-lg border border-white/5 bg-white/[0.03] text-lg transition hover:bg-white/10 disabled:opacity-50">←</button>
              <button type="button" onClick={() => pressKey('clear')} disabled={isSubmitting} className="min-h-12 rounded-lg border border-white/5 bg-white/[0.03] text-sm font-semibold transition hover:bg-white/10 disabled:opacity-50">Clear</button>
            </div>

            {directoryError && <p role="status" className="mt-4 rounded-lg border border-maize-400/20 bg-maize-400/10 px-3 py-2.5 text-xs leading-relaxed text-maize-400">{directoryError}</p>}
            {error && <p role="alert" className="mt-4 rounded-lg border border-brick-500/30 bg-brick-500/15 px-3 py-2.5 text-xs leading-relaxed text-red-200">{error}</p>}

            <button type="submit" disabled={isSubmitting || isDirectoryLoading || !businessId || !cashierId} className="mt-5 min-h-12 w-full rounded-lg bg-market-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-market-700 disabled:cursor-not-allowed disabled:opacity-60">{isSubmitting ? 'Signing in…' : 'Sign in'}</button>
            <div className="mt-5 flex items-center justify-between gap-3 border-t border-sidebar-line pt-4 text-xs">
              <Link to="/reset-password" className="font-medium text-market-300 hover:text-white">Forgot password?</Link>
              <Link to="/signup" className="text-sidebar-muted hover:text-white">Create account</Link>
            </div>
          </form>
        </section>
      </div>
    </main>
  )
}
