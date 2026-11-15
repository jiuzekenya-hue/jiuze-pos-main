import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'

type PlatformBusiness = {
  id: string
  name: string
  phone: string | null
  location: string | null
  business_mode: string
  created_at: string
  subscription_exempt: boolean
  subscription: {
    status: string
    plan_name: string | null
    plan_code: string | null
    trial_end: string | null
    current_period_end: string | null
    updated_at: string
  } | null
}

type PlatformActivity = {
  id: string
  type: 'business_registered' | 'subscription_updated'
  label: string
  detail: string
  created_at: string
}

type OverviewResponse = {
  metrics: {
    businesses: number
    active: number
    trials: number
    expired: number
    cancelled: number
    exempt: number
  }
  businesses: PlatformBusiness[]
  activity: PlatformActivity[]
}

const date = (value: string | null | undefined) => value
  ? new Date(value).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })
  : '—'

const statusFor = (business: PlatformBusiness) => {
  if (business.subscription_exempt) return 'Exempt'
  const sub = business.subscription
  if (!sub) return 'No subscription'
  if (sub.status === 'trialing') return sub.trial_end && new Date(sub.trial_end).getTime() > Date.now() ? 'Trial' : 'Expired'
  if (sub.status === 'active') return sub.current_period_end && new Date(sub.current_period_end).getTime() > Date.now() ? 'Active' : 'Expired'
  if (sub.status === 'cancelled') return 'Cancelled'
  return 'Expired'
}

const statusClass = (status: string) => ({
  Active: 'bg-market-50 text-market-700',
  Trial: 'bg-maize-400/20 text-ink',
  Expired: 'bg-brick-500/10 text-brick-600',
  Cancelled: 'bg-gray-100 text-gray-600',
  Exempt: 'bg-blue-50 text-blue-700',
}[status] ?? 'bg-gray-100 text-gray-600')

export default function PlatformAdmin() {
  const [data, setData] = useState<OverviewResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('All')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    supabase.functions.invoke('platform-admin', { body: { action: 'overview' } })
      .then(({ data: response, error: invokeError }) => {
        if (cancelled) return
        if (invokeError) throw invokeError
        if (response?.error) throw new Error(response.error)
        setData(response as OverviewResponse)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Unable to load platform data.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [])

  const businesses = useMemo(() => (data?.businesses ?? []).filter((business) => {
    const status = statusFor(business)
    const matchesFilter = filter === 'All' || status === filter
    const term = search.trim().toLowerCase()
    const matchesSearch = !term || [business.name, business.phone ?? '', business.location ?? '', business.business_mode].some((value) => value.toLowerCase().includes(term))
    return matchesFilter && matchesSearch
  }), [data, filter, search])

  if (loading) return <main className="min-h-screen bg-paper grid place-items-center text-sm text-ink-muted">Loading platform overview…</main>
  if (error) return <main className="min-h-screen bg-paper px-5 py-10"><div className="mx-auto max-w-3xl rounded-xl border border-line bg-paper-raised p-6"><p className="text-xs font-semibold uppercase tracking-widest text-brick-600">Platform access</p><h1 className="mt-2 font-display text-2xl font-semibold">Unable to open Platform Admin</h1><p role="alert" className="mt-2 text-sm text-ink-muted">{/403|admin/i.test(error) ? 'This account is not registered as a JIUZE platform administrator.' : error}</p><p className="mt-4 text-xs text-ink-faint">If you believe this is an error, sign in with the registered Super Admin account.</p></div></main>
  if (!data) return null

  const cards = [
    { label: 'Registered businesses', value: data.metrics.businesses, note: 'All business accounts' },
    { label: 'Active subscriptions', value: data.metrics.active, note: 'Currently within paid period' },
    { label: 'Free trials', value: data.metrics.trials, note: 'Currently within trial period' },
    { label: 'Expired', value: data.metrics.expired, note: 'Require subscription renewal' },
    { label: 'Subscription exempt', value: data.metrics.exempt, note: 'Excluded from billing' },
  ]

  return (
    <main className="min-h-screen bg-paper px-4 py-6 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-7xl">
        <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-market-600">JIUZE POS · PLATFORM CONTROL</p>
            <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-ink sm:text-4xl">Platform overview</h1>
            <p className="mt-2 text-sm text-ink-muted">Monitor business accounts and subscription status across JIUZE POS.</p>
          </div>
          <div className="rounded-lg border border-line bg-paper-raised px-4 py-2 text-xs text-ink-muted">Super Admin · Read only</div>
        </header>

        <section className="mb-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {cards.map((card) => <article key={card.label} className="rounded-xl border border-line bg-paper-raised p-5">
            <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">{card.label}</p>
            <p className="mt-3 font-display text-3xl font-semibold tracking-tight text-ink">{card.value.toLocaleString('en-KE')}</p>
            <p className="mt-1 text-xs text-ink-muted">{card.note}</p>
          </article>)}
        </section>

        <section className="mb-8 overflow-hidden rounded-xl border border-line bg-paper-raised">
          <div className="flex flex-col gap-4 border-b border-line p-5 sm:flex-row sm:items-center sm:justify-between">
            <div><h2 className="font-display text-xl font-semibold">Business accounts</h2><p className="mt-1 text-xs text-ink-muted">{businesses.length} of {data.businesses.length} businesses shown</p></div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input aria-label="Search businesses" className="field sm:w-64" placeholder="Search name, phone or location" value={search} onChange={(event) => setSearch(event.target.value)} />
              <select aria-label="Filter by subscription status" className="field sm:w-44" value={filter} onChange={(event) => setFilter(event.target.value)}>
                {['All', 'Active', 'Trial', 'Expired', 'Cancelled', 'Exempt', 'No subscription'].map((item) => <option key={item}>{item}</option>)}
              </select>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-paper text-xs uppercase tracking-wide text-ink-muted"><tr><th className="px-5 py-3 font-medium">Business</th><th className="px-5 py-3 font-medium">Type</th><th className="px-5 py-3 font-medium">Plan</th><th className="px-5 py-3 font-medium">Status</th><th className="px-5 py-3 font-medium">Joined</th><th className="px-5 py-3 font-medium">Renewal / trial end</th></tr></thead>
              <tbody className="divide-y divide-line">
                {businesses.map((business) => {
                  const status = statusFor(business)
                  return <tr key={business.id} className="hover:bg-paper/70">
                    <td className="px-5 py-4"><p className="font-medium text-ink">{business.name}</p><p className="mt-1 text-xs text-ink-muted">{business.location || business.phone || 'No contact details'}</p></td>
                    <td className="px-5 py-4 capitalize text-ink-muted">{business.business_mode.replace('_', ' ')}</td>
                    <td className="px-5 py-4 text-ink-muted">{business.subscription?.plan_name ?? '—'}</td>
                    <td className="px-5 py-4"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${statusClass(status)}`}>{status}</span></td>
                    <td className="px-5 py-4 whitespace-nowrap text-ink-muted">{date(business.created_at)}</td>
                    <td className="px-5 py-4 whitespace-nowrap text-ink-muted">{date(business.subscription?.trial_end ?? business.subscription?.current_period_end)}</td>
                  </tr>
                })}
                {businesses.length === 0 && <tr><td colSpan={6} className="px-5 py-12 text-center text-sm text-ink-muted">No businesses match this search.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>

        <section className="overflow-hidden rounded-xl border border-line bg-paper-raised">
          <div className="border-b border-line px-5 py-4"><h2 className="font-display text-xl font-semibold">Recent platform activity</h2><p className="mt-1 text-xs text-ink-muted">Business registrations and subscription updates</p></div>
          <div className="divide-y divide-line">
            {data.activity.length === 0 ? <p className="px-5 py-8 text-sm text-ink-muted">No recent activity recorded.</p> : data.activity.map((item) => <div key={item.id} className="flex flex-col gap-1 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-medium text-ink">{item.label}</p><p className="mt-1 text-xs text-ink-muted">{item.detail}</p></div><time className="text-xs text-ink-faint">{new Date(item.created_at).toLocaleString('en-KE')}</time></div>)}
          </div>
        </section>
      </div>
    </main>
  )
}
