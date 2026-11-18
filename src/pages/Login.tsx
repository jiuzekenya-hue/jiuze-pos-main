import { useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/auth-context'
import { supabase } from '../lib/supabase'

type LoginMode = 'cashier' | 'owner'
const keypadRows = [['1', '2', '3'], ['4', '5', '6'], ['7', '8', '9']]

export default function Login() {
  const { session, isSessionLoading, signIn } = useAuth()
  const location = useLocation()
  const [mode, setMode] = useState<LoginMode>('cashier')
  const [pin, setPin] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!isSessionLoading && session) {
    return <Navigate to={session.user.app_metadata?.platform_admin === true ? '/platform-admin' : (location.state as { from?: string } | null)?.from ?? '/'} replace />
  }

  function pressKey(key: string) {
    setError(null)
    if (key === 'clear') setPin('')
    else if (key === 'backspace') setPin((current) => current.slice(0, -1))
    else setPin((current) => current.length < 6 ? current + key : current)
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setIsSubmitting(true)
    if (mode === 'cashier') {
      if (!/^\d{6}$/.test(pin)) {
        setError('Enter your 6-digit cashier PIN.')
        setIsSubmitting(false)
        return
      }
      const { data, error: requestError } = await supabase.functions.invoke('cashier-login', {
        body: { action: 'sign_in', pin },
      })
      if (requestError || data?.error) {
        setError(data?.error || 'Unable to sign in. Check your PIN and try again.')
        setIsSubmitting(false)
        return
      }
      if (!data?.session?.access_token || !data?.session?.refresh_token) {
        setError('Sign-in could not be completed. Please try again.')
        setIsSubmitting(false)
        return
      }
      const { error: sessionError } = await supabase.auth.setSession({
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
      })
      if (sessionError) setError('Sign-in could not be completed. Please try again.')
    } else {
      if (!email.trim() || !password) {
        setError('Enter your owner/admin email and password.')
        setIsSubmitting(false)
        return
      }
      const result = await signIn(email.trim(), password)
      if (result.error) setError(result.error)
    }
    setIsSubmitting(false)
  }

  return (
    <main className="min-h-screen bg-[#f7f9f7] text-[#18352b] lg:grid lg:grid-cols-[1.04fr_0.96fr]">
      <section className="relative flex min-h-[440px] flex-col justify-between overflow-hidden border-b border-[#e6ece7] px-7 py-8 sm:px-12 sm:py-10 lg:min-h-screen lg:border-b-0 lg:border-r lg:px-14 xl:px-20">
        <div className="pointer-events-none absolute -left-40 -top-48 h-[560px] w-[560px] rounded-full border border-[#dce9df]" />
        <div className="pointer-events-none absolute -bottom-64 -right-36 h-[620px] w-[620px] rounded-full bg-[#edf4ee]" />
        <div className="relative z-10 flex items-center gap-3">
          <img src="/jiuze-logo.png" alt="JIUZE" className="h-12 w-12 object-contain" />
          <div>
            <p className="text-2xl font-bold tracking-tight text-[#123d2e]">JIUZE <span className="text-[#b58b32]">POS</span></p>
            <p className="mt-0.5 text-[10px] font-medium uppercase tracking-[0.25em] text-[#75867d]">Business made simple</p>
          </div>
        </div>

        <div className="relative z-10 mx-auto my-12 w-full max-w-[590px] lg:my-0 lg:py-12">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.22em] text-[#9b792e]">A clearer way to run your business</p>
          <h1 className="max-w-xl text-4xl font-semibold leading-[1.12] tracking-tight text-[#173b2e] sm:text-5xl xl:text-[56px]">
            Your business,<br />under control.
          </h1>
          <p className="mt-5 max-w-md text-base leading-7 text-[#718078] sm:text-lg">
            One simple workspace to manage sales, inventory, customers and performance.
          </p>

          <div className="mt-10 max-w-[520px] rounded-2xl border border-[#e1e9e2] bg-white p-5 shadow-[0_18px_50px_rgba(28,66,47,0.06)] sm:p-6">
            <div className="flex items-center justify-between border-b border-[#edf1ed] pb-4">
              <div>
                <p className="text-sm font-semibold text-[#29483a]">Business overview</p>
                <p className="mt-1 text-xs text-[#94a198]">A quick look at your operations</p>
              </div>
              <span className="rounded-full bg-[#edf6ef] px-3 py-1 text-[10px] font-semibold text-[#28734f]">LIVE</span>
            </div>
            <div className="grid grid-cols-2 gap-3 pt-4 sm:grid-cols-3">
              <div className="rounded-xl bg-[#f7faf7] p-3">
                <p className="text-[11px] text-[#8b9990]">Sales</p>
                <p className="mt-2 text-xl font-semibold text-[#1d4935]">Track</p>
                <p className="mt-1 text-[10px] text-[#9aa69e]">Daily performance</p>
              </div>
              <div className="rounded-xl bg-[#f7faf7] p-3">
                <p className="text-[11px] text-[#8b9990]">Inventory</p>
                <p className="mt-2 text-xl font-semibold text-[#1d4935]">Manage</p>
                <p className="mt-1 text-[10px] text-[#9aa69e]">Stock movement</p>
              </div>
              <div className="col-span-2 rounded-xl bg-[#f7faf7] p-3 sm:col-span-1">
                <p className="text-[11px] text-[#8b9990]">Reports</p>
                <p className="mt-2 text-xl font-semibold text-[#1d4935]">Understand</p>
                <p className="mt-1 text-[10px] text-[#9aa69e]">Business insights</p>
              </div>
            </div>
            <div className="mt-4 flex items-end gap-1.5 rounded-xl bg-[#f7faf7] px-4 pb-3 pt-5" aria-hidden="true">
              {[34, 48, 40, 62, 52, 76, 58, 88, 68, 96, 74, 84].map((height, index) => (
                <div key={index} className="flex-1 rounded-t-sm bg-[#2e7956]" style={{ height: height + 'px', opacity: 0.35 + index * 0.05 }} />
              ))}
            </div>
          </div>
          <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-xs text-[#7c8b82]">
            <span>Fast checkout</span><span>Stock control</span><span>Clear reporting</span>
          </div>
        </div>

        <footer className="relative z-10 flex flex-wrap gap-x-5 gap-y-2 border-t border-[#e2e9e3] pt-5 text-xs text-[#89968e]">
          <a href="tel:0710307318" className="transition hover:text-[#1e6547]">0710 307 318</a>
          <a href="https://www.jiuze.co.ke" target="_blank" rel="noreferrer" className="transition hover:text-[#1e6547]">jiuze.co.ke</a>
          <a href="mailto:jiuzekenya@gmail.com" className="transition hover:text-[#1e6547]">jiuzekenya@gmail.com</a>
          <span>@jiuzekenya</span>
        </footer>
      </section>

      <section className="relative flex min-h-[620px] items-center justify-center overflow-hidden bg-white px-5 py-12 sm:px-10 lg:min-h-screen lg:px-12">
        <div className="pointer-events-none absolute -right-40 -top-44 h-[520px] w-[520px] rounded-full border border-[#edf2ed]" />
        <div className="pointer-events-none absolute -bottom-52 -left-40 h-[520px] w-[520px] rounded-full bg-[#f8faf8]" />
        <form onSubmit={handleSubmit} className="relative z-10 w-full max-w-[470px]" noValidate>
          <div className="mb-9">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#a17d31]">Welcome back</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-[#183d2e]">Sign in to JIUZE POS</h2>
            <p className="mt-2 text-sm leading-6 text-[#87948c]">Choose your access type to continue to your business.</p>
          </div>

          <div className="mb-8 grid grid-cols-2 rounded-xl border border-[#e5ebe6] bg-[#f6f8f6] p-1.5">
            <button type="button" onClick={() => { setMode('cashier'); setError(null) }} className={`rounded-lg px-3 py-3 text-sm font-semibold transition ${mode === 'cashier' ? 'bg-[#145c40] text-white shadow-sm' : 'text-[#75837a] hover:text-[#24543e]'}`}>Cashier login</button>
            <button type="button" onClick={() => { setMode('owner'); setError(null) }} className={`rounded-lg px-3 py-3 text-sm font-semibold transition ${mode === 'owner' ? 'bg-[#145c40] text-white shadow-sm' : 'text-[#75837a] hover:text-[#24543e]'}`}>Owner / Admin</button>
          </div>

          {mode === 'cashier' ? <>
            <div className="mb-5">
              <h3 className="text-lg font-semibold text-[#254536]">Enter your 6-digit PIN</h3>
              <p className="mt-1 text-sm text-[#8a978f]">Your PIN securely identifies your cashier account.</p>
            </div>
            <input aria-label="Cashier PIN" type="password" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={pin} onChange={(event) => { setPin(event.target.value.replace(/\D/g, '').slice(0, 6)); setError(null) }} className="field h-14 w-full rounded-xl border border-[#dfe7e0] bg-[#fbfcfb] text-center text-2xl tracking-[0.8em] text-[#16452f] placeholder:text-[#aab5ad] focus:border-[#2b7654] focus:ring-2 focus:ring-[#2b7654]/10" placeholder="••••••" disabled={isSubmitting} />
            <div className="mt-4 grid grid-cols-3 gap-2.5" aria-label="On-screen numeric keypad">
              {keypadRows.flat().map((key) => <button key={key} type="button" onClick={() => pressKey(key)} disabled={isSubmitting || pin.length >= 6} className="min-h-14 rounded-xl border border-[#e1e9e2] bg-white text-lg font-semibold text-[#315b46] transition hover:border-[#9dbba6] hover:bg-[#f5f9f5] active:scale-[0.98] disabled:opacity-50">{key}</button>)}
              <button type="button" onClick={() => pressKey('backspace')} disabled={isSubmitting || !pin} aria-label="Delete last PIN digit" className="min-h-14 rounded-xl border border-[#e1e9e2] bg-white text-lg text-[#60766a] transition hover:bg-[#f5f9f5] disabled:opacity-50">⌫</button>
              <button type="button" onClick={() => pressKey('0')} disabled={isSubmitting || pin.length >= 6} className="min-h-14 rounded-xl border border-[#e1e9e2] bg-white text-lg font-semibold text-[#315b46] transition hover:bg-[#f5f9f5] disabled:opacity-50">0</button>
              <button type="button" onClick={() => pressKey('clear')} disabled={isSubmitting || !pin} className="min-h-14 rounded-xl border border-[#e1e9e2] bg-white text-xs font-semibold text-[#60766a] transition hover:bg-[#f5f9f5] disabled:opacity-50">Clear</button>
            </div>
          </> : <div className="space-y-4">
            <div><label htmlFor="owner-email" className="mb-2 block text-sm font-medium text-[#53685c]">Email address</label><input id="owner-email" type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} className="field h-12 w-full rounded-xl border border-[#dfe7e0] bg-[#fbfcfb] text-[#183d2e] placeholder:text-[#aab5ad] focus:border-[#2b7654] focus:ring-2 focus:ring-[#2b7654]/10" placeholder="Enter your email" disabled={isSubmitting} /></div>
            <div><label htmlFor="owner-password" className="mb-2 block text-sm font-medium text-[#53685c]">Password</label><div className="relative"><input id="owner-password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} className="field h-12 w-full rounded-xl border border-[#dfe7e0] bg-[#fbfcfb] pr-16 text-[#183d2e] placeholder:text-[#aab5ad] focus:border-[#2b7654] focus:ring-2 focus:ring-[#2b7654]/10" placeholder="Enter your password" disabled={isSubmitting} /><button type="button" onClick={() => setShowPassword((current) => !current)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md px-2 py-1.5 text-xs font-medium text-[#718278] hover:text-[#145c40]">{showPassword ? 'Hide' : 'Show'}</button></div></div>
          </div>}

          {error && <p role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm leading-relaxed text-red-700">{error}</p>}
          <button type="submit" disabled={isSubmitting || (mode === 'cashier' && pin.length !== 6)} className="mt-5 min-h-13 w-full rounded-xl bg-[#145c40] px-4 py-3.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#104b34] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50">{isSubmitting ? 'Signing in…' : mode === 'cashier' ? 'Continue with PIN' : 'Sign in to your account'}</button>
          <div className="mt-6 flex items-center justify-between gap-3 border-t border-[#edf1ed] pt-5 text-xs">
            <Link to="/reset-password" className="font-medium text-[#286749] transition hover:text-[#123d2e]">Forgot password?</Link>
            <Link to="/signup" className="font-medium text-[#87948c] transition hover:text-[#286749]">Create account</Link>
          </div>
          <p className="mt-8 text-center text-[11px] text-[#a0aaa3]">Secure access to your business workspace</p>
        </form>
      </section>
    </main>
  )
}
