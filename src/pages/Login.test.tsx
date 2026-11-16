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
    ;(mock.supabase.functions.invoke as any).mockImplementation(async (_name: string, options: any) => {
      if (options?.body?.action === 'sign_in') return { data: { error: 'Incorrect PIN. Try again.' }, error: null }
      return { data: {}, error: null }
    })
  })

  it('shows cashier PIN login without exposing business or cashier directories', () => {
    renderLogin()
    expect(screen.getByLabelText('Cashier PIN')).toBeInTheDocument()
    expect(screen.queryByLabelText('Select business')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Select cashier')).not.toBeInTheDocument()
  })

  it('requires a complete six-digit PIN before enabling sign in', () => {
    renderLogin()
    expect(screen.getByRole('button', { name: /sign in with pin/i })).toBeDisabled()
  })

  it('submits only the PIN to the cashier authentication endpoint', async () => {
    const user = userEvent.setup()
    renderLogin()
    await user.type(screen.getByLabelText('Cashier PIN'), '123456')
    await user.click(screen.getByRole('button', { name: /sign in with pin/i }))
    await waitFor(() => {
      expect(mock.supabase.functions.invoke).toHaveBeenCalledWith('cashier-login', {
        body: { action: 'sign_in', pin: '123456' },
      })
    })
    expect(await screen.findByRole('alert')).toHaveTextContent(/incorrect pin/i)
  })

  it('redirects away from Login immediately if already authenticated', async () => {
    mock.__setInitialSession({ user: { id: 'user-1', email: 'owner@test.com' } })
    renderLogin()
    await waitFor(() => expect(screen.getByText('protected-app-shell')).toBeInTheDocument())
  })
})
