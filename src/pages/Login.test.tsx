
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

const businesses = [{ id: 'business-1', name: 'Test Business' }]
const cashiers = [{ id: 'cashier-1', fullName: 'Test Cashier' }]

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


function configureDirectory() {
  const invokeMock = mock.supabase.functions.invoke as unknown as {
    mockImplementation: (
      implementation: (
        name: string,
        options?: { body?: unknown },
      ) => Promise<unknown>,
    ) => unknown
  }

  invokeMock.mockImplementation(async (_name, options) => {
    const body = options?.body as { action?: string } | undefined

    if (body?.action === 'businesses') {
      return { data: { businesses }, error: null }
    }

    if (body?.action === 'cashiers') {
      return { data: { cashiers }, error: null }
    }

    if (body?.action === 'sign_in') {
      return {
        data: { error: 'Incorrect email or password.' },
        error: null,
      }
    }

    return { data: {}, error: null }
  })
}


describe('Login', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mock.__setInitialSession(null)
    configureDirectory()
  })

  it('loads the business and cashier directories', async () => {
    renderLogin()

    expect(await screen.findByRole('option', { name: 'Test Business' })).toBeInTheDocument()
    expect(await screen.findByRole('option', { name: 'Test Cashier' })).toBeInTheDocument()
  })

  it('shows a validation error when submitted without a password', async () => {
    const user = userEvent.setup()
    renderLogin()

    await screen.findByRole('option', { name: 'Test Cashier' })
    await user.click(screen.getByRole('button', { name: /^sign in$/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/enter your password/i)
  })

  it('shows an error for invalid credentials and re-enables sign in', async () => {
    const user = userEvent.setup()
    renderLogin()

    await screen.findByRole('option', { name: 'Test Cashier' })
    await user.type(screen.getByLabelText('Password'), 'wrong-password')
    await user.click(screen.getByRole('button', { name: /^sign in$/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/incorrect email or password/i)
    expect(screen.getByRole('button', { name: /^sign in$/i })).toBeEnabled()
  })

  it('submits the selected business, cashier, and password', async () => {
    const user = userEvent.setup()
    renderLogin()

    await screen.findByRole('option', { name: 'Test Cashier' })
    await user.type(screen.getByLabelText('Password'), 'wrong-password')
    await user.click(screen.getByRole('button', { name: /^sign in$/i }))

    await waitFor(() => {
      expect(mock.supabase.functions.invoke).toHaveBeenCalledWith(
        'cashier-login',
        {
          body: {
            action: 'sign_in',
            businessId: 'business-1',
            cashierId: 'cashier-1',
            password: 'wrong-password',
          },
        },
      )
    })
  })

  it('redirects away from Login immediately if already authenticated', async () => {
    mock.__setInitialSession({
      user: { id: 'user-1', email: 'owner@test.com' },
    })

    renderLogin()

    await waitFor(() => {
      expect(screen.getByText('protected-app-shell')).toBeInTheDocument()
    })
  })
})
