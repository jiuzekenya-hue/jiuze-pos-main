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
  const [passwordForm, setPasswordForm] = useState({ password: '', confirm: '' })
  const [loading, setLoading] = useState(true)
  const [savingBusiness, setSavingBusiness] = useState(false)
  const [savingPassword, setSavingPassword] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    const load = async () => {
      if (!profile?.businessId || role !== 'owner') { setLoading(false); return }
      setLoading(true); setError('')
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
      } catch (err) { setError(err instanceof Error ? err.message : 'Unable to load settings.') } finally { setLoading(false) }
    }
    void load()
  }, [profile?.businessId, role])

  if (!can(role, 'settings')) return <main className="min-h-screen bg-paper px-5 py-8 sm:px-6"><div className="max-w-6xl mx-auto"><header className="mb-8"><p className="text-xs font-medium uppercase tracking-[0.16em] text-market-600">Configuration</p><h1 className="font-display font-semibold text-3xl sm:text-4xl text-ink mt-2">Settings</h1></header><div className="rounded-2xl border border-line bg-paper-raised p-10 text-center"><h2 className="font-display font-semibold text-xl text-ink">Access restricted</h2><p className="text-sm text-ink-muted mt-2">Settings are available to business owners only.</p></div></div></main>

  const saveBusiness = async (event: FormEvent) => {
    event.preventDefault(); if (!profile?.businessId) return
    const threshold = Number(lowStockThreshold)
    if (!businessForm.name.trim()) { setError('Business name is required.'); return }
    if (!Number.isInteger(threshold) || threshold < 0) { setError('Low-stock threshold must be a whole number of 0 or more.'); return }
    setSavingBusiness(true); setError(''); setMessage('')
    try {
      const { error: businessError } = await supabase.from('businesses').update({ name: businessForm.name.trim(), phone: businessForm.phone.trim() || null, location: businessForm.location.trim() || null }).eq('id', profile.businessId)
      if (businessError) throw new Error(businessError.message)
      const { error: settingsError } = await supabase.from('settings').update({ low_stock_threshold: threshold, allow_negative_stock: allowNegativeStock }).eq('business_id', profile.businessId)
      if (settingsError) throw new Error(settingsError.message)
      setBusiness((current) => current ? { ...current, name: businessForm.name.trim(), phone: businessForm.phone.trim() || null, location: businessForm.location.trim() || null } : current)
      setMessage('Settings saved successfully.')
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to save settings.') } finally { setSavingBusiness(false) }
  }

  const changePassword = async (event: FormEvent) => {
    event.preventDefault(); setError(''); setMessage('')
    if (passwordForm.password.length < 8) { setError('Password must be at least 8 characters.'); return }
    if (passwordForm.password !== passwordForm.confirm) { setError('Passwords do not match.'); return }
    setSavingPassword(true)
    try {
      const { error: passwordError } = await supabase.auth.updateUser({ password: passwordForm.password })
      if (passwordError) throw new Error(passwordError.message)
      setPasswordForm({ password: '', confirm: '' }); setMessage('Password changed successfully.')
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to change password.') } finally { setSavingPassword(false) }
  }

  return <main className="min-h-screen bg-paper px-5 py-6 sm:px-6 lg:px-8"><div className="max-w-[1100px] mx-auto">
    <header className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between mb-7"><div><p className="text-xs font-medium uppercase tracking-[0.16em] text-market-600">Configuration</p><h1 className="font-display font-semibold text-3xl sm:text-4xl tracking-tight text-ink mt-2">Settings</h1><p className="text-sm text-ink-muted mt-2">Manage your store profile, inventory rules and account security.</p></div><Link to="/" className="inline-flex self-start rounded-lg border border-line bg-paper-raised px-4 py-2.5 text-sm font-medium text-ink">Dashboard</Link></header>
    {error && <div role="alert" className="mb-5 rounded-xl border border-brick-200 bg-brick-50 px-4 py-3 text-sm text-brick-700">{error}</div>}
    {message && <div role="status" className="mb-5 rounded-xl border border-market-200 bg-market-50 px-4 py-3 text-sm text-market-700">{message}</div>}
    {loading ? <div className="rounded-2xl border border-line bg-paper-raised p-14 text-center text-sm text-ink-muted">Loading settings…</div> : <div className="space-y-5">
      <form onSubmit={saveBusiness} className="rounded-2xl border border-line bg-paper-raised overflow-hidden"><div className="p-5 sm:p-6 border-b border-line"><p className="text-xs font-medium uppercase tracking-[0.12em] text-market-600">Store profile</p><h2 className="font-display font-semibold text-xl text-ink mt-2">Business information</h2><p className="text-sm text-ink-muted mt-1">This information appears across your POS account.</p></div><div className="p-5 sm:p-6 grid gap-4 sm:grid-cols-2"><label className="sm:col-span-2"><span className="block text-xs font-medium text-ink mb-1.5">Business name</span><input required value={businessForm.name} onChange={(e) => setBusinessForm({ ...businessForm, name: e.target.value })} maxLength={120} className="field" /></label><label><span className="block text-xs font-medium text-ink mb-1.5">Phone</span><input value={businessForm.phone} onChange={(e) => setBusinessForm({ ...businessForm, phone: e.target.value })} maxLength={50} className="field" /></label><label><span className="block text-xs font-medium text-ink mb-1.5">Location</span><input value={businessForm.location} onChange={(e) => setBusinessForm({ ...businessForm, location: e.target.value })} maxLength={200} className="field" /></label></div><div className="px-5 sm:px-6 py-4 border-t border-line flex justify-end"><button disabled={savingBusiness} className="rounded-lg bg-ink px-5 py-2.5 text-sm font-medium text-paper disabled:opacity-50">{savingBusiness ? 'Saving…' : 'Save business settings'}</button></div></form>
      <form onSubmit={saveBusiness} className="rounded-2xl border border-line bg-paper-raised overflow-hidden"><div className="p-5 sm:p-6 border-b border-line"><p className="text-xs font-medium uppercase tracking-[0.12em] text-market-600">Inventory rules</p><h2 className="font-display font-semibold text-xl text-ink mt-2">Stock controls</h2><p className="text-sm text-ink-muted mt-1">Control how stock warnings and negative inventory behave.</p></div><div className="p-5 sm:p-6 space-y-5"><label className="block max-w-xs"><span className="block text-xs font-medium text-ink mb-1.5">Low-stock threshold</span><input type="number" min="0" step="1" value={lowStockThreshold} onChange={(e) => setLowStockThreshold(e.target.value)} className="field" /><span className="text-xs text-ink-muted mt-1.5 block">Products at or below this quantity are flagged as low stock.</span></label><label className="flex items-start gap-3 rounded-xl border border-line bg-paper p-4 cursor-pointer"><input type="checkbox" checked={allowNegativeStock} onChange={(e) => setAllowNegativeStock(e.target.checked)} className="mt-1 h-4 w-4" /><span><span className="block text-sm font-medium text-ink">Allow negative stock</span><span className="block text-xs text-ink-muted mt-1">Permit sales to take inventory below zero. Keep this off for normal retail stock control.</span></span></label></div><div className="px-5 sm:px-6 py-4 border-t border-line flex justify-end"><button disabled={savingBusiness} className="rounded-lg bg-ink px-5 py-2.5 text-sm font-medium text-paper disabled:opacity-50">{savingBusiness ? 'Saving…' : 'Save inventory settings'}</button></div></form>
      <form onSubmit={changePassword} className="rounded-2xl border border-line bg-paper-raised overflow-hidden"><div className="p-5 sm:p-6 border-b border-line"><p className="text-xs font-medium uppercase tracking-[0.12em] text-market-600">Account security</p><h2 className="font-display font-semibold text-xl text-ink mt-2">Change password</h2><p className="text-sm text-ink-muted mt-1">Update the password for {user?.email ?? 'your owner account'}.</p></div><div className="p-5 sm:p-6 grid gap-4 sm:grid-cols-2"><label><span className="block text-xs font-medium text-ink mb-1.5">New password</span><input required type="password" minLength={8} autoComplete="new-password" value={passwordForm.password} onChange={(e) => setPasswordForm({ ...passwordForm, password: e.target.value })} placeholder="At least 8 characters" className="field" /></label><label><span className="block text-xs font-medium text-ink mb-1.5">Confirm new password</span><input required type="password" minLength={8} autoComplete="new-password" value={passwordForm.confirm} onChange={(e) => setPasswordForm({ ...passwordForm, confirm: e.target.value })} placeholder="Repeat new password" className="field" /></label></div><div className="px-5 sm:px-6 py-4 border-t border-line flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"><p className="text-xs text-ink-muted">Use a unique password you do not reuse elsewhere.</p><button disabled={savingPassword} className="shrink-0 rounded-lg bg-ink px-5 py-2.5 text-sm font-medium text-paper disabled:opacity-50">{savingPassword ? 'Updating…' : 'Change password'}</button></div></form>
      <div className="rounded-2xl border border-line bg-paper-raised p-5 sm:p-6"><p className="text-xs font-medium uppercase tracking-[0.12em] text-market-600">Account</p><div className="mt-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"><div><p className="text-sm font-medium text-ink">Owner account</p><p className="text-xs text-ink-muted mt-1">{business?.name ?? 'Business'} · {user?.email ?? 'Signed in'}</p></div><span className="inline-flex self-start rounded-full bg-market-50 px-3 py-1 text-xs capitalize text-market-700">Owner</span></div></div>
    </div>}
  </div></main>
}
