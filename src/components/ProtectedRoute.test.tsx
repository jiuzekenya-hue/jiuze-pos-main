import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { createSupabaseMock } from '../test/supabaseMock'

const mock = createSupabaseMock()

vi.mock('../lib/supabase', () => ({
  get supabase() {
    return mock.supabase
  },
}))

const { AuthProvider } = await import('../contexts/AuthContext')
const { default: ProtectedRoute } = await import('./ProtectedRoute')

function renderApp() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<div>login-screen</div>} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <div>protected-content</div>
              </ProtectedRoute>
            }
          />
        </Routes>
      </AuthProvider>
    </MemoryRouter>
  )
}

describe('ProtectedRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows a loading state before the session check resolves', () => {
    mock.__setInitialSession(null)
    renderApp()

    expect(screen.getByText(/checking session/i)).toBeInTheDocument()
  })

  it('redirects to Login when there is no session', async () => {
    mock.__setInitialSession(null)
    renderApp()

    await waitFor(() => expect(screen.getByText('login-screen')).toBeInTheDocument())
    expect(screen.queryByText('protected-content')).not.toBeInTheDocument()
  })

  it('renders protected content when a session exists', async () => {
    mock.__setInitialSession({ user: { id: 'user-1', email: 'owner@test.com' } })
    renderApp()

    await waitFor(() => expect(screen.getByText('protected-content')).toBeInTheDocument())
    expect(screen.queryByText('login-screen')).not.toBeInTheDocument()
  })
})
