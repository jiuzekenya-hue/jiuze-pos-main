import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/auth-context'
import { getSale, listSales, type SaleDetail, type SaleSummary } from '../services/salesHistoryService'

const money = (value: number) => `KES ${value.toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const quantity = (value: number) => Number.isInteger(value) ? String(value) : value.toFixed(3).replace(/0+$/, '').replace(/\.$/, '')
const paymentLabel = (method?: string) => method === 'mpesa' ? 'M-Pesa' : method ? method.charAt(0).toUpperCase() + method.slice(1) : '—'

function SearchIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5"><circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.8" /><path d="m16 16 4 4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
}

function CloseIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5"><path d="m6 6 12 12M18 6 6 18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
}

export default function SalesHistory() {
  const { profile } = useAuth()
  const [sales, setSales] = useState<SaleSummary[]>([])
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<SaleDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!profile?.businessId) return
    setLoading(true)
    setError(null)
    try { setSales(await listSales(profile.businessId, search)) }
    catch (err) { setError(err instanceof Error ? err.message : 'Unable to load sales.') }
    finally { setLoading(false) }
  }, [profile?.businessId, search])

  useEffect(() => { void load() }, [load])

  const summary = useMemo(() => {
    const revenue = sales.reduce((sum, sale) => sum + sale.total, 0)
    const average = sales.length ? revenue / sales.length : 0
    const completed = sales.filter((sale) => sale.status === 'completed').length
    return { revenue, average, completed }
  }, [sales])

  const openSale = async (saleId: string) => {
    if (!profile?.businessId) return
    setError(null)
    try { setSelected(await getSale(profile.businessId, saleId)) }
    catch (err) { setError(err instanceof Error ? err.message : 'Unable to load sale.') }
  }

  const printSale = () => {
    if (!selected) return
    const win = window.open('', '_blank', 'width=420,height=720')
    if (!win) return
    const items = selected.items.map((item) => `<div style="display:flex;justify-content:space-between;margin:10px 0"><span>${quantity(item.quantity)} × ${item.productName}<br><small>${money(item.unitPrice)} each</small></span><strong>${money(item.subtotal)}</strong></div>`).join('')
    win.document.write(`<!doctype html><html><head><title>${selected.receiptNumber}</title><style>body{font-family:Arial,sans-serif;width:72mm;margin:0 auto;padding:12px;font-size:12px;color:#111}h1{text-align:center;font-size:18px;margin:0 0 4px}p{text-align:center;margin:4px 0;color:#555}.line{border-top:1px dashed #999;margin:12px 0}.row{display:flex;justify-content:space-between;margin:6px 0}.total{font-size:15px;font-weight:bold}</style></head><body><h1>JIUZEPOS</h1><p>Sales receipt</p><p><strong>${selected.receiptNumber}</strong></p><div class="line"></div>${items}<div class="line"></div><div class="row"><span>Subtotal</span><span>${money(selected.subtotal)}</span></div><div class="row"><span>Discount</span><span>${money(selected.discount)}</span></div><div class="row total"><span>Total</span><span>${money(selected.total)}</span></div><div class="row"><span>Payment</span><span>${paymentLabel(selected.payment?.method)}</span></div><div class="row"><span>Paid</span><span>${money(selected.payment?.amount ?? 0)}</span></div><div class="row total"><span>Change</span><span>${money(Math.max(0, (selected.payment?.amount ?? 0) - selected.total))}</span></div><div class="line"></div><p>Thank you for your purchase.</p><script>window.onload=()=>window.print()</script></body></html>`)
    win.document.close()
  }

  return <main className="min-h-screen bg-paper px-5 py-6 sm:px-6 lg:px-8">
    <div className="max-w-[1500px] mx-auto">
      <header className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between mb-7">
        <div><p className="text-xs font-medium uppercase tracking-[0.16em] text-market-600">Transactions</p><h1 className="font-display font-semibold text-3xl sm:text-4xl text-ink tracking-tight mt-2">Sales history</h1><p className="text-sm text-ink-muted mt-2">Review transactions, payment details and receipts.</p></div>
        <div className="flex items-center gap-2"><Link to="/checkout" className="rounded-lg bg-ink px-4 py-2.5 text-sm font-medium text-paper">New sale</Link><Link to="/products" className="hidden sm:inline-flex rounded-lg border border-line bg-paper-raised px-4 py-2.5 text-sm font-medium text-ink">Products</Link></div>
      </header>

      {error && <div role="alert" className="mb-5 rounded-xl border border-brick-200 bg-brick-50 px-4 py-3 text-sm text-brick-700">{error}</div>}

      <section className="grid gap-3 sm:grid-cols-3 mb-5">
        <Metric label="Transactions" value={String(sales.length)} detail={`${summary.completed} completed`} />
        <Metric label="Sales value" value={money(summary.revenue)} detail="Loaded transaction history" />
        <Metric label="Average sale" value={money(summary.average)} detail="Across loaded transactions" />
      </section>

      <section className="rounded-2xl border border-line bg-paper-raised p-4 mb-5">
        <label className="relative block max-w-2xl"><span className="sr-only">Search sales</span><span className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-muted"><SearchIcon /></span><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search receipt number..." aria-label="Search sales" className="field h-12 w-full pl-12 pr-4" /></label>
      </section>

      {loading ? <div className="rounded-2xl border border-line bg-paper-raised px-5 py-16 text-center text-sm text-ink-muted">Loading sales…</div> : sales.length === 0 ? <div className="rounded-2xl border border-dashed border-line bg-paper-raised px-5 py-16 text-center"><p className="font-medium text-ink">No sales found</p><p className="text-sm text-ink-muted mt-1">Try another receipt number or complete a new sale.</p><Link to="/checkout" className="inline-flex mt-5 rounded-lg bg-ink px-4 py-2.5 text-sm font-medium text-paper">Start a sale</Link></div> : <>
        <div className="hidden md:block overflow-hidden rounded-2xl border border-line bg-paper-raised">
          <table className="w-full text-sm"><thead className="border-b border-line bg-paper text-left"><tr><th className="px-5 py-3.5 text-[11px] font-medium uppercase tracking-wide text-ink-muted">Date</th><th className="px-5 py-3.5 text-[11px] font-medium uppercase tracking-wide text-ink-muted">Receipt</th><th className="px-5 py-3.5 text-[11px] font-medium uppercase tracking-wide text-ink-muted">Total</th><th className="px-5 py-3.5 text-[11px] font-medium uppercase tracking-wide text-ink-muted">Status</th><th className="px-5 py-3.5 text-right text-[11px] font-medium uppercase tracking-wide text-ink-muted">Action</th></tr></thead><tbody className="divide-y divide-line">{sales.map((sale) => <tr key={sale.id} className="hover:bg-paper transition-colors"><td className="px-5 py-4 text-ink-muted">{new Date(sale.createdAt).toLocaleString()}</td><td className="px-5 py-4 font-mono font-medium text-ink">{sale.receiptNumber}</td><td className="px-5 py-4 font-semibold text-ink">{money(sale.total)}</td><td className="px-5 py-4"><Status status={sale.status} /></td><td className="px-5 py-4 text-right"><button type="button" onClick={() => void openSale(sale.id)} className="rounded-lg border border-line px-3 py-2 text-xs font-medium text-ink hover:bg-paper">View receipt</button></td></tr>)}</tbody></table>
        </div>
        <div className="md:hidden space-y-3">{sales.map((sale) => <button key={sale.id} type="button" onClick={() => void openSale(sale.id)} className="w-full text-left rounded-2xl border border-line bg-paper-raised p-4 active:scale-[0.995]"><div className="flex items-start justify-between gap-3"><div><p className="font-mono text-xs font-medium text-ink">{sale.receiptNumber}</p><p className="text-xs text-ink-muted mt-1">{new Date(sale.createdAt).toLocaleString()}</p></div><Status status={sale.status} /></div><div className="flex items-end justify-between mt-5"><div><p className="text-[11px] uppercase tracking-wide text-ink-muted">Total</p><p className="font-display font-semibold text-xl text-ink mt-1">{money(sale.total)}</p></div><span className="text-xs font-medium text-market-700">View receipt →</span></div></button>)}</div>
      </>}

      {selected && <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-5" role="dialog" aria-modal="true" aria-labelledby="sale-detail-title"><div className="w-full sm:max-w-lg max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl border border-line bg-paper-raised shadow-xl"><div className="sticky top-0 bg-paper-raised/95 backdrop-blur px-5 py-5 border-b border-line flex items-start justify-between gap-4"><div><p className="text-xs font-medium uppercase tracking-[0.14em] text-market-600">Sales receipt</p><h2 id="sale-detail-title" className="font-display text-xl sm:text-2xl font-semibold text-ink mt-1">{selected.receiptNumber}</h2><p className="text-xs text-ink-muted mt-1">{new Date(selected.createdAt).toLocaleString()}</p></div><button type="button" aria-label="Close receipt" onClick={() => setSelected(null)} className="h-9 w-9 rounded-lg border border-line flex items-center justify-center text-ink-muted hover:text-ink hover:bg-paper"><CloseIcon /></button></div><div className="px-5 py-2 divide-y divide-line">{selected.items.map((item) => <div key={item.id} className="py-4 flex justify-between gap-4"><div className="min-w-0"><p className="font-medium text-sm text-ink truncate">{item.productName}</p><p className="text-xs text-ink-muted mt-1">{quantity(item.quantity)} × {money(item.unitPrice)}</p></div><strong className="text-sm text-ink whitespace-nowrap">{money(item.subtotal)}</strong></div>)}</div><div className="border-t border-line px-5 py-5 space-y-2.5 text-sm"><div className="flex justify-between"><span className="text-ink-muted">Subtotal</span><span>{money(selected.subtotal)}</span></div><div className="flex justify-between"><span className="text-ink-muted">Discount</span><span>{money(selected.discount)}</span></div><div className="flex justify-between items-end pt-2"><span className="font-medium text-ink">Total</span><span className="font-display text-2xl font-semibold text-ink">{money(selected.total)}</span></div><div className="flex justify-between pt-2"><span className="text-ink-muted">Payment</span><span className="font-medium text-ink">{paymentLabel(selected.payment?.method)}</span></div><div className="flex justify-between"><span className="text-ink-muted">Paid</span><span>{money(selected.payment?.amount ?? 0)}</span></div><div className="flex justify-between font-semibold"><span>Change</span><span>{money(Math.max(0, (selected.payment?.amount ?? 0) - selected.total))}</span></div></div><div className="px-5 pb-5"><button type="button" onClick={printSale} className="w-full rounded-xl bg-ink px-4 py-3.5 text-sm font-semibold text-paper">Print receipt</button></div></div></div>}
    </div>
  </main>
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) { return <div className="rounded-2xl border border-line bg-paper-raised p-5"><p className="text-xs font-medium uppercase tracking-wide text-ink-muted">{label}</p><p className="font-display font-semibold text-2xl text-ink tracking-tight mt-3">{value}</p><p className="text-xs text-ink-muted mt-1">{detail}</p></div> }
function Status({ status }: { status: string }) { const completed = status === 'completed'; return <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-medium ${completed ? 'bg-market-50 text-market-700' : 'bg-paper text-ink-muted'}`}>{status}</span> }
