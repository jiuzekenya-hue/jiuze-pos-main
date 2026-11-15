import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'

type Sale = {
  id: string; business_id: string; receipt_number: string; cashier_id: string
  subtotal: number; discount: number; total: number; status: string; created_at: string
  business_name: string; cashier_name: string
}
type SaleItem = { id: string; product_id: string | null; product_name: string; quantity: number; unit_price: number; cost_price: number; discount: number; subtotal: number }
type ReturnLine = { return_id: string; original_sale_item_id: string; product_name: string; quantity: number; unit_price: number; refund_amount: number }
type SaleDetail = {
  sale: Sale; items: SaleItem[]
  payments: { id: string; method: string; amount: number; reference: string | null; created_at: string }[]
  returns: { id: string; return_receipt_number: string; refund_method: string; refund_amount: number; refund_reference: string | null; reason: string; created_at: string }[]
  returned_items: ReturnLine[]
  audit: { id: string; action: string; reason: string; metadata: Record<string, unknown>; created_at: string }[]
}
const money = (n: number) => new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES', maximumFractionDigits: 2 }).format(Number(n || 0))
const dateTime = (v: string) => new Date(v).toLocaleString('en-KE')

export default function PlatformSales() {
  const [sales, setSales] = useState<Sale[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<SaleDetail | null>(null)
  const [quantities, setQuantities] = useState<Record<string, string>>({})
  const [method, setMethod] = useState('mpesa')
  const [reference, setReference] = useState('')
  const [reason, setReason] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const loadSales = useCallback(async () => {
    setLoading(true); setError('')
    const { data, error: invokeError } = await supabase.functions.invoke('platform-admin', { body: { action: 'sales', search } })
    if (invokeError || data?.error) setError(data?.error ?? invokeError?.message ?? 'Unable to load sales.')
    else setSales(data?.sales ?? [])
    setLoading(false)
  }, [search])

  useEffect(() => { void loadSales() }, [loadSales])

  const openSale = async (saleId: string) => {
    setError('')
    const { data, error: invokeError } = await supabase.functions.invoke('platform-admin', { body: { action: 'sale_detail', sale_id: saleId } })
    if (invokeError || data?.error) { setError(data?.error ?? invokeError?.message ?? 'Unable to load sale.'); return }
    setSelected(data as SaleDetail)
    setQuantities({})
    setReference('')
    setReason('')
    setConfirmed(false)
    setNotice('')
  }

  const returnable = useMemo(() => {
    if (!selected) return []
    return selected.items.map((item) => {
      const returned = selected.returned_items.filter((line) => line.original_sale_item_id === item.id).reduce((sum, line) => sum + Number(line.quantity), 0)
      return { ...item, returned, remaining: Math.max(0, Number(item.quantity) - returned) }
    })
  }, [selected])

  const selectedRefundEstimate = returnable.reduce((sum, item) => {
    const qty = Math.max(0, Number(quantities[item.id] || 0))
    return sum + (item.quantity > 0 ? ((Number(item.subtotal) - Number(item.discount || 0)) / Number(item.quantity)) * Math.min(qty, item.remaining) : 0)
  }, 0)

  const recordRefund = async () => {
    if (!selected || !confirmed || !reason.trim()) return
    const items = returnable.map((item) => ({ sale_item_id: item.id, quantity: Number(quantities[item.id] || 0) })).filter((item) => item.quantity > 0)
    if (!items.length || items.some((item) => item.quantity <= 0)) { setError('Enter at least one valid return quantity.'); return }
    if (items.some((line) => line.quantity > (returnable.find((item) => item.id === line.sale_item_id)?.remaining ?? 0))) { setError('A return quantity exceeds the remaining quantity.'); return }
    if (['mpesa', 'card'].includes(method) && !reference.trim()) { setError('Enter the external refund transaction reference.'); return }
    setSaving(true); setError('')
    const { data, error: invokeError } = await supabase.functions.invoke('platform-admin', { body: {
      action: 'process_return', sale_id: selected.sale.id, business_id: selected.sale.business_id,
      items, refund_method: method, refund_reference: reference, reason,
    } })
    if (invokeError || data?.error) setError(data?.error ?? invokeError?.message ?? 'Unable to record refund.')
    else {
      setNotice(`Refund recorded. Return receipt: ${data.result.return_receipt_number} · ${money(Number(data.result.refund_amount))}`)
      await openSale(selected.sale.id)
      await loadSales()
    }
    setSaving(false)
  }

  return <main className="min-h-screen bg-paper px-4 py-6 sm:px-6 sm:py-8">
    <div className="mx-auto max-w-7xl">
      <header className="mb-7">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-market-600">JIUZE ADMIN · SUPPORT OPERATIONS</p>
        <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-ink sm:text-4xl">Sales Control</h1>
        <p className="mt-2 max-w-2xl text-sm text-ink-muted">Search transactions across businesses, inspect payment records and record customer returns after the refund has been sent externally.</p>
      </header>
      <section className="overflow-hidden rounded-xl border border-line bg-paper-raised">
        <div className="flex flex-col gap-3 border-b border-line p-5 sm:flex-row sm:items-center sm:justify-between">
          <div><h2 className="font-display text-xl font-semibold">Platform sales</h2><p className="mt-1 text-xs text-ink-muted">Latest 100 transactions across all businesses</p></div>
          <div className="flex gap-2"><input className="field w-full sm:w-72" aria-label="Search receipt number" placeholder="Search receipt number…" value={search} onChange={(e) => setSearch(e.target.value)} /><button type="button" onClick={() => void loadSales()} className="rounded-lg border border-line px-4 text-sm font-semibold hover:bg-paper">Refresh</button></div>
        </div>
        {error && <p role="alert" className="mx-5 mt-4 rounded-lg bg-brick-500/10 p-3 text-sm text-brick-700">{error}</p>}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[850px] text-left text-sm">
            <thead className="bg-paper text-xs uppercase tracking-wide text-ink-muted"><tr><th className="px-5 py-3">Receipt</th><th className="px-5 py-3">Business</th><th className="px-5 py-3">Cashier</th><th className="px-5 py-3">Total</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Date</th><th className="px-5 py-3"></th></tr></thead>
            <tbody className="divide-y divide-line">
              {loading ? <tr><td colSpan={7} className="px-5 py-12 text-center text-ink-muted">Loading transactions…</td></tr> : sales.map((sale) => <tr key={sale.id} className="hover:bg-paper/70">
                <td className="px-5 py-4 font-semibold">{sale.receipt_number}</td><td className="px-5 py-4">{sale.business_name}</td><td className="px-5 py-4 text-ink-muted">{sale.cashier_name}</td><td className="px-5 py-4 font-semibold">{money(sale.total)}</td><td className="px-5 py-4"><span className="rounded-full bg-market-50 px-2.5 py-1 text-xs capitalize text-market-700">{sale.status}</span></td><td className="px-5 py-4 whitespace-nowrap text-ink-muted">{dateTime(sale.created_at)}</td><td className="px-5 py-4"><button onClick={() => void openSale(sale.id)} className="text-sm font-semibold text-market-700 hover:underline">Inspect</button></td>
              </tr>)}
              {!loading && sales.length === 0 && <tr><td colSpan={7} className="px-5 py-12 text-center text-ink-muted">No transactions found.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>

    {selected && <div className="fixed inset-0 z-[80] overflow-y-auto bg-black/50 p-3 sm:p-8" role="dialog" aria-modal="true" aria-label="Sale details">
      <div className="mx-auto my-4 max-w-4xl rounded-2xl bg-paper-raised shadow-2xl">
        <div className="flex items-start justify-between border-b border-line p-5 sm:p-6"><div><p className="text-xs font-semibold uppercase tracking-widest text-market-600">Transaction support</p><h2 className="mt-1 font-display text-2xl font-semibold">{selected.sale.receipt_number}</h2><p className="mt-1 text-sm text-ink-muted">{selected.sale.business_name} · {selected.sale.cashier_name} · {dateTime(selected.sale.created_at)}</p></div><button onClick={() => setSelected(null)} className="rounded-lg border border-line px-3 py-2 text-sm">Close</button></div>
        <div className="grid gap-5 p-5 sm:p-6 lg:grid-cols-2">
          <div className="space-y-4">
            <div className="rounded-xl border border-line p-4"><div className="flex justify-between text-sm"><span className="text-ink-muted">Sale total</span><strong>{money(selected.sale.total)}</strong></div><div className="mt-2 flex justify-between text-sm"><span className="text-ink-muted">Status</span><strong className="capitalize">{selected.sale.status}</strong></div></div>
            <section><h3 className="mb-2 font-semibold">Items sold and returnable quantities</h3><div className="space-y-2">{returnable.map((item) => <div key={item.id} className="rounded-lg border border-line p-3"><div className="flex justify-between gap-2 text-sm"><span className="font-medium">{item.product_name}</span><span>{money(item.subtotal)}</span></div><div className="mt-1 flex items-center justify-between text-xs text-ink-muted"><span>Sold {item.quantity} · Returned {item.returned} · Remaining {item.remaining}</span><input aria-label={`Return quantity for ${item.product_name}`} type="number" min="0" max={item.remaining} step="0.001" value={quantities[item.id] ?? ''} onChange={(e) => setQuantities((v) => ({ ...v, [item.id]: e.target.value }))} className="field w-24 py-1" placeholder="Qty" /></div></div>)}</div></section>
            <section><h3 className="mb-2 font-semibold">Payments received</h3>{selected.payments.length ? selected.payments.map((p) => <div key={p.id} className="flex justify-between border-b border-line py-2 text-sm"><span className="capitalize">{p.method} {p.reference ? `· ${p.reference}` : ''}</span><strong>{money(p.amount)}</strong></div>) : <p className="text-sm text-ink-muted">No payment records.</p>}</section>
            <section><h3 className="mb-2 font-semibold">Previous returns and returned items</h3>{selected.returns.length ? selected.returns.map((r) => <div key={r.id} className="border-b border-line py-3 text-sm"><div className="flex justify-between gap-2"><strong>{r.return_receipt_number}</strong><strong>{money(r.refund_amount)}</strong></div><p className="mt-1 text-xs text-ink-muted">{r.refund_method.toUpperCase()} · {r.refund_reference || 'No reference'} · {r.reason}</p><div className="mt-2 space-y-1 rounded-lg bg-paper p-2">{selected.returned_items.filter((line) => line.return_id === r.id).map((line) => <div key={line.original_sale_item_id} className="flex justify-between gap-3 text-xs"><span>{line.product_name} · Qty {Number(line.quantity)}</span><strong>{money(Number(line.refund_amount))}</strong></div>)}{!selected.returned_items.some((line) => line.return_id === r.id) && <p className="text-xs text-ink-muted">No item details linked to this return.</p>}</div></div>) : <p className="text-sm text-ink-muted">No returns recorded.</p>}</section>
          </div>
          <div className="space-y-4">
            <div className="rounded-xl border border-[#d9c38d] bg-[#fbf6e9] p-4"><h3 className="font-semibold text-[#735414]">Record refund sent</h3><p className="mt-1 text-xs leading-5 text-[#765f2c]">Send the refund outside JIUZE first. This action records the completed refund, creates a return record and restores returned quantities to stock.</p></div>
            <div><label className="mb-1 block text-xs font-semibold text-ink-muted">Refund method</label><select className="field w-full" value={method} onChange={(e) => setMethod(e.target.value)}><option value="mpesa">M-Pesa</option><option value="cash">Cash</option><option value="card">Card</option></select></div>
            <div><label className="mb-1 block text-xs font-semibold text-ink-muted">External refund reference {method !== 'cash' && '(required)'}</label><input className="field w-full" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="M-Pesa transaction code / provider reference" /></div>
            <div><label className="mb-1 block text-xs font-semibold text-ink-muted">Reason for return</label><textarea className="field min-h-24 w-full" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Explain the customer issue and support action…" /></div>
            <div className="rounded-lg border border-line p-3"><div className="flex justify-between text-sm"><span className="text-ink-muted">Estimated refund</span><strong>{money(selectedRefundEstimate)}</strong></div><p className="mt-1 text-[11px] text-ink-muted">Final refund is calculated by the database from original sale prices and discounts.</p></div>
            <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="mt-1" /><span>I confirm that I have already sent this refund to the customer outside JIUZE POS.</span></label>
            {notice && <p className="rounded-lg bg-market-50 p-3 text-sm text-market-800">{notice}</p>}
            {error && <p role="alert" className="rounded-lg bg-brick-500/10 p-3 text-sm text-brick-700">{error}</p>}
            <button disabled={saving || !confirmed || !reason.trim()} onClick={() => void recordRefund()} className="w-full rounded-lg bg-[#0b2b1d] px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40">{saving ? 'Recording refund…' : 'Confirm and record refund'}</button>
          </div>
        </div>
      </div>
    </div>}
  </main>
}
