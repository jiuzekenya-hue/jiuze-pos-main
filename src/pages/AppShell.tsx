import { useAuth } from '../contexts/auth-context'
import { useOnlineStatus } from '../lib/useOnlineStatus'

export default function AppShell() {
  const { user, role, isProfileLoading, isSchemaPending, profileLoadResult, signOut } = useAuth()
  const isOnline = useOnlineStatus()

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-line bg-paper-raised">
        <div className="max-w-3xl mx-auto px-6 py-5 flex items-center justify-between">
          <div className="flex items-baseline gap-2">
            <span className="font-display font-bold text-xl tracking-tight text-ink">JIUZE</span>
            <span className="font-display font-medium text-xl tracking-tight text-market-600">
              POS
            </span>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span
                className={`h-2 w-2 rounded-full ${isOnline ? 'bg-market-400' : 'bg-brick-500'}`}
                aria-hidden="true"
              />
              <span className="text-xs font-mono text-ink-muted">
                {isOnline ? 'online' : 'offline'}
              </span>
            </div>
            <button
              onClick={() => void signOut()}
              className="text-xs font-medium text-ink-muted hover:text-brick-600 transition-colors"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-6">
        <div className="w-full max-w-md">
          <div className="bg-paper-raised border border-line rounded-lg shadow-sm overflow-hidden">
            <div className="px-6 pt-6 pb-5">
              <p className="text-xs font-mono uppercase tracking-wide text-market-600 mb-1">
                Phase 2 — Authentication and Roles
              </p>
              <h1 className="font-display font-semibold text-2xl text-ink">You're signed in</h1>
              <p className="text-sm text-ink-muted mt-2 leading-relaxed">
                {user?.email}
              </p>
            </div>

            <div className="tear-line" />

            <div className="px-6 py-5 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-sm text-ink-muted">Role</span>
                <span className="font-mono text-xs px-2 py-0.5 rounded bg-market-50 text-market-700">
                  {isProfileLoading ? 'loading…' : (role ?? 'unassigned')}
                </span>
              </div>

              {isSchemaPending && (
                <p className="text-xs text-ink-faint leading-relaxed pt-1">
                  The <code className="font-mono">profiles</code> table doesn't exist yet, so
                  role isn't loaded. That's expected until Phase 3 creates the schema.
                </p>
              )}

              {profileLoadResult?.status === 'not_found' && (
                <p className="text-xs text-ink-faint leading-relaxed pt-1">
                  No profile row exists for this user yet. Once Phase 3 creates the schema
                  and a business owner adds this user, their role will appear here.
                </p>
              )}

              {profileLoadResult?.status === 'error' && (
                <p className="text-xs text-brick-600 leading-relaxed pt-1">
                  Couldn't load profile: {profileLoadResult.reason}
                </p>
              )}
            </div>
          </div>

          <p className="text-center text-xs text-ink-faint mt-6">
            Powered by <span className="font-medium text-ink-muted">JIUZE</span>
          </p>
        </div>
      </main>
    </div>
  )
}
