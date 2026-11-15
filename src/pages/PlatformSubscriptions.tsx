import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from '../lib/supabase'

type SubscriptionRow = {
  id: string; business_id: string; business_name: string; business_phone: string | null
  plan_name: string; billing_interval: string; effective_status: string
  expected_price_kes: number | null; current_period_end: string | null; trial_end: string | null
  subscription_exempt: boolean; suspension_reason?: string | null; suspended_at?: string | null
}
type PaymentRow = {
  id: string; business_id: string; subscription_id: string; amount_kes: number
  payment_method: string; transaction_reference: string | null; status: string; paid_at: string
  current_period_end_after?: string | null; reversal_reason?: string | null; notes?: string | null
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
const statusStyle: Record<string,string> = { active:'bg-emerald-50 text-emerald-700', trialing:'bg-amber-50 text-amber-700', expired:'bg-rose-50 text-rose-700', cancelled:'bg-gray-100 text-gray-600', suspended:'bg-orange-50 text-orange-700' }

export default function PlatformSubscriptions() {
  const [data, setData] = useState<Payload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [tab, setTab] = useState<'subscriptions'|'payments'|'plans'>('subscriptions')
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('all')
  const [paymentBusiness, setPaymentBusiness] = useState('all')
  const [selected, setSelected] = useState<SubscriptionRow | null>(null)
  const [planSelected, setPlanSelected] = useState<SubscriptionRow | null>(null)
  const [planId, setPlanId] = useState('')
  const [planBilling, setPlanBilling] = useState<'month'|'year'|'trial'>('month')
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState('mpesa')
  const [billingInterval, setBillingInterval] = useState<'month'|'year'>('month')
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

  const setSuspension = async (row: SubscriptionRow, suspend: boolean) => {
    const verb = suspend ? 'temporarily deactivate' : 'reactivate'
    if (!window.confirm(`Are you sure you want to ${verb} ${row.business_name}? ${suspend ? 'Their POS access will be blocked immediately.' : 'Their previous subscription status will be restored.'}`)) return
    setSaving(true); setNotice('')
    const { data: response, error: invokeError } = await supabase.functions.invoke('platform-admin', { body: {
      action: 'set_subscription_suspension', subscription_id: row.id, suspend,
      suspension_reason: suspend ? 'Temporarily deactivated by platform administrator' : undefined,
    } })
    setSaving(false)
    if (invokeError || response?.error) { setNotice(response?.error ?? invokeError?.message ?? 'Subscription status could not be changed'); return }
    setNotice(suspend ? `${row.business_name} has been temporarily deactivated.` : `${row.business_name} has been reactivated.`)
    await load()
  }


  const changePlan = async (event: FormEvent) => {
    event.preventDefault()
    if (!planSelected || !planId) return
    if (!window.confirm(`Change ${planSelected.business_name}'s plan now? Entitlements change immediately; no payment is collected.`)) return
    setSaving(true); setNotice('')
    const { data: response, error: invokeError } = await supabase.functions.invoke('platform-admin', { body: {
      action: 'change_subscription_plan', subscription_id: planSelected.id, plan_id: planId, billing_interval: planBilling,
    } })
    setSaving(false)
    if (invokeError || response?.error) { setNotice(response?.error ?? invokeError?.message ?? 'Plan could not be changed'); return }
    setPlanSelected(null); setNotice('Plan updated. No payment was collected.')
    await load()
  }

  const reversePayment = async (payment: PaymentRow) => {
    const reason = window.prompt('Enter the reason for reversing this payment:')
    if (!reason?.trim()) return
    if (!window.confirm('Reverse this payment? The subscription period rolls back only when this is the latest eligible payment.')) return
    setSaving(true); setNotice('')
    const { data: response, error: invokeError } = await supabase.functions.invoke('platform-admin', { body: {
      action: 'reverse_subscription_payment', payment_id: payment.id, reason,
    } })
    setSaving(false)
    if (invokeError || response?.error) { setNotice(response?.error ?? invokeError?.message ?? 'Payment could not be reversed'); return }
    setNotice('Payment reversed and subscription state updated.')
    await load()
  }

  const recordPayment = async (event: FormEvent) => {
    event.preventDefault()
    if (!selected) return
    setSaving(true); setNotice('')
    const { data: response, error: invokeError } = await supabase.functions.invoke('platform-admin', { body: {
      action: 'record_subscription_payment', subscription_id: selected.id, amount_kes: Number(amount),
      payment_method: method, billing_interval: billingInterval, transaction_reference: reference, paid_at: new Date(paidAt).toISOString(), notes,
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
  return <main className="min-h-screen bg-[#F5F7F5] px-4 py-6 sm:px-6 sm:py-9"><div className="mx-auto max-w-[1440px]">
    <header className="mb-8 flex flex-wrap items-end justify-between gap-5"><div><div className="mb-3 inline-flex items-center gap-2 rounded-full border border-market-100 bg-market-50 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.16em] text-market-700"><span className="h-1.5 w-1.5 rounded-full bg-market-600"/> JIUZE ADMIN <span className="text-market-400">/</span> REVENUE OPERATIONS</div><h1 className="font-display text-3xl font-bold tracking-tight text-ink sm:text-[2.6rem]">Subscription management</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-ink-muted">Manage customer plans, billing, renewals and platform access from one place.</p></div><button onClick={() => void load()} className="inline-flex items-center gap-2 rounded-xl border border-line bg-white px-4 py-3 text-sm font-semibold text-ink shadow-sm transition hover:border-market-400 hover:bg-market-50"><span aria-hidden="true">↻</span> Refresh data</button></header>
    {notice && <p role="status" className="mb-5 rounded-xl border border-market-100 bg-market-50 px-4 py-3 text-sm text-market-700">{notice}</p>}
    <section className="mb-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{cards.map(([label,value,note],i) => <article key={label} className="group relative overflow-hidden rounded-2xl border border-[#E5EAE6] bg-white p-5 shadow-[0_2px_10px_rgba(18,43,33,0.035)] transition hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(18,43,33,0.07)]"><div className="flex items-start justify-between gap-3"><p className="text-[11px] font-bold uppercase tracking-[0.12em] text-ink-muted">{label}</p><span className={`grid h-9 w-9 place-items-center rounded-xl text-sm font-bold ${i<2?'bg-[#EAF3ED] text-market-700':i===2?'bg-[#EEF2FA] text-[#526B9A]':i===3?'bg-[#FFF5E5] text-[#A36B13]':i===4?'bg-[#FCEFED] text-[#B64B3F]':'bg-[#F1EFFA] text-[#70639D]'}`}>{['↗','K','✓','◷','!','⌁'][i]}</span></div><p className="mt-4 font-display text-[1.8rem] font-bold tracking-tight text-ink">{value}</p><p className="mt-1 text-xs text-ink-muted">{note}</p><div className="absolute bottom-0 left-0 h-[3px] w-full bg-gradient-to-r from-market-600/70 to-transparent opacity-0 transition group-hover:opacity-100"/></article>)}</section>
    <section className="overflow-hidden rounded-2xl border border-[#E5EAE6] bg-white shadow-[0_4px_24px_rgba(18,43,33,0.045)]">
      <div className="flex flex-col gap-4 border-b border-[#E9EDE9] p-5 sm:flex-row sm:items-center sm:justify-between"><div><div className="flex flex-wrap items-center gap-1 rounded-xl bg-[#F3F6F3] p-1">{(['subscriptions','payments','plans'] as const).map(t => <button key={t} onClick={() => setTab(t)} className={`rounded-lg px-4 py-2.5 text-sm font-semibold capitalize transition ${tab===t?'bg-white text-market-700 shadow-sm':'text-ink-muted hover:text-ink'}`}>{t}</button>)}</div><p className="mt-3 text-xs text-ink-muted">{tab==='subscriptions'? `${rows.length} subscription records`:tab==='payments'? 'Verified collection history':'Available subscription tiers and pricing'}</p></div>{tab==='payments' && <select aria-label="Filter payments by business" className="field sm:max-w-xs" value={paymentBusiness} onChange={e=>setPaymentBusiness(e.target.value)}><option value="all">All businesses</option>{data.subscriptions.map(s=><option key={s.business_id} value={s.business_id}>{s.business_name}</option>)}</select>}{tab==='subscriptions' && <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row"><input aria-label="Search subscriptions" className="field sm:w-72" placeholder="Search business or plan…" value={search} onChange={e=>setSearch(e.target.value)}/><select aria-label="Filter by status" className="field sm:w-44" value={status} onChange={e=>setStatus(e.target.value)}><option value="all">All statuses</option><option value="active">Active</option><option value="trialing">Trial</option><option value="expired">Expired</option><option value="cancelled">Cancelled</option><option value="suspended">Suspended</option></select></div>}</div>
      {tab==='subscriptions' && <div className="overflow-x-auto"><table className="w-full min-w-[1080px] text-left text-sm"><thead className="bg-[#F7F9F7] text-[10px] font-bold uppercase tracking-[0.12em] text-ink-muted"><tr>{['Business','Plan','Billing','Price','Status','Renewal / trial end','Action'].map(x=><th key={x} className="px-4 py-3 font-medium">{x}</th>)}</tr></thead><tbody className="divide-y divide-line">{rows.map(row=><tr key={row.id} className="transition-colors hover:bg-[#F8FAF8]"><td className="px-5 py-5"><div className="flex items-center gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#EAF3ED] text-sm font-bold text-market-700">{row.business_name.slice(0,1).toUpperCase()}</span><div><p className="font-semibold text-ink">{row.business_name}</p><p className="mt-1 text-xs text-ink-muted">{row.business_phone ?? 'No phone number'}</p></div></div></td><td className="px-5 py-5"><span className="inline-flex rounded-lg bg-[#F3F6F3] px-2.5 py-1.5 text-xs font-semibold text-ink">{row.plan_name}</span></td><td className="px-5 py-5 text-sm capitalize text-ink-muted">{row.billing_interval}</td><td className="px-5 py-5 font-semibold tabular-nums text-ink">{row.expected_price_kes===null?'—':kes(row.expected_price_kes)}</td><td className="px-5 py-5"><span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ${statusStyle[row.effective_status] ?? 'bg-gray-100'}`}><span className="h-1.5 w-1.5 rounded-full bg-current"/>{row.subscription_exempt?'Exempt':row.effective_status}</span></td><td className="px-5 py-5 text-sm text-ink-muted">{date(row.effective_status === 'active' ? row.current_period_end : (row.trial_end ?? row.current_period_end))}</td><td className="px-5 py-5"><div className="flex min-w-[230px] flex-wrap gap-1.5"><button disabled={row.subscription_exempt} onClick={()=>{setSelected(row);setAmount(row.expected_price_kes?.toString() ?? '');setMethod('mpesa');setBillingInterval(row.billing_interval==='year'?'year':'month')}} className="rounded-lg bg-[#173D2A] px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-[#235539] disabled:opacity-40">Record payment</button><button disabled={row.subscription_exempt} onClick={()=>{setPlanSelected(row);setPlanId(data.plans.find(p=>p.name===row.plan_name)?.id ?? data.plans[0]?.id ?? '');setPlanBilling(row.billing_interval==='year'?'year':row.billing_interval==='trial'?'trial':'month')}} className="rounded-lg border border-line bg-white px-3 py-2 text-xs font-semibold text-ink transition hover:border-market-400 hover:bg-market-50 disabled:opacity-40">Plan</button><button title={row.effective_status==='suspended'?'Reactivate subscription':'Temporarily deactivate subscription'} disabled={saving || row.subscription_exempt || !['active','trialing','suspended'].includes(row.effective_status)} onClick={()=>void setSuspension(row,row.effective_status!=='suspended')} className={`rounded-lg border bg-white px-3 py-2 text-xs font-semibold transition disabled:opacity-40 ${row.effective_status==='suspended'?'border-market-100 text-market-700 hover:bg-market-50':'border-orange-100 text-orange-700 hover:bg-orange-50'}`}>{row.effective_status==='suspended'?'Reactivate':'Suspend'}</button></div></td></tr>)}{rows.length===0&&<tr><td colSpan={7} className="p-8 text-center text-ink-muted">No matching subscriptions.</td></tr>}</tbody></table></div>}
      {tab==='payments' && <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-paper text-xs uppercase text-ink-muted"><tr>{['Date','Business','Amount','Method','Reference','Status','Action'].map(x=><th key={x} className="px-4 py-3 font-medium">{x}</th>)}</tr></thead><tbody className="divide-y divide-line">{data.payments.filter(p=>paymentBusiness==='all'||p.business_id===paymentBusiness).map(p=><tr key={p.id}><td className="px-4 py-3">{date(p.paid_at)}</td><td className="px-4 py-3">{data.subscriptions.find(s=>s.business_id===p.business_id)?.business_name ?? 'Business'}<p className="text-xs text-ink-muted">{data.subscriptions.find(s=>s.id===p.subscription_id)?.plan_name ?? ''}</p></td><td className="px-4 py-3 font-semibold">{kes(Number(p.amount_kes))}</td><td className="px-4 py-3 uppercase">{p.payment_method}</td><td className="px-4 py-3">{p.transaction_reference ?? '—'}{p.notes && <p className="text-xs text-ink-muted">{p.notes}</p>}</td><td className="px-4 py-3 capitalize">{p.status}{p.reversal_reason && <p className="text-xs text-ink-muted">{p.reversal_reason}</p>}</td><td className="px-4 py-3">{p.status==='confirmed' && p.current_period_end_after ? <button disabled={saving} onClick={()=>void reversePayment(p)} className="rounded-lg border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-700 disabled:opacity-40">Reverse</button> : '—'}</td></tr>)}{data.payments.length===0&&<tr><td colSpan={7} className="p-8 text-center text-ink-muted">No subscription payments recorded yet.</td></tr>}</tbody></table></div>}
      {tab==='plans' && <div className="grid gap-4 p-5 lg:grid-cols-3">{data.plans.map((plan,i)=><article key={plan.id} className="relative overflow-hidden rounded-2xl border border-[#E5EAE6] bg-white p-6 shadow-sm"><div className={`mb-5 grid h-11 w-11 place-items-center rounded-xl font-display text-lg font-bold ${i===2?'bg-[#F8F0DE] text-[#A47727]':'bg-[#EAF3ED] text-market-700'}`}>{plan.name.slice(-1)}</div><div className="flex items-center justify-between gap-3"><h3 className="font-display text-xl font-bold">{plan.name}</h3><span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${plan.is_active?'bg-market-50 text-market-700':'bg-gray-100 text-gray-500'}`}>{plan.is_active?'Available':'Inactive'}</span></div><p className="mt-1 text-xs text-ink-muted">{plan.code} · {plan.trial_days} trial days</p><div className="mt-6 grid grid-cols-2 gap-3">{data.prices.filter(p=>p.plan_id===plan.id).map(p=><div key={p.id} className="rounded-xl bg-[#F5F7F5] p-3"><p className="text-[10px] font-bold uppercase tracking-wide text-ink-muted">{p.billing_interval==='month'?'Monthly':'Yearly'}</p><p className="mt-2 font-display text-lg font-bold text-ink">{kes(Number(p.price_kes))}</p></div>)}</div></article>)}</div>}
    </section>

    {planSelected && <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"><form onSubmit={changePlan} className="w-full max-w-md rounded-2xl bg-paper-raised p-6 shadow-xl"><div className="mb-5 flex items-start justify-between"><div><h2 className="font-display text-xl font-semibold">Change subscription plan</h2><p className="mt-1 text-sm text-ink-muted">{planSelected.business_name}</p></div><button type="button" onClick={()=>setPlanSelected(null)} className="text-ink-muted">Close</button></div><label className="block text-xs font-medium text-ink-muted">Plan<select required className="field mt-1 w-full" value={planId} onChange={e=>setPlanId(e.target.value)}>{data.plans.filter(p=>p.is_active).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label><label className="mt-3 block text-xs font-medium text-ink-muted">Billing period<select className="field mt-1 w-full" value={planBilling} onChange={e=>setPlanBilling(e.target.value as 'month'|'year'|'trial')}><option value="month">Monthly</option><option value="year">Yearly</option><option value="trial">Start new trial</option></select></label><p className="mt-3 text-xs text-ink-muted">Plan entitlements change immediately. This action does not collect payment or alter the current paid expiry date. Use Renew / Record payment to collect and extend the billing period.</p><div className="mt-5 flex justify-end gap-2"><button type="button" onClick={()=>setPlanSelected(null)} className="rounded-lg border border-line px-4 py-2 text-sm">Cancel</button><button disabled={saving} className="rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving?'Saving…':'Save plan'}</button></div></form></div>}
    {selected && <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"><form onSubmit={recordPayment} className="w-full max-w-lg rounded-2xl bg-paper-raised p-6 shadow-xl"><div className="mb-5 flex items-start justify-between"><div><h2 className="font-display text-xl font-semibold">Record subscription payment</h2><p className="mt-1 text-sm text-ink-muted">{selected.business_name} · {selected.plan_name}</p></div><button type="button" onClick={()=>setSelected(null)} className="text-ink-muted">Close</button></div><div className="grid gap-3 sm:grid-cols-2"><label className="text-xs font-medium text-ink-muted">Amount (KES)<input required min="1" step="0.01" type="number" className="field mt-1 w-full" value={amount} onChange={e=>setAmount(e.target.value)}/></label><label className="text-xs font-medium text-ink-muted">Billing period<select className="field mt-1 w-full" value={billingInterval} onChange={e=>setBillingInterval(e.target.value as 'month'|'year')}><option value="month">Monthly</option><option value="year">Yearly</option></select></label><label className="text-xs font-medium text-ink-muted">Payment method<select className="field mt-1 w-full" value={method} onChange={e=>setMethod(e.target.value)}>{['mpesa','bank','cash','card','other'].map(m=><option key={m} value={m}>{m.toUpperCase()}</option>)}</select></label><label className="text-xs font-medium text-ink-muted sm:col-span-2">Transaction reference<input className="field mt-1 w-full" value={reference} onChange={e=>setReference(e.target.value)} placeholder="M-Pesa code / bank reference" required={method==='mpesa'}/></label><label className="text-xs font-medium text-ink-muted sm:col-span-2">Payment date<input type="datetime-local" className="field mt-1 w-full" value={paidAt} onChange={e=>setPaidAt(e.target.value)}/></label><label className="text-xs font-medium text-ink-muted sm:col-span-2">Notes<textarea className="field mt-1 w-full" rows={2} value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Optional collection notes"/></label></div><p className="mt-3 text-xs text-ink-muted">Confirm that funds were received. A successful payment will activate or extend access for the selected billing period.</p><div className="mt-5 flex justify-end gap-2"><button type="button" onClick={()=>setSelected(null)} className="rounded-lg border border-line px-4 py-2 text-sm">Cancel</button><button disabled={saving} className="rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving?'Saving…':'Confirm payment'}</button></div></form></div>}
  </div></main>
}
