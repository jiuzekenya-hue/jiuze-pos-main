import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/auth-context'
import { can } from '../lib/permissions'
import { createCashier, listBusinessUsers, type CashierUser } from '../services/cashierService'

export default function Users() {
  const { role } = useAuth()
  const [users, setUsers] = useState<CashierUser[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({ email: '', password: '', fullName: '', phone: '' })

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      setUsers(await listBusinessUsers())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load users.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (can(role, 'userManagement')) void load()
    else setLoading(false)
  }, [role])

  if (!can(role, 'userManagement')) {
    return (
      <main className="min-h-screen bg-paper px-6 py-8">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center justify-between mb-8">
            <div><p className="text-xs font-mono uppercase tracking-wide text-market-600">Phase 4</p><h1 className="font-display font-semibold text-3xl text-ink mt-1">Users</h1></div>
            <Link to="/" className="text-sm text-market-700">Home</Link>
          </div>
          <div className="rounded-lg border border-line bg-paper-raised p-8 text-center">
            <h2 className="font-medium text-ink">Access restricted</h2>
            <p className="text-sm text-ink-muted mt-2">User management is available to business owners only.</p>
          </div>
        </div>
      </main>
    )
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      const created = await createCashier(form)
      setUsers((current) => [...current, created])
      setForm({ email: '', password: '', fullName: '', phone: '' })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create cashier.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="min-h-screen bg-paper px-6 py-8">
      <div className="max-w-5xl mx-auto">
        <header className="flex items-start justify-between gap-4 mb-8">
          <div><p className="text-xs font-mono uppercase tracking-wide text-market-600">Phase 4</p><h1 className="font-display font-semibold text-3xl text-ink mt-1">Users</h1><p className="text-sm text-ink-muted mt-2">Manage cashiers for your business.</p></div>
          <Link to="/" className="text-sm text-market-700">Home</Link>
        </header>

        {error && <div role="alert" className="mb-6 rounded-md border border-brick-200 bg-brick-50 px-4 py-3 text-sm text-brick-700">{error}</div>}

        <form onSubmit={submit} className="bg-paper-raised border border-line rounded-lg p-5 mb-6">
          <h2 className="font-display font-semibold text-lg text-ink">Add cashier</h2>
          <p className="text-sm text-ink-muted mt-1 mb-5">Create a login for a staff member. They will be assigned the cashier role.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="Email" aria-label="Email" className="field" />
            <input required type="password" minLength={8} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Temporary password (8+ characters)" aria-label="Password" className="field" />
            <input value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} maxLength={100} placeholder="Full name" aria-label="Full name" className="field" />
            <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} maxLength={50} placeholder="Phone (optional)" aria-label="Phone" className="field" />
          </div>
          <button type="submit" disabled={saving} className="mt-4 rounded-md bg-ink px-4 py-2 text-sm font-medium text-paper disabled:opacity-50">{saving ? 'Creating…' : 'Create cashier'}</button>
        </form>

        <section className="bg-paper-raised border border-line rounded-lg overflow-hidden">
          <div className="px-5 py-4 border-b border-line flex items-center justify-between"><h2 className="font-medium text-ink">Business users</h2><span className="text-xs font-mono text-ink-muted">{users.length}</span></div>
          {loading ? <div className="px-5 py-10 text-center text-sm text-ink-muted">Loading users…</div> : users.length === 0 ? <div className="px-5 py-12 text-center text-sm text-ink-muted">No users found.</div> : <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b border-line text-left text-xs text-ink-muted"><th className="px-5 py-3">Name</th><th className="px-3 py-3">Email</th><th className="px-3 py-3">Phone</th><th className="px-3 py-3">Role</th><th className="px-5 py-3">Created</th></tr></thead><tbody className="divide-y divide-line">{users.map((user) => <tr key={user.id}><td className="px-5 py-4 font-medium text-ink">{user.fullName || '—'}</td><td className="px-3 py-4 text-ink-muted">{user.email || '—'}</td><td className="px-3 py-4 text-ink-muted">{user.phone || '—'}</td><td className="px-3 py-4 capitalize text-ink-muted">{user.role}</td><td className="px-5 py-4 text-ink-muted">{new Date(user.createdAt).toLocaleDateString()}</td></tr>)}</tbody></table></div>}
        </section>

        <nav className="mt-6 flex flex-wrap gap-4 text-sm"><Link to="/products" className="text-market-700">Products</Link><Link to="/sales" className="text-market-700">Sales history</Link><Link to="/categories" className="text-market-700">Categories</Link></nav>
      </div>
    </main>
  )
}
