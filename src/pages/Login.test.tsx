import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { createSupabaseMock } from '../test/supabaseMock'

const mock = createSupabaseMock()
vi.mock('../lib/supabase', () => ({ get supabase() { return mock.supabase } }))
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
    </MemoryRouter>,
  )
}

describe('Login', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mock.__setInitialSession(null)
    ;(mock.supabase.functions.invoke as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { error: 'Invalid PIN. Check your PIN and try again.' }, error: null,
    })
  })

  it('shows a cashier PIN keypad by default without asking for business or cashier selection', () => {
    renderLogin()
    expect(screen.getByLabelText('Cashier PIN')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sign in with PIN →' })).toBeDisabled()
    expect(screen.queryByLabelText('Select business')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Select cashier')).not.toBeInTheDocument()
  })

  it('submits the six-digit PIN to the cashier login function', async () => {
    const user = userEvent.setup()
    renderLogin()
    await user.type(screen.getByLabelText('Cashier PIN'), '123456')
    await user.click(screen.getByRole('button', { name: 'Sign in with PIN →' }))
    await waitFor(() => {
      expect(mock.supabase.functions.invoke).toHaveBeenCalledWith('cashier-login', {
        body: { action: 'sign_in', pin: '123456' },
      })
    })
    expect(await screen.findByRole('alert')).toHaveTextContent(/invalid pin/i)
  })

  it('keeps owner/admin email and password sign-in available', async () => {
    const user = userEvent.setup()
    renderLogin()
    await user.click(screen.getByRole('button', { name: 'Owner / Admin' }))
    await user.type(screen.getByLabelText('Email address'), 'owner@test.com')
    await user.type(screen.getByLabelText('Password'), 'correct-password')
    await user.click(screen.getByRole('button', { name: 'Sign in →' }))
    expect(await screen.findByText('protected-app-shell')).toBeInTheDocument()
  })

  it('redirects away from Login immediately if already authenticated', async () => {
    mock.__setInitialSession({ user: { id: 'user-1', email: 'owner@test.com' } })
    renderLogin()
    await waitFor(() => expect(screen.getByText('protected-app-shell')).toBeInTheDocument())
  })
})
