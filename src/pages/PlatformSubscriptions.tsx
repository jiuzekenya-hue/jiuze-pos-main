import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from '../lib/supabase'

type SubscriptionRow = {
  id: string; business_id: string; business_name: string; business_phone: string | null
  plan_name: string; billing_interval: string; effective_status: string
  expected_price_kes: number | null; current_period_end: string | null; trial_end: string | null
  subscription_exempt: boolean
}
type PaymentRow = {
  id: string; business_id: string; subscription_id: string; amount_kes: number
  payment_method: string; transaction_reference: string | null; status: string; paid_at: string
}
type Payload = {
  metrics: { total_collected_kes: number; collected_this_month_kes: number; active_subscriptions: number; trials: number; expired: number; upcoming_renewals: number }
  subscriptions: SubscriptionRow[]; payments: PaymentRow[]
  plans: Array<{ id: string; name: string; code: string; trial_days: number; is_active: boolean }>
  prices: Array<{ id: string; plan_id: string; billing_interval: string; price_kes: number; is_active: boolean }>
  revenue_by_plan: Array<{ plan_name: string; amount_kes: number }>
}
const kes = (n: number) => new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES', maximumFractionDigits: 0 }).format(n)
const date = (v: string | null) => v ? new Date(v).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'
const statusStyle: Record<string,string> = { active:'bg-emerald-50 text-emerald-700', trialing:'bg-amber-50 text-amber-700', expired:'bg-rose-50 text-rose-700', cancelled:'bg-gray-100 text-gray-600' }

export default function PlatformSubscriptions() {
  const [data, setData] = useState<Payload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [tab, setTab] = useState<'subscriptions'|'payments'|'plans'>('subscriptions')
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('all')
  const [selected, setSelected] = useState<SubscriptionRow | null>(null)
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState('mpesa')
  const [reference, setReference] = useState('')
  const [paidAt, setPaidAt] = useState(new Date().toISOString().slice(0,16))
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState('')

  const load = useCallback(async () => {
    setLoading(true); setError('')
    const { data: response, error: invokeError } = await supabase.functions.invoke('platform-admin', { body: { action: 'subscription_management' } })
    if (invokeError || response?.error) setError(response?.error ?? invokeError?.message ?? 'Unable to load subscriptions')
    else setData(response as Payload)
    setLoading(false)
  }, [])
  useEffect(() => { void load() }, [load])

  const rows = useMemo(() => (data?.subscriptions ?? []).filter(row => {
    const matchesStatus = status === 'all' || row.effective_status === status
    const q = search.trim().toLowerCase()
    return matchesStatus && (!q || [row.business_name, row.business_phone ?? '', row.plan_name].some(v => v.toLowerCase().includes(q)))
  }), [data, search, status])

  const recordPayment = async (event: FormEvent) => {
    event.preventDefault()
    if (!selected) return
    setSaving(true); setNotice('')
    const { data: response, error: invokeError } = await supabase.functions.invoke('platform-admin', { body: {
      action: 'record_subscription_payment', subscription_id: selected.id, amount_kes: Number(amount),
      payment_method: method, transaction_reference: reference, paid_at: new Date(paidAt).toISOString(), notes,
    } })
    setSaving(false)
    if (invokeError || response?.error) { setNotice(response?.error ?? invokeError?.message ?? 'Payment could not be recorded'); return }
    setSelected(null); setAmount(''); setReference(''); setNotes('')
    setNotice('Payment recorded as confirmed.')
    await load()
  }

  if (loading && !data) return <main className="p-8 text-sm text-ink-muted">Loading subscription management…</main>
  if (error && !data) return <main className="p-8"><p className="text-brick-600">{error}</p><button className="mt-3 rounded-lg bg-ink px-4 py-2 text-white" onClick={() => void load()}>Retry</button></main>
  if (!data) return null

  const cards = [
    ['Total collected', kes(data.metrics.total_collected_kes), 'Verified subscription payments'],
    ['Collected this month', kes(data.metrics.collected_this_month_kes), 'Based on payment date'],
    ['Active subscriptions', data.metrics.active_subscriptions.toString(), 'Currently within paid period'],
    ['Free trials', data.metrics.trials.toString(), 'Trial accounts in progress'],
    ['Expired', data.metrics.expired.toString(), 'Require follow-up'],
    ['Renewals due in 30 days', data.metrics.upcoming_renewals.toString(), 'Upcoming paid-period end dates'],
  ]
  return <main className="min-h-screen bg-paper px-4 py-6 sm:px-6 sm:py-8"><div className="mx-auto max-w-7xl">
    <header className="mb-7 flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-market-600">JIUZE ADMIN · RECURRING REVENUE</p><h1 className="mt-2 font-display text-3xl font-semibold text-ink">POS Subscriptions</h1><p className="mt-2 text-sm text-ink-muted">Manage plans, customer subscriptions, renewals and verified collections.</p></div><button onClick={() => void load()} className="rounded-lg border border-line bg-paper-raised px-4 py-2 text-sm font-semibold">Refresh data</button></header>
    {notice && <p role="status" className="mb-4 rounded-lg border border-line bg-paper-raised p-3 text-sm text-ink">{notice}</p>}
    <section className="mb-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{cards.map(([label,value,note]) => <article key={label} className="rounded-xl border border-line bg-paper-raised p-5"><p className="text-xs font-medium uppercase tracking-wide text-ink-muted">{label}</p><p className="mt-3 font-display text-2xl font-semibold text-ink">{value}</p><p className="mt-1 text-xs text-ink-muted">{note}</p></article>)}</section>
    <section className="mb-7 grid gap-3 lg:grid-cols-3">{data.plans.map(plan => <article key={plan.id} className="rounded-xl border border-line bg-paper-raised p-5"><div className="flex items-center justify-between"><h2 className="font-display text-lg font-semibold">{plan.name}</h2><span className="text-xs text-ink-muted">{plan.is_active ? 'Active plan' : 'Inactive'}</span></div><p className="mt-1 text-xs text-ink-muted">{plan.trial_days} trial days</p><div className="mt-4 grid grid-cols-2 gap-2">{data.prices.filter(p => p.plan_id === plan.id).map(price => <div key={price.id} className="rounded-lg bg-paper p-3"><p className="text-xs capitalize text-ink-muted">{price.billing_interval}ly</p><p className="mt-1 font-semibold">{kes(Number(price.price_kes))}</p></div>)}</div></article>)}</section>
    <section className="overflow-hidden rounded-xl border border-line bg-paper-raised">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-4"><div className="flex gap-2">{(['subscriptions','payments','plans'] as const).map(t => <button key={t} onClick={() => setTab(t)} className={`rounded-lg px-3 py-2 text-sm font-semibold capitalize ${tab===t?'bg-ink text-white':'text-ink-muted hover:bg-paper'}`}>{t}</button>)}</div>{tab==='subscriptions' && <div className="flex flex-wrap gap-2"><input className="field" placeholder="Search business or plan" value={search} onChange={e=>setSearch(e.target.value)}/><select className="field" value={status} onChange={e=>setStatus(e.target.value)}><option value="all">All statuses</option><option value="active">Active</option><option value="trialing">Trial</option><option value="expired">Expired</option><option value="cancelled">Cancelled</option></select></div>}</div>
      {tab==='subscriptions' && <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm"><thead className="bg-paper text-xs uppercase text-ink-muted"><tr>{['Business','Plan','Billing','Price','Status','Renewal / trial end','Action'].map(x=><th key={x} className="px-4 py-3 font-medium">{x}</th>)}</tr></thead><tbody className="divide-y divide-line">{rows.map(row=><tr key={row.id}><td className="px-4 py-3"><p className="font-semibold">{row.business_name}</p><p className="text-xs text-ink-muted">{row.business_phone ?? ''}</p></td><td className="px-4 py-3">{row.plan_name}</td><td className="px-4 py-3 capitalize">{row.billing_interval}</td><td className="px-4 py-3">{row.expected_price_kes===null?'—':kes(row.expected_price_kes)}</td><td className="px-4 py-3"><span className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusStyle[row.effective_status] ?? 'bg-gray-100'}`}>{row.subscription_exempt?'Exempt':row.effective_status}</span></td><td className="px-4 py-3">{date(row.trial_end ?? row.current_period_end)}</td><td className="px-4 py-3"><button disabled={row.subscription_exempt} onClick={()=>{setSelected(row);setAmount(row.expected_price_kes?.toString() ?? '');setMethod('mpesa')}} className="rounded-lg bg-ink px-3 py-2 text-xs font-semibold text-white disabled:opacity-40">Record payment</button></td></tr>)}{rows.length===0&&<tr><td colSpan={7} className="p-8 text-center text-ink-muted">No matching subscriptions.</td></tr>}</tbody></table></div>}
      {tab==='payments' && <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-paper text-xs uppercase text-ink-muted"><tr>{['Date','Business','Amount','Method','Reference','Status'].map(x=><th key={x} className="px-4 py-3 font-medium">{x}</th>)}</tr></thead><tbody className="divide-y divide-line">{data.payments.map(p=><tr key={p.id}><td className="px-4 py-3">{date(p.paid_at)}</td><td className="px-4 py-3">{data.subscriptions.find(s=>s.business_id===p.business_id)?.business_name ?? 'Business'}</td><td className="px-4 py-3 font-semibold">{kes(Number(p.amount_kes))}</td><td className="px-4 py-3 uppercase">{p.payment_method}</td><td className="px-4 py-3">{p.transaction_reference ?? '—'}</td><td className="px-4 py-3 capitalize">{p.status}</td></tr>)}{data.payments.length===0&&<tr><td colSpan={6} className="p-8 text-center text-ink-muted">No subscription payments recorded yet.</td></tr>}</tbody></table></div>}
      {tab==='plans' && <div className="divide-y divide-line">{data.plans.map(plan=><div key={plan.id} className="flex flex-wrap items-center justify-between gap-3 p-4"><div><p className="font-semibold">{plan.name}</p><p className="text-xs text-ink-muted">{plan.code} · {plan.trial_days} trial days · {plan.is_active?'Active':'Inactive'}</p></div><div className="flex gap-4 text-sm">{data.prices.filter(p=>p.plan_id===plan.id).map(p=><span key={p.id} className="capitalize">{p.billing_interval}: <b>{kes(Number(p.price_kes))}</b></span>)}</div></div>)}</div>}
    </section>
    {selected && <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"><form onSubmit={recordPayment} className="w-full max-w-lg rounded-2xl bg-paper-raised p-6 shadow-xl"><div className="mb-5 flex items-start justify-between"><div><h2 className="font-display text-xl font-semibold">Record subscription payment</h2><p className="mt-1 text-sm text-ink-muted">{selected.business_name} · {selected.plan_name}</p></div><button type="button" onClick={()=>setSelected(null)} className="text-ink-muted">Close</button></div><div className="grid gap-3 sm:grid-cols-2"><label className="text-xs font-medium text-ink-muted">Amount (KES)<input required min="1" step="0.01" type="number" className="field mt-1 w-full" value={amount} onChange={e=>setAmount(e.target.value)}/></label><label className="text-xs font-medium text-ink-muted">Payment method<select className="field mt-1 w-full" value={method} onChange={e=>setMethod(e.target.value)}>{['mpesa','bank','cash','card','other'].map(m=><option key={m} value={m}>{m.toUpperCase()}</option>)}</select></label><label className="text-xs font-medium text-ink-muted sm:col-span-2">Transaction reference<input className="field mt-1 w-full" value={reference} onChange={e=>setReference(e.target.value)} placeholder="M-Pesa code / bank reference" required={method==='mpesa'}/></label><label className="text-xs font-medium text-ink-muted sm:col-span-2">Payment date<input type="datetime-local" className="field mt-1 w-full" value={paidAt} onChange={e=>setPaidAt(e.target.value)}/></label><label className="text-xs font-medium text-ink-muted sm:col-span-2">Notes<textarea className="field mt-1 w-full" rows={2} value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Optional collection notes"/></label></div><p className="mt-3 text-xs text-ink-muted">Only record a payment after confirming that funds were received. This entry will count as collected revenue.</p><div className="mt-5 flex justify-end gap-2"><button type="button" onClick={()=>setSelected(null)} className="rounded-lg border border-line px-4 py-2 text-sm">Cancel</button><button disabled={saving} className="rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving?'Saving…':'Confirm payment'}</button></div></form></div>}
  </div></main>
}
