import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { createSupabaseMock } from '../test/supabaseMock'

const mock = createSupabaseMock()

vi.mock('../lib/supabase', () => ({
  get supabase() {
    return mock.supabase
  },
}))

const { AuthProvider } = await import('../contexts/AuthContext')
const { default: Login } = await import('./Login')

function renderLogin() {
  return render(
    <MemoryRouter initialEntries={['/login']}>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<div>protected-app-shell</div>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>
  )
}

describe('Login', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mock.__setInitialSession(null)
  })

  it('shows a validation error when submitted empty', async () => {
    const user = userEvent.setup()
    renderLogin()

    await user.click(
      await screen.findByRole('button', { name: /sign in/i }),
    )

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /enter your email and password/i,
    )
  })

  it('shows a loading state while signing in, then an error for invalid credentials', async () => {
    const user = userEvent.setup()
    renderLogin()

    await user.type(
      await screen.findByLabelText(/email/i),
      'owner@test.com',
    )

    await user.type(
      screen.getByLabelText('Password', { selector: 'input' }),
      'wrong-password',
    )

    const submit = screen.getByRole('button', { name: /sign in/i })

    await user.click(submit)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /incorrect email or password/i,
    )

    expect(submit).not.toBeDisabled()
  })

  it('signs in with valid credentials and leaves the login screen', async () => {
    const user = userEvent.setup()
    renderLogin()

    await user.type(
      await screen.findByLabelText(/email/i),
      'owner@test.com',
    )

    await user.type(
      screen.getByLabelText('Password', { selector: 'input' }),
      'correct-password',
    )

    await user.click(
      screen.getByRole('button', { name: /sign in/i }),
    )

    await waitFor(() =>
      expect(
        screen.getByText('protected-app-shell'),
      ).toBeInTheDocument(),
    )
  })

  it('redirects away from Login immediately if already authenticated', async () => {
    mock.__setInitialSession({
      user: {
        id: 'user-1',
        email: 'owner@test.com',
      },
    })

    renderLogin()

    await waitFor(() =>
      expect(
        screen.getByText('protected-app-shell'),
      ).toBeInTheDocument(),
    )
  })
})