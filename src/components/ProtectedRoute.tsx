import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/auth-context'
import SessionLoading from './SessionLoading'
import { supabase } from '../lib/supabase'

async function supabaseSignOut() {
  await supabase.auth.signOut()
}

export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const { session, isSessionLoading, isProfileLoading, profileLoadResult } = useAuth()
  const location = useLocation()

  if (isSessionLoading) {
    return <SessionLoading />
  }

  if (!session) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  // Never render the app until the profile belonging to the current auth
  // user has loaded. This prevents a previous user's role/business from
  // appearing briefly during account switches.
  if (isProfileLoading || !profileLoadResult) {
    return <SessionLoading />
  }

  if (profileLoadResult.status !== 'loaded') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-5">
        <div className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-6 text-center shadow-sm">
          <h1 className="text-base font-semibold text-gray-900">Account setup incomplete</h1>
          <p className="mt-2 text-sm leading-relaxed text-gray-500">
            We could not load the business account linked to this login. Sign out and try again.
          </p>
          <button
            type="button"
            onClick={() => void supabaseSignOut()}
            className="mt-5 rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-medium text-white"
          >
            Sign out
          </button>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
