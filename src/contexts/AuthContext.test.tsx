import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createSupabaseMock } from '../test/supabaseMock'

const mock = createSupabaseMock()

vi.mock('../lib/supabase', () => ({
  get supabase() {
    return mock.supabase
  },
}))

const { AuthProvider } = await import('./AuthContext')
const { useAuth } = await import('./auth-context')

function Probe() {
  const { isSessionLoading, session, user, role, isSchemaPending, signIn, signOut } = useAuth()

  return (
    <div>
      <div data-testid="session-loading">{String(isSessionLoading)}</div>
      <div data-testid="session">{session ? 'has-session' : 'no-session'}</div>
      <div data-testid="user-email">{user?.email ?? ''}</div>
      <div data-testid="role">{role ?? 'none'}</div>
      <div data-testid="schema-pending">{String(isSchemaPending)}</div>
      <button onClick={() => void signIn('owner@test.com', 'correct-password')}>
        sign-in-valid
      </button>
      <button onClick={() => void signIn('owner@test.com', 'wrong-password')}>
        sign-in-invalid
      </button>
      <button onClick={() => void signOut()}>sign-out</button>
    </div>
  )
}

describe('AuthProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mock.__setInitialSession(null)
    mock.__setProfilesQueryResult({
      data: null,
      error: { code: '42P01', message: 'relation "public.profiles" does not exist' },
    })
  })

  it('starts in a loading state and resolves to "no session" when none exists', async () => {
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    )

    await waitFor(() => expect(screen.getByTestId('session-loading')).toHaveTextContent('false'))
    expect(screen.getByTestId('session')).toHaveTextContent('no-session')
  })

  it('restores an existing session automatically on mount (refresh simulation)', async () => {
    mock.__setInitialSession({ user: { id: 'user-1', email: 'owner@test.com' } })

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    )

    await waitFor(() => expect(screen.getByTestId('session-loading')).toHaveTextContent('false'))
    expect(screen.getByTestId('session')).toHaveTextContent('has-session')
    expect(screen.getByTestId('user-email')).toHaveTextContent('owner@test.com')
  })

  it('signs in successfully with valid credentials and establishes a session', async () => {
    const user = userEvent.setup()
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    )
    await waitFor(() => expect(screen.getByTestId('session-loading')).toHaveTextContent('false'))

    await user.click(screen.getByText('sign-in-valid'))

    await waitFor(() => expect(screen.getByTestId('session')).toHaveTextContent('has-session'))
    expect(mock.supabase.auth.signInWithPassword).toHaveBeenCalledWith({
      email: 'owner@test.com',
      password: 'correct-password',
    })
  })

  it('rejects invalid credentials and does not establish a session', async () => {
    const user = userEvent.setup()
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    )
    await waitFor(() => expect(screen.getByTestId('session-loading')).toHaveTextContent('false'))

    await user.click(screen.getByText('sign-in-invalid'))

    expect(screen.getByTestId('session')).toHaveTextContent('no-session')
  })

  it('signs out and clears the session', async () => {
    mock.__setInitialSession({ user: { id: 'user-1', email: 'owner@test.com' } })
    const user = userEvent.setup()

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    )
    await waitFor(() => expect(screen.getByTestId('session')).toHaveTextContent('has-session'))

    await user.click(screen.getByText('sign-out'))

    await waitFor(() => expect(screen.getByTestId('session')).toHaveTextContent('no-session'))
    expect(mock.supabase.auth.signOut).toHaveBeenCalled()
  })

  it('reports schema_pending for the role while the profiles table does not exist', async () => {
    mock.__setInitialSession({ user: { id: 'user-1', email: 'owner@test.com' } })

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    )

    await waitFor(() => expect(screen.getByTestId('schema-pending')).toHaveTextContent('true'))
    expect(screen.getByTestId('role')).toHaveTextContent('none')
  })
})
