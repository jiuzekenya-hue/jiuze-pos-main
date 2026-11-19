import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/auth-context'
import { Link } from 'react-router-dom'

type BusinessRow = {
  id: string
  name: string
  phone: string | null
  location: string | null
  mode: string | null
  createdAt: string
  subscriptionExempt: boolean
  subscription: {
    id: string
    status: string
    interval: string
    trialEnd: string | null
    periodEnd: string | null
    suspendedAt: string | null
    suspensionReason: string | null
    planName: string
    planCode: string | null
  } | null
  salesCount: number
  salesTotal: number
}
type Overview = {
  businesses: BusinessRow[]
  summary: { businesses: number; activeSubscriptions: number; suspendedBusinesses: number; completedSales: number; salesTotal: number }
}

const money = (value: number) => new Intl.NumberFormat('en-KE', {
  style: 'currency', currency: 'KES', maximumFractionDigits: 0,
}).format(value)
const date = (value: string | null | undefined) => value
  ? new Date(value).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })
  : '—'
const statusStyle: Record<string, string> = {
  active: 'bg-emerald-50 text-emerald-700',
  trialing: 'bg-blue-50 text-blue-700',
  expired: 'bg-amber-50 text-amber-700',
  cancelled: 'bg-slate-100 text-slate-600',
  suspended: 'bg-red-50 text-red-700',
}

function StatCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <section className="rounded-2xl border border-[#e5ebe6] bg-white p-5">
    <p className="text-xs font-medium uppercase tracking-wide text-[#87948c]">{label}</p>
    <p className="mt-3 text-2xl font-semibold tracking-tight text-[#183d2e]">{value}</p>
    <p className="mt-1 text-xs text-[#9aa59e]">{detail}</p>
  </section>
}

export default function PlatformAdmin() {
  const { user, signOut } = useAuth()
  const [overview, setOverview] = useState<Overview | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [selected, setSelected] = useState<BusinessRow | null>(null)
  type ClientSale = {
    id: string; receiptNumber: string; cashierName: string; subtotal: number; discount: number;
    total: number; status: string; createdAt: string;
    items: Array<{ id: string; product_name: string; quantity: number; unit_price: number; subtotal: number }>
    payments: Array<{ method: string; amount: number; reference: string | null }>
    returns: Array<{ return_receipt_number: string; refund_method: string; refund_amount: number; reason: string | null; created_at: string }>
  }
  const [clientSales, setClientSales] = useState<ClientSale[]>([])
  const [clientSalesTotal, setClientSalesTotal] = useState(0)
  const [clientSalesLoading, setClientSalesLoading] = useState(false)
  const [clientSalesError, setClientSalesError] = useState<string | null>(null)
  const [salesStartDate, setSalesStartDate] = useState('')
  const [salesEndDate, setSalesEndDate] = useState('')
  const [salesOffset, setSalesOffset] = useState(0)
  const [expandedSaleId, setExpandedSaleId] = useState<string | null>(null)
  const clientSalesPageSize = 50

  const loadOverview = useCallback(async (quiet = false) => {
    if (quiet) setRefreshing(true)
    else setLoading(true)
    setError(null)
    const { data, error: requestError } = await supabase.functions.invoke('platform-admin', {
      body: { action: 'overview' },
    })
    if (requestError || data?.error) setError(data?.error || requestError?.message || 'Unable to load platform data.')
    else {
      setOverview(data as Overview)
      setSelected((current) => current ? (data.businesses as BusinessRow[]).find((b) => b.id === current.id) ?? null : null)
    }
    setLoading(false)
    setRefreshing(false)
  }, [])

  useEffect(() => { void loadOverview() }, [loadOverview])

  const visibleBusinesses = useMemo(() => (overview?.businesses ?? []).filter((business) => {
    const text = [business.name, business.phone, business.location, business.mode].filter(Boolean).join(' ').toLowerCase()
    const matchesSearch = text.includes(search.trim().toLowerCase())
    const status = business.subscription?.status ?? 'missing'
    const matchesFilter = filter === 'all' || status === filter
    return matchesSearch && matchesFilter
  }), [overview, search, filter])

  async function setBusinessAccess(business: BusinessRow) {
    const suspend = business.subscription?.status !== 'suspended'
    const action = suspend ? 'temporarily deactivate' : 'reactivate'
    if (!window.confirm(`Are you sure you want to ${action} ${business.name}?`)) return
    setBusyId(business.id)
    const { data, error: requestError } = await supabase.functions.invoke('platform-admin', {
      body: {
        action: 'set_access',
        businessId: business.id,
        suspend,
        reason: 'Temporarily disabled by JIUZE platform admin',
      },
    })
    if (requestError || data?.error) setError(data?.error || requestError?.message || 'Could not update business access.')
    else await loadOverview(true)
    setBusyId(null)
  }

  async function loadClientSales(business: BusinessRow, offset = 0, startDateValue = salesStartDate, endDateValue = salesEndDate) {
    setClientSalesLoading(true)
    setClientSalesError(null)
    setExpandedSaleId(null)
    const startDate = startDateValue ? new Date(`${startDateValue}T00:00:00`).toISOString() : undefined
    const endDate = endDateValue ? new Date(new Date(`${endDateValue}T00:00:00`).getTime() + 86400000).toISOString() : undefined
    const { data, error: requestError } = await supabase.functions.invoke('platform-admin', {
      body: { action: 'client_sales', businessId: business.id, startDate, endDate, offset, limit: clientSalesPageSize },
    })
    if (requestError || data?.error) {
      setClientSalesError(data?.error || requestError?.message || 'Unable to load client transactions.')
      setClientSales([])
      setClientSalesTotal(0)
    } else {
      setClientSales(data.sales as ClientSale[])
      setClientSalesTotal(Number(data.total || 0))
      setSalesOffset(offset)
    }
    setClientSalesLoading(false)
  }

  function openBusinessDetails(business: BusinessRow) {
    setSelected(business)
    setSalesStartDate('')
    setSalesEndDate('')
    setSalesOffset(0)
    void loadClientSales(business, 0, '', '')
  }

  if (loading) return <main className="min-h-screen grid place-items-center bg-[#f7f9f7] text-sm text-[#718078]">Loading JIUZE Platform Admin…</main>

  return <main className="min-h-screen bg-[#f7f9f7] text-[#18352b]">
    <header className="border-b border-[#e5ebe6] bg-white">
      <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-4 px-5 py-5 sm:px-8">
        <div>
          <div className="text-xl font-bold tracking-tight text-[#123d2e]">JIUZE <span className="text-[#b58b32]">PLATFORM</span></div>
          <p className="mt-1 text-xs text-[#87948c]">Central business and subscription control</p>
        </div>
        <div className="flex items-center gap-3">
          <Link to="/checkout" className="rounded-lg bg-[#145c40] px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-[#104b34]">Open POS</Link>
          <span className="hidden text-xs text-[#87948c] sm:block">{user?.email}</span>
          <button onClick={() => void loadOverview(true)} disabled={refreshing} className="rounded-lg border border-[#dfe7e0] px-3 py-2 text-xs font-semibold text-[#315b46] hover:bg-[#f5f9f5] disabled:opacity-50">{refreshing ? 'Refreshing…' : 'Refresh data'}</button>
          <button onClick={() => void signOut()} className="rounded-lg bg-[#145c40] px-3 py-2 text-xs font-semibold text-white hover:bg-[#104b34]">Sign out</button>
        </div>
      </div>
    </header>

    <div className="mx-auto max-w-[1440px] space-y-7 px-5 py-7 sm:px-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#a17d31]">Overview</p><h1 className="mt-2 text-2xl font-semibold tracking-tight">Platform performance</h1><p className="mt-1 text-sm text-[#87948c]">Monitor every business connected to JIUZE POS.</p></div>
        <p className="text-xs text-[#9aa59e]">Updated {new Date().toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' })}</p>
      </div>

      {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Registered businesses" value={String(overview?.summary.businesses ?? 0)} detail="All client accounts" />
        <StatCard label="Active subscriptions" value={String(overview?.summary.activeSubscriptions ?? 0)} detail="Active and trialing" />
        <StatCard label="Suspended accounts" value={String(overview?.summary.suspendedBusinesses ?? 0)} detail="Temporarily deactivated" />
        <StatCard label="Completed sales" value={new Intl.NumberFormat('en-KE').format(overview?.summary.completedSales ?? 0)} detail="Across all businesses" />
        <StatCard label="Sales value" value={money(overview?.summary.salesTotal ?? 0)} detail="Completed sales, all time" />
      </div>

      <section className="overflow-hidden rounded-2xl border border-[#e5ebe6] bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#edf1ed] px-5 py-4">
          <div><h2 className="font-semibold text-[#254536]">Client businesses</h2><p className="mt-1 text-xs text-[#94a198]">Subscription access and sales performance by business</p></div>
          <div className="flex w-full flex-wrap gap-2 sm:w-auto">
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search business…" className="min-w-0 flex-1 rounded-lg border border-[#dfe7e0] px-3 py-2 text-sm outline-none focus:border-[#2b7654] sm:w-56" />
            <select value={filter} onChange={(event) => setFilter(event.target.value)} className="rounded-lg border border-[#dfe7e0] bg-white px-3 py-2 text-sm text-[#53685c] outline-none focus:border-[#2b7654]">
              <option value="all">All statuses</option><option value="active">Active</option><option value="trialing">Trialing</option><option value="expired">Expired</option><option value="cancelled">Cancelled</option><option value="suspended">Suspended</option><option value="missing">No subscription</option>
            </select>
          </div>
        </div>

        {visibleBusinesses.length === 0 ? <div className="px-5 py-12 text-center text-sm text-[#87948c]">No businesses match this search.</div> :
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead className="bg-[#f8faf8] text-[11px] uppercase tracking-wide text-[#87948c]"><tr><th className="px-5 py-3 font-semibold">Business</th><th className="px-4 py-3 font-semibold">Plan</th><th className="px-4 py-3 font-semibold">Subscription</th><th className="px-4 py-3 font-semibold">Expiry</th><th className="px-4 py-3 text-right font-semibold">Sales</th><th className="px-4 py-3 text-right font-semibold">Sales value</th><th className="px-5 py-3 text-right font-semibold">Access control</th></tr></thead>
              <tbody className="divide-y divide-[#edf1ed]">
                {visibleBusinesses.map((business) => {
                  const status = business.subscription?.status ?? 'missing'
                  const expiry = business.subscription?.status === 'trialing' ? business.subscription.trialEnd : business.subscription?.periodEnd
                  return <tr key={business.id} className="hover:bg-[#fbfdfb]">
                    <td className="px-5 py-4"><button onClick={() => openBusinessDetails(business)} className="text-left"><span className="block font-semibold text-[#254536] hover:text-[#28734f]">{business.name}</span><span className="mt-1 block text-xs text-[#94a198]">{[business.location, business.phone].filter(Boolean).join(' · ') || 'No contact details'} · {business.mode || 'POS'}</span></button></td>
                    <td className="px-4 py-4 text-[#53685c]">{business.subscription?.planName ?? '—'}</td>
                    <td className="px-4 py-4"><span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold capitalize ${statusStyle[status] ?? 'bg-slate-100 text-slate-600'}`}>{status === 'missing' ? 'No subscription' : status}</span></td>
                    <td className="px-4 py-4 text-xs text-[#718078]">{date(expiry)}</td>
                    <td className="px-4 py-4 text-right tabular-nums text-[#53685c]">{business.salesCount.toLocaleString('en-KE')}</td>
                    <td className="px-4 py-4 text-right tabular-nums font-medium text-[#254536]">{money(business.salesTotal)}</td>
                    <td className="px-5 py-4 text-right">{business.subscription && <button onClick={() => void setBusinessAccess(business)} disabled={busyId === business.id} className={`rounded-lg px-3 py-2 text-xs font-semibold disabled:opacity-50 ${status === 'suspended' ? 'border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100' : 'border border-red-200 bg-white text-red-700 hover:bg-red-50'}`}>{busyId === business.id ? 'Saving…' : status === 'suspended' ? 'Reactivate' : 'Deactivate'}</button>}</td>
                  </tr>
                })}
              </tbody>
            </table>
          </div>}
        <div className="border-t border-[#edf1ed] px-5 py-3 text-xs text-[#94a198]">Showing {visibleBusinesses.length} of {overview?.businesses.length ?? 0} businesses · Financial values are in KES.</div>
      </section>

      {selected && <div className="fixed inset-0 z-40 flex items-end justify-center bg-[#10291f]/30 p-0 sm:items-center sm:p-5" onClick={() => setSelected(null)}>
        <section className="max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-t-2xl bg-white p-5 shadow-2xl sm:rounded-2xl sm:p-7" onClick={(event) => event.stopPropagation()}>
          <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wide text-[#a17d31]">Client account · sales records</p><h2 className="mt-2 text-xl font-semibold text-[#183d2e]">{selected.name}</h2><p className="mt-1 text-sm text-[#87948c]">{selected.phone || 'No phone'} · {selected.location || 'Location not set'}</p></div><button onClick={() => setSelected(null)} className="rounded-lg px-3 py-1 text-sm text-[#718078] hover:bg-[#f5f8f5]">Close</button></div>
          <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="All-time transactions" value={selected.salesCount.toLocaleString('en-KE')} detail="Completed sales" />
            <StatCard label="All-time sales value" value={money(selected.salesTotal)} detail="Completed sales" />
            <StatCard label="Average sale" value={money(selected.salesCount ? selected.salesTotal / selected.salesCount : 0)} detail="All-time average" />
            <StatCard label="Subscription" value={selected.subscription?.status ?? 'None'} detail={selected.subscription?.planName ?? 'No plan assigned'} />
          </div>
          <div className="mt-5 rounded-xl border border-[#e8eee9] p-4">
            <div className="flex flex-wrap items-end justify-between gap-3"><div><h3 className="font-semibold text-[#254536]">Transaction history</h3><p className="mt-1 text-xs text-[#94a198]">Inspect receipts, items, payment records and returns. Read-only access.</p></div><button onClick={() => void loadClientSales(selected, 0)} disabled={clientSalesLoading} className="rounded-lg border border-[#dfe7e0] px-3 py-2 text-xs font-semibold text-[#315b46] disabled:opacity-50">Refresh records</button></div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-medium text-[#718078]">From date<input type="date" value={salesStartDate} onChange={(event) => setSalesStartDate(event.target.value)} className="mt-1 block w-full rounded-lg border border-[#dfe7e0] px-3 py-2 text-sm text-[#254536]" /></label>
              <label className="text-xs font-medium text-[#718078]">To date<input type="date" value={salesEndDate} onChange={(event) => setSalesEndDate(event.target.value)} className="mt-1 block w-full rounded-lg border border-[#dfe7e0] px-3 py-2 text-sm text-[#254536]" /></label>
            </div>
            <button onClick={() => void loadClientSales(selected, 0)} disabled={clientSalesLoading || Boolean(salesStartDate && salesEndDate && salesStartDate > salesEndDate)} className="mt-3 rounded-lg bg-[#145c40] px-4 py-2.5 text-xs font-semibold text-white disabled:opacity-50">Apply date filter</button>
            {clientSalesError && <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{clientSalesError}</p>}
            {clientSalesLoading ? <p className="py-10 text-center text-sm text-[#87948c]">Loading client transactions…</p> : clientSales.length === 0 ? <p className="py-10 text-center text-sm text-[#87948c]">No transactions found for this period.</p> : <>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[760px] text-left text-sm">
                  <thead className="bg-[#f8faf8] text-[11px] uppercase tracking-wide text-[#87948c]"><tr><th className="px-3 py-3">Date</th><th className="px-3 py-3">Receipt</th><th className="px-3 py-3">Cashier</th><th className="px-3 py-3">Status</th><th className="px-3 py-3 text-right">Amount</th><th className="px-3 py-3 text-right">Details</th></tr></thead>
                  <tbody className="divide-y divide-[#edf1ed]">{clientSales.map((sale) => <Fragment key={sale.id}><tr className="hover:bg-[#fbfdfb]"><td className="px-3 py-3 text-xs text-[#718078]">{new Date(sale.createdAt).toLocaleString('en-KE')}</td><td className="px-3 py-3 font-mono text-xs font-semibold text-[#254536]">{sale.receiptNumber}</td><td className="px-3 py-3 text-xs text-[#53685c]">{sale.cashierName}</td><td className="px-3 py-3"><span className="rounded-full bg-[#f1f5f1] px-2 py-1 text-[11px] capitalize text-[#53685c]">{sale.status}</span></td><td className="px-3 py-3 text-right font-semibold tabular-nums text-[#254536]">{money(sale.total)}</td><td className="px-3 py-3 text-right"><button onClick={() => setExpandedSaleId(expandedSaleId === sale.id ? null : sale.id)} className="rounded-lg border border-[#dfe7e0] px-3 py-1.5 text-xs font-semibold text-[#315b46]">{expandedSaleId === sale.id ? 'Hide' : 'Inspect'}</button></td></tr>
                    {expandedSaleId === sale.id && <tr key={sale.id + '-details'}><td colSpan={6} className="bg-[#f8faf8] px-4 py-4"><div className="grid gap-4 md:grid-cols-3">
                      <div><p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#87948c]">Items</p>{sale.items.length ? sale.items.map((item) => <div key={item.id} className="mb-2 flex justify-between gap-3 text-xs"><span>{item.quantity} × {item.product_name}</span><span className="font-medium">{money(Number(item.subtotal))}</span></div>) : <p className="text-xs text-[#87948c]">No item records</p>}</div>
                      <div><p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#87948c]">Payments</p>{sale.payments.length ? sale.payments.map((payment, index) => <div key={index} className="mb-2 text-xs"><span className="capitalize">{payment.method}</span> · {money(Number(payment.amount))}{payment.reference ? <span className="block text-[#87948c]">Ref: {payment.reference}</span> : null}</div>) : <p className="text-xs text-[#87948c]">No payment record</p>}</div>
                      <div><p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#87948c]">Returns / refunds</p>{sale.returns.length ? sale.returns.map((item, index) => <div key={index} className="mb-2 text-xs">{item.return_receipt_number} · {money(Number(item.refund_amount))}<span className="block capitalize text-[#87948c]">{item.refund_method} · {item.reason || 'No reason recorded'}</span></div>) : <p className="text-xs text-[#87948c]">No returns recorded</p>}</div>
                    </div><div className="mt-3 border-t border-[#e5ebe6] pt-3 text-xs text-[#718078]">Subtotal {money(sale.subtotal)} · Discount {money(sale.discount)} · Total {money(sale.total)}</div></td></tr>}</Fragment>)}</tbody>
                </table>
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-[#87948c]"><span>Showing {salesOffset + 1}–{Math.min(salesOffset + clientSales.length, clientSalesTotal)} of {clientSalesTotal} transactions</span><div className="flex gap-2"><button onClick={() => void loadClientSales(selected, Math.max(0, salesOffset - clientSalesPageSize))} disabled={salesOffset === 0 || clientSalesLoading} className="rounded-lg border border-[#dfe7e0] px-3 py-2 disabled:opacity-40">Previous</button><button onClick={() => void loadClientSales(selected, salesOffset + clientSalesPageSize)} disabled={salesOffset + clientSalesPageSize >= clientSalesTotal || clientSalesLoading} className="rounded-lg border border-[#dfe7e0] px-3 py-2 disabled:opacity-40">Next</button></div></div>
            </>}
          </div>
          <div className="mt-4 text-xs text-[#94a198]">Business registered {date(selected.createdAt)} · Platform support view is read-only.</div>
        </section>
      </div>}
    </div>
  </main>
}
