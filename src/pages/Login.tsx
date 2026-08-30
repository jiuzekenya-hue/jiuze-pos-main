import { useState, type FormEvent } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/auth-context'

export default function Login() {
  const { session, isSessionLoading, signIn } = useAuth()
  const location = useLocation()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Already signed in — bounce straight to the app (or wherever they
  // were headed before being redirected here).
  if (!isSessionLoading && session) {
    const redirectTo = (location.state as { from?: string } | null)?.from ?? '/'
    return <Navigate to={redirectTo} replace />
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    if (!email || !password) {
      setError('Enter your email and password.')
      return
    }

    setIsSubmitting(true)
    const { error: signInError } = await signIn(email, password)
    setIsSubmitting(false)

    if (signInError) {
      setError(signInError)
    }
  }

  return (
    <div className="min-h-screen flex flex-col">
      <main className="flex-1 flex items-center justify-center px-6">
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            <div className="flex items-baseline justify-center gap-2">
              <span className="font-display font-bold text-2xl tracking-tight text-ink">
                JIUZE
              </span>
              <span className="font-display font-medium text-2xl tracking-tight text-market-600">
                POS
              </span>
            </div>
            <p className="text-sm text-ink-muted mt-1">Sign in to your business</p>
          </div>

          <form
            onSubmit={handleSubmit}
            className="bg-paper-raised border border-line rounded-lg shadow-sm px-6 py-6"
            noValidate
          >
            <div className="space-y-4">
              <div>
                <label htmlFor="email" className="block text-sm text-ink-muted mb-1.5">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={isSubmitting}
                  className="w-full rounded-md border border-line bg-paper px-3 py-2 text-sm text-ink outline-none focus:border-market-600 focus:ring-1 focus:ring-market-600 disabled:opacity-60"
                  placeholder="you@business.co.ke"
                />
              </div>

              <div>
                <label htmlFor="password" className="block text-sm text-ink-muted mb-1.5">
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isSubmitting}
                  className="w-full rounded-md border border-line bg-paper px-3 py-2 text-sm text-ink outline-none focus:border-market-600 focus:ring-1 focus:ring-market-600 disabled:opacity-60"
                  placeholder="••••••••"
                />
              </div>
            </div>

            {error && (
              <p
                role="alert"
                className="mt-4 text-xs text-brick-600 bg-brick-500/5 border border-brick-500/20 rounded px-3 py-2 leading-relaxed"
              >
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="mt-5 w-full rounded-md bg-market-600 text-white text-sm font-medium py-2.5 hover:bg-market-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isSubmitting ? 'Signing in…' : 'Sign In'}
            </button>
          </form>

          <p className="text-center text-xs text-ink-faint mt-6">
            Powered by <span className="font-medium text-ink-muted">JIUZE</span>
          </p>
        </div>
      </main>
    </div>
  )
}
