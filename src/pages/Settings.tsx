import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/auth-context'
import { can } from '../lib/permissions'
import { supabase } from '../lib/supabase'
import { getBusiness, type Business } from '../services/businessService'

export default function Settings() {
  const { role, profile, user } = useAuth()
  const [business, setBusiness] = useState<Business | null>(null)
  const [allowNegativeStock, setAllowNegativeStock] = useState(false)
  const [lowStockThreshold, setLowStockThreshold] = useState('5')
  const [businessForm, setBusinessForm] = useState({ name: '', phone: '', location: '' })
  const [passwordForm, setPasswordForm] = useState({ current: '', password: '', confirm: '' })
  const [showPasswords, setShowPasswords] = useState(false)
  const [loading, setLoading] = useState(true)
  const [savingBusiness, setSavingBusiness] = useState(false)
  const [savingInventory, setSavingInventory] = useState(false)
  const [savingPassword, setSavingPassword] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    const load = async () => {
      if (!profile?.businessId || role !== 'owner') {
        setLoading(false)
        return
      }
      setLoading(true)
      setError('')
      try {
        const [businessData, settingsResult] = await Promise.all([
          getBusiness(profile.businessId),
          supabase.from('settings').select('low_stock_threshold, allow_negative_stock').eq('business_id', profile.businessId).single(),
        ])
        if (settingsResult.error) throw new Error(settingsResult.error.message)
        setBusiness(businessData)
        setBusinessForm({ name: businessData.name, phone: businessData.phone ?? '', location: businessData.location ?? '' })
        setLowStockThreshold(String(settingsResult.data?.low_stock_threshold ?? 5))
        setAllowNegativeStock(Boolean(settingsResult.data?.allow_negative_stock ?? false))
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unable to load settings.')
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [profile?.businessId, role])

  if (!can(role, 'settings')) {
    return (
      <main className="min-h-screen bg-paper px-5 py-8 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <header className="mb-8">
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-market-600">Configuration</p>
            <h1 className="mt-2 font-display text-3xl font-semibold text-ink sm:text-4xl">Settings</h1>
          </header>
          <div className="rounded-2xl border border-line bg-paper-raised p-10 text-center">
            <h2 className="font-display text-xl font-semibold text-ink">Access restricted</h2>
            <p className="mt-2 text-sm text-ink-muted">Settings are available to business owners only.</p>
          </div>
        </div>
      </main>
    )
  }

  const saveBusiness = async (event: FormEvent) => {
    event.preventDefault()
    if (!profile?.businessId) return
    if (!businessForm.name.trim()) {
      setError('Business name is required.')
      return
    }
    setSavingBusiness(true)
    setError('')
    setMessage('')
    try {
      const { error: businessError } = await supabase
        .from('businesses')
        .update({
          name: businessForm.name.trim(),
          phone: businessForm.phone.trim() || null,
          location: businessForm.location.trim() || null,
        })
        .eq('id', profile.businessId)
      if (businessError) throw new Error(businessError.message)
      setBusiness((current) => current ? { ...current, name: businessForm.name.trim(), phone: businessForm.phone.trim() || null, location: businessForm.location.trim() || null } : current)
      setMessage('Business settings saved successfully.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save business settings.')
    } finally {
      setSavingBusiness(false)
    }
  }

  const saveInventory = async (event: FormEvent) => {
    event.preventDefault()
    if (!profile?.businessId) return
    const threshold = Number(lowStockThreshold)
    if (!Number.isInteger(threshold) || threshold < 0) {
      setError('Low-stock threshold must be a whole number of 0 or more.')
      return
    }
    setSavingInventory(true)
    setError('')
    setMessage('')
    try {
      const { error: settingsError } = await supabase
        .from('settings')
        .update({ low_stock_threshold: threshold, allow_negative_stock: allowNegativeStock })
        .eq('business_id', profile.businessId)
      if (settingsError) throw new Error(settingsError.message)
      setMessage('Inventory settings saved successfully.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save inventory settings.')
    } finally {
      setSavingInventory(false)
    }
  }

  const changePassword = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    setMessage('')
    if (!passwordForm.current) {
      setError('Enter your current password to continue.')
      return
    }
    if (passwordForm.password.length < 8) {
      setError('New password must be at least 8 characters.')
      return
    }
    if (passwordForm.password === passwordForm.current) {
      setError('New password must be different from your current password.')
      return
    }
    if (passwordForm.password !== passwordForm.confirm) {
      setError('New passwords do not match.')
      return
    }
    setSavingPassword(true)
    try {
      const { error: passwordError } = await supabase.auth.updateUser({
        password: passwordForm.password,
        current_password: passwordForm.current,
      })
      if (passwordError) throw new Error(passwordError.message)
      setPasswordForm({ current: '', password: '', confirm: '' })
      setShowPasswords(false)
      setMessage('Password changed successfully. A security notification will be sent to your account email when enabled in Supabase Auth.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to change password. Check your current password and try again.')
    } finally {
      setSavingPassword(false)
    }
  }

  return (
    <main className="min-h-screen bg-paper px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1100px]">
        <header className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-market-600">Configuration</p>
            <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-ink sm:text-4xl">Settings</h1>
            <p className="mt-2 max-w-2xl text-sm text-ink-muted">Manage your store profile, inventory rules and account security.</p>
          </div>
          <Link to="/" className="inline-flex min-h-11 items-center justify-center rounded-lg border border-line bg-paper-raised px-4 py-2.5 text-sm font-medium text-ink transition hover:border-ink-muted hover:bg-paper">
            Back to dashboard
          </Link>
        </header>

        {error && (
          <div role="alert" className="mb-5 rounded-xl border border-brick-500/20 bg-brick-500/5 px-4 py-3 text-sm text-brick-600">
            {error}
          </div>
        )}
        {message && (
          <div role="status" className="mb-5 rounded-xl border border-market-100 bg-market-50 px-4 py-3 text-sm text-market-700">
            {message}
          </div>
        )}

        {loading ? (
          <div className="rounded-2xl border border-line bg-paper-raised p-14 text-center text-sm text-ink-muted">Loading settings…</div>
        ) : (
          <div className="space-y-5">
            <section className="grid gap-5 lg:grid-cols-[1.15fr_.85fr]">
              <form onSubmit={saveBusiness} className="overflow-hidden rounded-2xl border border-line bg-paper-raised">
                <div className="border-b border-line p-5 sm:p-6">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs font-medium uppercase tracking-[0.12em] text-market-600">Store profile</p>
                      <h2 className="mt-2 font-display text-xl font-semibold text-ink">Business information</h2>
                      <p className="mt-1 text-sm text-ink-muted">Details shown across your POS account.</p>
                    </div>
                    <span className="hidden rounded-full bg-market-50 px-3 py-1 text-xs font-medium text-market-700 sm:inline-flex">Owner only</span>
                  </div>
                </div>
                <div className="grid gap-4 p-5 sm:p-6">
                  <label>
                    <span className="mb-1.5 block text-xs font-medium text-ink">Business name</span>
                    <input required value={businessForm.name} onChange={(e) => setBusinessForm({ ...businessForm, name: e.target.value })} maxLength={120} className="field" />
                  </label>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label>
                      <span className="mb-1.5 block text-xs font-medium text-ink">Phone</span>
                      <input value={businessForm.phone} onChange={(e) => setBusinessForm({ ...businessForm, phone: e.target.value })} maxLength={50} inputMode="tel" className="field" />
                    </label>
                    <label>
                      <span className="mb-1.5 block text-xs font-medium text-ink">Location</span>
                      <input value={businessForm.location} onChange={(e) => setBusinessForm({ ...businessForm, location: e.target.value })} maxLength={200} className="field" />
                    </label>
                  </div>
                </div>
                <div className="flex justify-end border-t border-line px-5 py-4 sm:px-6">
                  <button type="submit" disabled={savingBusiness} className="min-h-11 rounded-lg bg-ink px-5 py-2.5 text-sm font-medium text-paper transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50">
                    {savingBusiness ? 'Saving…' : 'Save changes'}
                  </button>
                </div>
              </form>

              <form onSubmit={saveInventory} className="overflow-hidden rounded-2xl border border-line bg-paper-raised">
                <div className="border-b border-line p-5 sm:p-6">
                  <p className="text-xs font-medium uppercase tracking-[0.12em] text-market-600">Inventory rules</p>
                  <h2 className="mt-2 font-display text-xl font-semibold text-ink">Stock controls</h2>
                  <p className="mt-1 text-sm text-ink-muted">Set the rules used by your inventory.</p>
                </div>
                <div className="space-y-5 p-5 sm:p-6">
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-medium text-ink">Low-stock threshold</span>
                    <input type="number" min="0" step="1" value={lowStockThreshold} onChange={(e) => setLowStockThreshold(e.target.value)} className="field" />
                    <span className="mt-1.5 block text-xs leading-5 text-ink-muted">Products at or below this quantity are flagged as low stock.</span>
                  </label>
                  <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-line bg-paper p-4 transition hover:border-ink-faint">
                    <input type="checkbox" checked={allowNegativeStock} onChange={(e) => setAllowNegativeStock(e.target.checked)} className="mt-1 h-4 w-4 shrink-0 accent-[#2F6F4E]" />
                    <span>
                      <span className="block text-sm font-medium text-ink">Allow negative stock</span>
                      <span className="mt-1 block text-xs leading-5 text-ink-muted">Permit sales to take inventory below zero. Keep this off for normal retail control.</span>
                    </span>
                  </label>
                </div>
                <div className="flex justify-end border-t border-line px-5 py-4 sm:px-6">
                  <button type="submit" disabled={savingInventory} className="min-h-11 rounded-lg bg-ink px-5 py-2.5 text-sm font-medium text-paper transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50">
                    {savingInventory ? 'Saving…' : 'Save inventory'}
                  </button>
                </div>
              </form>
            </section>

            <form onSubmit={changePassword} className="overflow-hidden rounded-2xl border border-line bg-paper-raised">
              <div className="border-b border-line p-5 sm:p-6">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-[0.12em] text-market-600">Account security</p>
                    <h2 className="mt-2 font-display text-xl font-semibold text-ink">Change password</h2>
                    <p className="mt-1 text-sm text-ink-muted">Your current password is required before a new password can be saved.</p>
                  </div>
                  <button type="button" onClick={() => setShowPasswords((current) => !current)} className="self-start rounded-lg border border-line bg-paper px-3.5 py-2 text-xs font-medium text-ink transition hover:border-ink-muted">
                    {showPasswords ? 'Hide passwords' : 'Show passwords'}
                  </button>
                </div>
              </div>
              <div className="grid gap-4 p-5 sm:grid-cols-3 sm:p-6">
                <label>
                  <span className="mb-1.5 block text-xs font-medium text-ink">Current password</span>
                  <input required type={showPasswords ? 'text' : 'password'} autoComplete="current-password" value={passwordForm.current} onChange={(e) => setPasswordForm({ ...passwordForm, current: e.target.value })} placeholder="Current password" className="field" />
                </label>
                <label>
                  <span className="mb-1.5 block text-xs font-medium text-ink">New password</span>
                  <input required type={showPasswords ? 'text' : 'password'} minLength={8} autoComplete="new-password" value={passwordForm.password} onChange={(e) => setPasswordForm({ ...passwordForm, password: e.target.value })} placeholder="At least 8 characters" className="field" />
                </label>
                <label>
                  <span className="mb-1.5 block text-xs font-medium text-ink">Confirm new password</span>
                  <input required type={showPasswords ? 'text' : 'password'} minLength={8} autoComplete="new-password" value={passwordForm.confirm} onChange={(e) => setPasswordForm({ ...passwordForm, confirm: e.target.value })} placeholder="Repeat new password" className="field" />
                </label>
              </div>
              <div className="flex flex-col gap-3 border-t border-line px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                <div>
                  <p className="text-xs font-medium text-ink">Security notification</p>
                  <p className="mt-1 max-w-2xl text-xs leading-5 text-ink-muted">Supabase can email the owner when a password changes. Enable the password-changed notification in Supabase Auth for production.</p>
                </div>
                <button type="submit" disabled={savingPassword} className="min-h-11 shrink-0 rounded-lg bg-ink px-5 py-2.5 text-sm font-medium text-paper transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50">
                  {savingPassword ? 'Updating…' : 'Change password'}
                </button>
              </div>
            </form>

            <section className="overflow-hidden rounded-2xl border border-line bg-paper-raised">
              <div className="p-5 sm:p-6">
                <p className="text-xs font-medium uppercase tracking-[0.12em] text-market-600">Account</p>
                <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink">Owner account</p>
                    <p className="mt-1 truncate text-xs text-ink-muted">{business?.name ?? 'Business'} · {user?.email ?? 'Signed in'}</p>
                  </div>
                  <span className="inline-flex self-start rounded-full bg-market-50 px-3 py-1 text-xs font-medium capitalize text-market-700">Owner</span>
                </div>
              </div>
            </section>
          </div>
        )}
      </div>
    </main>
  )
}
