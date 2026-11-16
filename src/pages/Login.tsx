import { useEffect, useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/auth-context'
import { supabase } from '../lib/supabase'

const keypadRows = [['1', '2', '3'], ['4', '5', '6'], ['7', '8', '9']]

export default function Login() {
  const { session, isSessionLoading, signIn } = useAuth()
  const location = useLocation()
  const [loginMode, setLoginMode] = useState<'cashier' | 'email'>('cashier')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [postLoginPath, setPostLoginPath] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    if (!session) {
      setPostLoginPath(null)
      return
    }
    const requestedPath = (location.state as { from?: string } | null)?.from
    void supabase.functions.invoke('platform-admin', { body: { action: 'check' } })
      .then(({ data, error: checkError }) => {
        if (cancelled) return
        setPostLoginPath(!checkError && data?.isAdmin === true ? '/platform-admin' : (requestedPath ?? '/'))
      })
      .catch(() => {
        if (!cancelled) setPostLoginPath(requestedPath ?? '/')
      })
    return () => { cancelled = true }
  }, [session, location.state])

  if (!isSessionLoading && session) {
    return postLoginPath
      ? <Navigate to={postLoginPath} replace />
      : <main className="grid min-h-screen place-items-center bg-[#f4f6f2] text-sm text-[#647269]">Checking account access…</main>
  }

  function pressKey(key: string) {
    setError(null)
    if (key === 'clear') {
      setPassword('')
    } else if (key === 'backspace') {
      setPassword((current) => current.slice(0, -1))
    } else {
      setPassword((current) => loginMode === 'cashier' ? (current.length < 6 ? current + key : current) : current + key)
    }
  }

  async function handleEmailSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    if (!email.trim() || !password) {
      setError('Enter your email address and password.')
      return
    }
    setIsSubmitting(true)
    const result = await signIn(email.trim(), password)
    setIsSubmitting(false)
    if (result.error) { setError(result.error); return }
    const { data: authData } = await supabase.auth.getUser()
    if (authData.user) {
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', authData.user.id).maybeSingle()
      if (profile?.role === 'cashier') {
        await supabase.auth.signOut()
        setError('Cashier accounts must sign in using their assigned PIN.')
      }
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    if (!/^\d{6}$/.test(password)) {
      setError('Enter your 6-digit cashier PIN.')
      return
    }
    setIsSubmitting(true)
    const { data, error: signInError } = await supabase.functions.invoke('cashier-login', {
      body: { action: 'sign_in', pin: password },
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
    <main className="min-h-screen bg-white text-[#172B20] lg:grid lg:min-h-screen lg:grid-cols-[minmax(0,1.08fr)_minmax(480px,0.92fr)]">
      {/* Product showcase */}
      <section className="relative order-2 isolate flex min-h-[340px] flex-col overflow-hidden bg-[#023829] px-6 py-7 text-white sm:px-10 sm:py-9 lg:order-1 lg:min-h-screen lg:px-12 lg:py-10 xl:px-16">
        <div className="absolute inset-0 -z-20 bg-cover bg-center" style={{ backgroundImage: "url('/jiuze-pos-hero.png')" }} aria-hidden="true" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-[#023829]/95 via-[#023829]/75 to-[#023829]/95" aria-hidden="true" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-[#023829]/35 to-transparent" aria-hidden="true" />

        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-white/15 pb-6">
          <div className="flex items-center gap-3">
            <img src="/jiuze-logo.png" alt="JIUZE" className="h-12 w-12 object-contain sm:h-14 sm:w-14" />
            <div>
              <p className="font-display text-2xl font-bold tracking-tight sm:text-3xl">JIUZE <span className="text-[#D4A017]">POS</span></p>
              <p className="mt-0.5 text-[9px] font-semibold uppercase tracking-[0.25em] text-white/65 sm:text-[10px]">Business operating platform</p>
            </div>
          </div>
          <span className="hidden rounded-full border border-white/20 bg-white/5 px-4 py-2 text-xs font-medium text-white/75 sm:inline-flex">Retail &amp; Restaurants</span>
        </header>

        <div className="relative z-10 my-auto grid items-center gap-8 py-10 xl:grid-cols-[minmax(0,1fr)_minmax(240px,0.82fr)] xl:gap-5">
          <div className="max-w-xl">
            <p className="mb-4 text-xs font-bold uppercase tracking-[0.2em] text-[#D4A017]">One platform. Complete control.</p>
            <h2 className="font-display text-4xl font-bold leading-[1.08] tracking-tight sm:text-5xl xl:text-[3.5rem]">
              A complete POS for <span className="text-[#E2BD78]">retail &amp; restaurants.</span>
            </h2>
            <p className="mt-5 max-w-lg text-sm leading-7 text-white/75 sm:text-base">
              Run sales, manage stock, track orders and understand your business from one connected workspace.
            </p>
            <div className="mt-7 flex flex-wrap gap-2 text-xs font-medium text-white/85 sm:text-sm">
              {['Sales', 'Stock', 'Orders', 'Customers', 'Reports'].map((item) => (
                <span key={item} className="rounded-full border border-white/20 bg-white/[0.07] px-3 py-1.5 backdrop-blur-sm">{item}</span>
              ))}
            </div>
          </div>
          <div className="relative mx-auto w-full max-w-[390px] xl:mx-0">
            <div className="absolute -inset-5 rounded-[2rem] bg-[#D4A017]/10 blur-2xl" />
            <div className="relative overflow-hidden rounded-2xl border border-white/20 bg-[#034332]/75 p-3 shadow-2xl shadow-black/40 backdrop-blur-md">
              <div className="mb-3 flex items-center justify-between px-1">
                <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/65">JIUZE workspace</span>
                <span className="flex items-center gap-1.5 text-[10px] text-emerald-300"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Live overview</span>
              </div>
              <img src="/jiuze-pos-hero.png" alt="JIUZE POS workspace preview" className="aspect-[5/4] w-full rounded-xl object-cover object-center" />
              <div className="mt-3 grid grid-cols-3 gap-2">
                <div className="rounded-lg border border-white/10 bg-white/[0.06] p-2.5"><p className="text-[10px] text-white/55">Checkout</p><p className="mt-1 text-xs font-semibold text-white">Fast sales</p></div>
                <div className="rounded-lg border border-white/10 bg-white/[0.06] p-2.5"><p className="text-[10px] text-white/55">Inventory</p><p className="mt-1 text-xs font-semibold text-white">Stock control</p></div>
                <div className="rounded-lg border border-white/10 bg-white/[0.06] p-2.5"><p className="text-[10px] text-white/55">Insights</p><p className="mt-1 text-xs font-semibold text-white">Live reports</p></div>
              </div>
            </div>
          </div>
        </div>

        <footer className="relative z-10 flex flex-wrap items-center justify-between gap-3 border-t border-white/15 pt-5 text-xs text-white/60">
          <span>Built for better business operations.</span>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            <a href="tel:0710307318" className="transition hover:text-[#E2BD78]">0710 307 318</a>
            <a href="https://www.jiuze.co.ke" target="_blank" rel="noreferrer" className="transition hover:text-[#E2BD78]">jiuze.co.ke</a>
          </div>
        </footer>
      </section>

      {/* Login panel */}
      <section className="relative order-1 flex min-h-screen items-center justify-center overflow-hidden bg-[#F8FAF5] px-5 py-9 sm:px-10 lg:order-2 lg:px-12 xl:px-16">
        <div className="pointer-events-none absolute -right-32 -top-32 h-80 w-80 rounded-full bg-[#EAF3EE] blur-3xl" />
        <div className="pointer-events-none absolute -bottom-40 -left-32 h-96 w-96 rounded-full bg-[#F1F5EF] blur-3xl" />

        <form onSubmit={loginMode === 'email' ? handleEmailSubmit : handleSubmit} className="jiuze-enter relative w-full max-w-[460px] rounded-[1.75rem] border border-[#DCE7DE] bg-white p-6 shadow-[0_18px_60px_rgba(16,41,30,0.08)] sm:p-9 lg:p-10" noValidate>
          <div className="mb-8 text-center">
            <img src="/jiuze-logo.png" alt="JIUZE logo" className="mx-auto h-16 w-16 object-contain sm:h-[4.5rem] sm:w-[4.5rem]" />
            <h1 className="mt-3 font-display text-3xl font-bold tracking-tight text-[#172B20]">JIUZE <span className="text-[#A97D19]">POS</span></h1>
            <p className="mt-2 text-sm text-[#64748B]">Business operating platform</p>
          </div>

          <div className="mb-8 grid grid-cols-2 rounded-xl border border-[#DCE7DE] bg-[#F1F5EF] p-1">
            <button type="button" onClick={() => { setLoginMode('cashier'); setError(null); setPassword('') }} className={`rounded-lg px-3 py-3 text-sm font-semibold transition ${loginMode === 'cashier' ? 'bg-[#065F46] text-white shadow-sm' : 'text-[#64748B] hover:text-[#172B20]'}`}>Cashier login</button>
            <button type="button" onClick={() => { setLoginMode('email'); setError(null); setPassword('') }} className={`rounded-lg px-3 py-3 text-sm font-semibold transition ${loginMode === 'email' ? 'bg-[#065F46] text-white shadow-sm' : 'text-[#64748B] hover:text-[#172B20]'}`}>Owner / Admin</button>
          </div>

          {loginMode === 'email' ? (
            <div className="space-y-5">
              <div>
                <label htmlFor="email" className="mb-2 block text-sm font-semibold text-[#172B20]">Email address</label>
                <input id="email" type="email" autoComplete="username" value={email} onChange={(event) => { setEmail(event.target.value); setError(null) }} disabled={isSubmitting} className="field border-[#DCE7DE] bg-white text-[#172B20] placeholder:text-[#94A3A0] focus:border-[#034B37] focus:ring-2 focus:ring-[#034B37]/10" placeholder="you@business.com" />
              </div>
              <div>
                <label htmlFor="password" className="mb-2 block text-sm font-semibold text-[#172B20]">Password</label>
                <div className="relative">
                  <input id="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={(event) => { setPassword(event.target.value); setError(null) }} disabled={isSubmitting} className="field border-[#DCE7DE] bg-white pr-16 text-[#172B20] placeholder:text-[#94A3A0] focus:border-[#034B37] focus:ring-2 focus:ring-[#034B37]/10" placeholder="Enter your password" />
                  <button type="button" onClick={() => setShowPassword((current) => !current)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md px-2 py-1.5 text-xs font-semibold text-[#64748B] hover:text-[#065F46]">{showPassword ? 'Hide' : 'Show'}</button>
                </div>
              </div>
            </div>
          ) : (
            <>
              <div className="mb-5 text-center">
                <h2 className="text-xl font-bold tracking-tight text-[#172B20]">Enter cashier PIN</h2>
                <p className="mt-1.5 text-sm text-[#64748B]">Use your unique 6-digit PIN to access the POS.</p>
              </div>
              <div>
                <label htmlFor="cashier-pin" className="sr-only">Cashier PIN</label>
                <div className="relative">
                  <input id="cashier-pin" type={showPassword ? 'text' : 'password'} inputMode="numeric" autoComplete="off" maxLength={6} value={password} onChange={(event) => { setPassword(event.target.value.replace(/\D/g, '').slice(0, 6)); setError(null) }} disabled={isSubmitting} className="field border-[#DCE7DE] bg-[#F8FAF5] text-center text-2xl font-bold tracking-[0.75em] text-[#065F46] placeholder:text-[#94A3A0] focus:border-[#034B37] focus:ring-2 focus:ring-[#034B37]/10" placeholder="••••••" />
                  <button type="button" onClick={() => setShowPassword((current) => !current)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md px-2 py-1.5 text-xs font-semibold text-[#64748B] hover:text-[#065F46]">{showPassword ? 'Hide' : 'Show'}</button>
                </div>
              </div>
              <div className="mt-5 grid grid-cols-3 gap-2.5" aria-label="On-screen numeric keypad">
                {keypadRows.flat().map((key) => <button key={key} type="button" onClick={() => pressKey(key)} disabled={isSubmitting || password.length >= 6} className="min-h-[54px] rounded-xl border border-[#DCE7DE] bg-white text-lg font-semibold text-[#034332] transition hover:border-[#034B37] hover:bg-[#EAF3EE] active:scale-[0.98] disabled:opacity-45">{key}</button>)}
                <button type="button" onClick={() => pressKey('backspace')} disabled={isSubmitting || !password} aria-label="Delete last PIN digit" className="min-h-[54px] rounded-xl border border-[#DCE7DE] bg-white text-lg text-[#034332] transition hover:border-[#034B37] hover:bg-[#EAF3EE] disabled:opacity-45">⌫</button>
                <button type="button" onClick={() => pressKey('0')} disabled={isSubmitting || password.length >= 6} className="min-h-[54px] rounded-xl border border-[#DCE7DE] bg-white text-lg font-semibold text-[#034332] transition hover:border-[#034B37] hover:bg-[#EAF3EE] active:scale-[0.98] disabled:opacity-45">0</button>
                <button type="button" onClick={() => pressKey('clear')} disabled={isSubmitting || !password} className="min-h-[54px] rounded-xl border border-[#DCE7DE] bg-white text-xs font-semibold text-[#64748B] transition hover:border-[#034B37] hover:bg-[#EAF3EE] disabled:opacity-45">Clear</button>
              </div>
            </>
          )}

          {error && <p role="alert" className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-relaxed text-red-700">{error}</p>}

          <button type="submit" disabled={isSubmitting || (loginMode === 'email' ? (!email.trim() || !password) : password.length !== 6)} className="jiuze-login-button mt-6 min-h-[54px] w-full rounded-xl bg-[#065F46] px-5 py-3.5 text-sm font-bold text-white shadow-[0_8px_20px_rgba(7,83,51,0.16)] transition hover:bg-[#06452C] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50">
            {isSubmitting ? 'Signing in…' : loginMode === 'email' ? 'Sign in to workspace →' : 'Sign in securely →'}
          </button>

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-[#EDF1ED] pt-5 text-xs">
            <Link to="/reset-password" className="font-semibold text-[#065F46] transition hover:text-[#A97D19]">Forgot password?</Link>
            <Link to="/signup" className="text-[#64748B] transition hover:text-[#065F46]">Create account</Link>
          </div>
          <p className="mt-6 text-center text-xs text-[#94A3A0]">Secure access · JIUZE POS</p>
        </form>
      </section>
    </main>
  )
}
