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
    <main className="min-h-screen overflow-hidden bg-[#061b13] text-white lg:grid lg:min-h-screen lg:grid-cols-2">
      {/* Left: brand and hero image */}
      <section className="relative isolate flex min-h-[580px] flex-col justify-between overflow-hidden px-7 py-9 sm:px-12 sm:py-12 lg:min-h-screen lg:px-14 xl:px-20">
        <div
          className="jiuze-hero-image absolute inset-0 -z-20 bg-cover bg-center"
          style={{ backgroundImage: "url('/jiuze-pos-hero.png')" }}
          aria-hidden="true"
        />
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-black/70 via-black/45 to-[#061b13]/95" aria-hidden="true" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-black/20 to-[#061b13]/30" aria-hidden="true" />

        <div className="jiuze-enter flex items-center gap-4">
          <img src="/jiuze-logo.png" alt="JIUZE logo" className="h-16 w-16 object-contain sm:h-20 sm:w-20" />
          <div>
            <p className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
              JIUZE <span className="text-[#e9b949]">POS</span>
            </p>
            <p className="mt-1 text-[10px] uppercase tracking-[0.32em] text-white/75 sm:text-xs">
              Business made simple
            </p>
          </div>
        </div>

        <div className="jiuze-enter jiuze-enter-delay-1 my-14 max-w-xl lg:my-0 lg:py-12">
          <div className="mb-7 h-1 w-16 rounded-full bg-[#e9b949]" />
          <h2 className="font-display text-4xl font-bold leading-[1.08] tracking-tight sm:text-5xl xl:text-6xl">
            Simple.
            <br />
            Reliable.
            <br />
            <span className="text-[#f0c65e]">Built for Your Business.</span>
          </h2>
          <p className="mt-5 max-w-lg text-base leading-relaxed text-white/80 sm:text-lg">
            Manage your business, serve your customers, and grow with JIUZE POS.
          </p>

          <div className="mt-9 grid max-w-lg gap-4 sm:grid-cols-3">
            <div className="rounded-xl border border-white/15 bg-black/25 p-4 backdrop-blur-sm">
              <p className="text-sm font-semibold text-[#f0c65e]">Fast checkout</p>
              <p className="mt-1 text-xs leading-relaxed text-white/75">Serve customers efficiently.</p>
            </div>
            <div className="rounded-xl border border-white/15 bg-black/25 p-4 backdrop-blur-sm">
              <p className="text-sm font-semibold text-[#f0c65e]">Live reports</p>
              <p className="mt-1 text-xs leading-relaxed text-white/75">Track sales and performance.</p>
            </div>
            <div className="rounded-xl border border-white/15 bg-black/25 p-4 backdrop-blur-sm">
              <p className="text-sm font-semibold text-[#f0c65e]">Secure access</p>
              <p className="mt-1 text-xs leading-relaxed text-white/75">Keep business data protected.</p>
            </div>
          </div>
        </div>

        <footer className="jiuze-enter jiuze-enter-delay-2 border-t border-white/20 pt-5 text-xs text-white/65">
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            <a href="tel:0710307318" className="transition hover:text-[#f0c65e]">0710 307 318</a>
            <a href="tel:0754242954" className="transition hover:text-[#f0c65e]">0754 242 954</a>
            <a href="https://www.jiuze.co.ke" target="_blank" rel="noreferrer" className="transition hover:text-[#f0c65e]">www.jiuze.co.ke</a>
          </div>
          <p className="mt-3 uppercase tracking-[0.18em]">JIUZE POS · Retail management</p>
        </footer>
      </section>

      {/* Right: working login form */}
      <section className="relative flex items-center justify-center overflow-hidden bg-[radial-gradient(ellipse_at_top_right,_#12452e_0%,_#08271b_42%,_#04150f_100%)] px-5 py-10 sm:px-10 lg:min-h-screen lg:px-12">
        <div className="pointer-events-none absolute -right-36 -top-32 h-96 w-96 rounded-full border border-[#e9b949]/20" />
        <div className="pointer-events-none absolute -bottom-40 -left-24 h-96 w-96 rounded-full border border-[#e9b949]/10" />

        <form
          onSubmit={handleSubmit}
          className="jiuze-enter jiuze-enter-delay-1 relative w-full max-w-[490px] rounded-2xl border border-[#d6ad4c]/40 bg-[#041a12]/80 p-6 shadow-2xl shadow-black/40 backdrop-blur-xl sm:p-9"
          noValidate
        >
          <div className="mb-7 text-center">
            <img src="/jiuze-logo.png" alt="JIUZE logo" className="mx-auto h-20 w-20 object-contain sm:h-24 sm:w-24" />
            <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight">
              JIUZE <span className="text-[#e9b949]">POS</span>
            </h1>
            <p className="mt-2 text-sm text-white/60">Sign in to continue to your business.</p>
          </div>

          <div className="space-y-4">
            <div>
              <label htmlFor="business" className="mb-2 block text-sm font-medium text-white/85">Select business</label>
              <select id="business" value={businessId} onChange={(event) => setBusinessId(event.target.value)} disabled={isDirectoryLoading || isSubmitting || businesses.length === 0} className="field border-white/15 bg-white/[0.04] text-white transition focus:border-[#e9b949] focus:ring-1 focus:ring-[#e9b949]/40">
                <option value="">{isDirectoryLoading ? 'Loading businesses…' : 'Choose a business'}</option>
                {businesses.map((business) => <option key={business.id} value={business.id} className="bg-[#08271b]">{business.name}</option>)}
              </select>
            </div>

            <div>
              <label htmlFor="cashier" className="mb-2 block text-sm font-medium text-white/85">Select cashier</label>
              <select id="cashier" value={cashierId} onChange={(event) => setCashierId(event.target.value)} disabled={!businessId || isSubmitting || cashiers.length === 0} className="field border-white/15 bg-white/[0.04] text-white transition focus:border-[#e9b949] focus:ring-1 focus:ring-[#e9b949]/40">
                <option value="">{businessId ? 'Choose a cashier' : 'Select a business first'}</option>
                {cashiers.map((cashier) => <option key={cashier.id} value={cashier.id} className="bg-[#08271b]">{cashier.fullName || 'Unnamed cashier'}</option>)}
              </select>
            </div>

            <div>
              <label htmlFor="password" className="mb-2 block text-sm font-medium text-white/85">Password</label>
              <div className="relative">
                <input id="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={(event) => { setPassword(event.target.value); setError(null) }} disabled={isSubmitting} className="field border-white/15 bg-white/[0.04] pr-16 text-white placeholder:text-white/35 transition focus:border-[#e9b949] focus:ring-1 focus:ring-[#e9b949]/40" placeholder="Enter your password" />
                <button type="button" onClick={() => setShowPassword((current) => !current)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md px-2 py-1.5 text-xs text-white/60 transition hover:text-[#f0c65e]">{showPassword ? 'Hide' : 'Show'}</button>
              </div>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-2" aria-label="On-screen numeric keypad">
            {keypadRows.flat().map((key) => (
              <button key={key} type="button" onClick={() => pressKey(key)} disabled={isSubmitting} className="min-h-12 rounded-lg border border-white/10 bg-white/[0.04] text-lg font-semibold transition hover:border-[#e9b949]/40 hover:bg-white/[0.09] active:scale-[0.98] disabled:opacity-50">{key}</button>
            ))}
            <button type="button" onClick={() => pressKey('0')} disabled={isSubmitting} className="min-h-12 rounded-lg border border-white/10 bg-white/[0.04] text-lg font-semibold transition hover:bg-white/[0.09] disabled:opacity-50">0</button>
            <button type="button" onClick={() => pressKey('backspace')} disabled={isSubmitting} aria-label="Delete last password character" className="min-h-12 rounded-lg border border-white/10 bg-white/[0.04] text-lg transition hover:bg-white/[0.09] disabled:opacity-50">←</button>
            <button type="button" onClick={() => pressKey('clear')} disabled={isSubmitting} className="min-h-12 rounded-lg border border-white/10 bg-white/[0.04] text-sm font-semibold transition hover:bg-white/[0.09] disabled:opacity-50">Clear</button>
          </div>

          {directoryError && <p role="status" className="mt-4 rounded-lg border border-[#e9b949]/25 bg-[#e9b949]/10 px-3 py-2.5 text-xs leading-relaxed text-[#f0c65e]">{directoryError}</p>}
          {error && <p role="alert" className="mt-4 rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2.5 text-xs leading-relaxed text-red-200">{error}</p>}

          <button type="submit" disabled={isSubmitting || isDirectoryLoading || !businessId || !cashierId} className="jiuze-login-button mt-5 min-h-12 w-full rounded-lg bg-gradient-to-r from-[#f3cf68] via-[#e9b949] to-[#b77a17] px-4 py-3 text-sm font-bold text-[#10170d] shadow-lg shadow-[#d5a52d]/15 disabled:cursor-not-allowed disabled:opacity-60">
            {isSubmitting ? 'Signing in…' : 'Sign in →'}
          </button>

          <div className="mt-5 flex items-center justify-between gap-3 border-t border-white/10 pt-4 text-xs">
            <Link to="/reset-password" className="font-medium text-[#f0c65e] transition hover:text-white">Forgot password?</Link>
            <Link to="/signup" className="text-white/55 transition hover:text-white">Create account</Link>
          </div>
        </form>
      </section>
        </main>
  )
}