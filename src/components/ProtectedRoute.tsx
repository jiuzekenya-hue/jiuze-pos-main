import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/auth-context'
import SessionLoading from './SessionLoading'

export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const { session, isSessionLoading } = useAuth()
  const location = useLocation()

  if (isSessionLoading) {
    return <SessionLoading />
  }

  if (!session) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  return <>{children}</>
}
