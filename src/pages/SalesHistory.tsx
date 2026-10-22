import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/auth-context'
import { getBusiness } from '../services/businessService'
import {
  getSale,
  listSales,
  getSalesReport,
  listSaleDepartments,
  type SaleDepartment,
  type SaleDetail,
  type SaleSummary,
  type SalesReport,
} from '../services/salesHistoryService'
import {
  browserPrintSalesReportA4,
  browserPrintSalesReport80mm,
  type SalesReportPrintData,
} from '../services/salesReportPrintService'
import SaleReturnModal from '../components/SaleReturnModal'

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
  const [saleDepartments, setSaleDepartments] = useState<Record<string, SaleDepartment[]>>({})
  const [departmentFilter, setDepartmentFilter] = useState<'All' | SaleDepartment>('All')
  const [businessName, setBusinessName] = useState('')
  const [report, setReport] = useState<SalesReport | null>(null)
  const [reportStartDate, setReportStartDate] = useState('')
  const [reportEndDate, setReportEndDate] = useState('')
  const [reportStartTime, setReportStartTime] = useState('')
  const [reportEndTime, setReportEndTime] = useState('')
  const [reportLoading, setReportLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<SaleDetail | null>(null)
  const [returnSale, setReturnSale] = useState<SaleDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadBusiness = useCallback(async () => {
    if (!profile?.businessId) return
    try {
      const business = await getBusiness(profile.businessId)
      setBusinessName(business.name)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load shop details.')
    }
  }, [profile?.businessId])

  const load = useCallback(async () => {
    if (!profile?.businessId) return
    setLoading(true)
    setError(null)
    try {
      const [rows, departments] = await Promise.all([listSales(profile.businessId, search), listSaleDepartments(profile.businessId)])
      setSales(rows)
      setSaleDepartments(departments)
    }
    catch (err) { setError(err instanceof Error ? err.message : 'Unable to load sales.') }
    finally { setLoading(false) }
  }, [profile?.businessId, search])

  useEffect(() => { void loadBusiness() }, [loadBusiness])
  useEffect(() => { void load() }, [load])

  const filteredSales = useMemo(() => departmentFilter === 'All' ? sales : sales.filter((sale) => (saleDepartments[sale.id] || []).includes(departmentFilter)), [sales, saleDepartments, departmentFilter])

  const summary = useMemo(() => {
    const revenue = filteredSales.reduce((sum, sale) => sum + sale.total, 0)
    const average = filteredSales.length ? revenue / filteredSales.length : 0
    const completed = filteredSales.filter((sale) => sale.status === 'completed').length
    return { revenue, average, completed }
  }, [filteredSales])

  const openSale = async (saleId: string) => {
    if (!profile?.businessId) return
    setError(null)
    try { setSelected(await getSale(profile.businessId, saleId)) }
    catch (err) { setError(err instanceof Error ? err.message : 'Unable to load sale.') }
  }

const loadSalesReport = async () => {
  if (!profile?.businessId) return

  setReportLoading(true)
  setError(null)

  try {
    if (reportStartDate && reportEndDate && reportStartDate > reportEndDate) {
      throw new Error('Start date must not be after end date.')
    }
    if (reportStartTime && !reportStartDate) {
      throw new Error('Choose a start date when using a start time.')
    }
    if (reportEndTime && !reportEndDate) {
      throw new Error('Choose an end date when using an end time.')
    }
    if (reportStartDate && reportEndDate && reportStartDate === reportEndDate && reportStartTime && reportEndTime && reportStartTime > reportEndTime) {
      throw new Error('Start time must not be after end time on the same date.')
    }

    const startDate = reportStartDate
      ? new Date(`${reportStartDate}T${reportStartTime || '00:00'}:00`).toISOString()
      : undefined

    // Supabase uses an exclusive end boundary, so include the selected end minute.
    const endDate = reportEndDate
      ? new Date(new Date(`${reportEndDate}T${reportEndTime || '23:59'}:00`).getTime() + (reportEndTime ? 60_000 : 60_000)).toISOString()
      : undefined

    const result = await getSalesReport(
      profile.businessId,
      startDate,
      endDate,
    )

    setReport(result)
  } catch (err) {
    setError(
      err instanceof Error ? err.message : 'Unable to load the sales report.',
    )
  } finally {
    setReportLoading(false)
  }
}


  const printSale = () => {
    if (!selected) return
    const win = window.open('', '_blank', 'width=420,height=720')
    if (!win) return
    const items = selected.items.map((item) => `<div style="display:flex;justify-content:space-between;margin:10px 0"><span>${quantity(item.quantity)} × ${item.productName}<br><small>${money(item.unitPrice)} each</small></span><strong>${money(item.subtotal)}</strong></div>`).join('')
    win.document.write(`<!doctype html><html><head><title>${selected.receiptNumber}</title><style>body{font-family:Arial,sans-serif;width:72mm;margin:0 auto;padding:12px;font-size:12px;color:#111}h1{text-align:center;font-size:18px;margin:0 0 4px}p{text-align:center;margin:4px 0;color:#555}.line{border-top:1px dashed #999;margin:12px 0}.row{display:flex;justify-content:space-between;margin:6px 0}.total{font-size:15px;font-weight:bold}.meta{text-align:center;color:#555;font-size:11px;line-height:1.5}</style></head><body><h1>${businessName || 'Shop'}</h1><p>Sales receipt</p><p><strong>${selected.receiptNumber}</strong></p><p class="meta">${new Date(selected.createdAt).toLocaleString()}<br>Cashier: ${selected.cashierName}</p><div class="line"></div>${items}<div class="line"></div><div class="row"><span>Subtotal</span><span>${money(selected.subtotal)}</span></div><div class="row"><span>Discount</span><span>${money(selected.discount)}</span></div><div class="row total"><span>Total</span><span>${money(selected.total)}</span></div><div class="row"><span>Payment</span><span>${paymentLabel(selected.payment?.method)}</span></div><div class="row"><span>Paid</span><span>${money(selected.payment?.amount ?? 0)}</span></div><div class="row total"><span>Change</span><span>${money(Math.max(0, (selected.payment?.amount ?? 0) - selected.total))}</span></div><div class="line"></div><p>Thank you for your purchase.</p><script>window.onload=()=>window.print()</script></body></html>`)
    win.document.close()
  }

  return <main className="min-h-screen bg-paper px-5 py-6 sm:px-6 lg:px-8">
    <div className="max-w-[1500px] mx-auto">
      <header className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between mb-7">
        <div><p className="text-xs font-medium uppercase tracking-[0.16em] text-market-600">Transactions</p><h1 className="font-display font-semibold text-3xl sm:text-4xl text-ink tracking-tight mt-2">Sales history</h1><p className="text-sm text-ink-muted mt-2">Review transactions, payment details and receipts. Department filters classify a sale by its products.</p></div>
        <div className="flex items-center gap-2"><Link to="/checkout" className="rounded-lg bg-ink px-4 py-2.5 text-sm font-medium text-paper">New sale</Link><Link to="/products" className="hidden sm:inline-flex rounded-lg border border-line bg-paper-raised px-4 py-2.5 text-sm font-medium text-ink">Products</Link></div>
      </header>

      {error && <div role="alert" className="mb-5 rounded-xl border border-brick-200 bg-brick-50 px-4 py-3 text-sm text-brick-700">{error}</div>}

      <section className="grid gap-3 sm:grid-cols-3 mb-5">
        <Metric label="Transactions" value={String(filteredSales.length)} detail={`${summary.completed} completed`} />
        <Metric label="Sales value" value={money(summary.revenue)} detail="Loaded transaction history" />
        <Metric label="Average sale" value={money(summary.average)} detail="Across loaded transactions" />
      </section>

<section className="rounded-2xl border border-line bg-paper-raised p-4 mb-5">
  <h2 className="font-semibold text-ink text-lg mb-3">Sales reports</h2>

  <div className="grid gap-3 sm:grid-cols-2 mb-4">
    <label className="text-sm text-ink-muted">
      Start date
      <input
        type="date"
        value={reportStartDate}
        onChange={(event) => setReportStartDate(event.target.value)}
        className="field mt-1 w-full"
      />
    </label>

    <label className="text-sm text-ink-muted">
      Start time (optional)
      <input
        type="time"
        value={reportStartTime}
        onChange={(event) => setReportStartTime(event.target.value)}
        disabled={!reportStartDate}
        className="field mt-1 w-full disabled:opacity-50"
      />
    </label>

    <label className="text-sm text-ink-muted">
      End date
      <input
        type="date"
        value={reportEndDate}
        onChange={(event) => setReportEndDate(event.target.value)}
        className="field mt-1 w-full"
      />
    </label>

    <label className="text-sm text-ink-muted">
      End time (optional)
      <input
        type="time"
        value={reportEndTime}
        onChange={(event) => setReportEndTime(event.target.value)}
        disabled={!reportEndDate}
        className="field mt-1 w-full disabled:opacity-50"
      />
    </label>
  </div>
  <div className="flex flex-wrap gap-2">
<button
  type="button"
  onClick={async () => {
    setReportStartDate('')
    setReportEndDate('')
    setReportStartTime('')
    setReportEndTime('')

    if (!profile?.businessId) return

    setReportLoading(true)
    setError(null)

    try {
      const result = await getSalesReport(profile.businessId)
      setReport(result)
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Unable to load the sales report.',
      )
    } finally {
      setReportLoading(false)
    }
  }}

      disabled={reportLoading}
      className="rounded-lg bg-ink px-4 py-2.5 text-sm font-medium text-paper disabled:opacity-50"
    >
      All-time totals
    </button>

    <button
      type="button"
      onClick={() => void loadSalesReport()}
      disabled={reportLoading}
      className="rounded-lg border border-line px-4 py-2.5 text-sm font-medium text-ink disabled:opacity-50"
    >
      {reportLoading ? 'Loading report…' : 'Generate date-range report'}
    </button>
  </div>
</section>

{report && (
  <section className="rounded-2xl border border-line bg-paper-raised p-4 mb-5">
    <h2 className="font-semibold text-ink text-lg mb-4">Sales by cashier</h2>
    {(() => {
      const totals = new Map<string, { cashierId: string; cashierName: string; transactions: number; total: number }>()
      for (const sale of report.sales) {
        if (sale.status !== 'completed') continue
        const key = sale.cashierId || sale.cashierName
        const current = totals.get(key) ?? {
          cashierId: sale.cashierId,
          cashierName: sale.cashierName,
          transactions: 0,
          total: 0,
        }
        current.transactions += 1
        current.total += sale.total
        totals.set(key, current)
      }
      const rows = [...totals.values()].sort((a, b) => b.total - a.total)
      const totalSales = rows.reduce((sum, row) => sum + row.total, 0)
      return rows.length ? (
        <>
          <p className="text-sm text-ink-muted mb-3">Completed sales only · {reportStartDate || reportEndDate ? `${reportStartDate || 'Beginning'} ${reportStartTime || (reportStartDate ? '00:00' : '')} to ${reportEndDate || 'Today'} ${reportEndTime || (reportEndDate ? '23:59' : '')}` : 'All-time'}</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-line bg-paper text-left">
                <tr>
                  <th className="px-4 py-3 text-[11px] font-medium uppercase tracking-wide text-ink-muted">Cashier</th>
                  <th className="px-4 py-3 text-right text-[11px] font-medium uppercase tracking-wide text-ink-muted">Transactions</th>
                  <th className="px-4 py-3 text-right text-[11px] font-medium uppercase tracking-wide text-ink-muted">Total sales</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((row) => (
                  <tr key={row.cashierId || row.cashierName}>
                    <td className="px-4 py-3 font-medium text-ink">{row.cashierName}</td>
                    <td className="px-4 py-3 text-right text-ink-muted">{row.transactions}</td>
                    <td className="px-4 py-3 text-right font-semibold text-ink">{money(row.total)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 border-line">
                <tr>
                  <td className="px-4 py-3 font-semibold text-ink">Total</td>
                  <td className="px-4 py-3 text-right font-semibold text-ink">{rows.reduce((sum, row) => sum + row.transactions, 0)}</td>
                  <td className="px-4 py-3 text-right font-semibold text-ink">{money(totalSales)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      ) : (
        <p className="text-sm text-ink-muted">No completed sales found for this period.</p>
      )
    })()}
  </section>
)}

{report && (
  <section className="rounded-2xl border border-line bg-paper-raised p-4 mb-5">
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-4">
      <div>
        <h2 className="font-semibold text-ink text-lg">Report summary</h2>
        <p className="text-sm text-ink-muted">
          {reportStartDate || reportEndDate
            ? `${reportStartDate || 'Beginning'} ${reportStartTime || (reportStartDate ? '00:00' : '')} to ${reportEndDate || 'Today'} ${reportEndTime || (reportEndDate ? '23:59' : '')}`
            : 'All-time sales'}
        </p>
      </div>
      <p className="text-sm text-ink-muted">
        {report.sales.length} transactions
      </p>
    </div>

    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Metric
        label="Total sales"
        value={money(
          report.sales
            .filter((sale) => sale.status === 'completed')
            .reduce((sum, sale) => sum + sale.total, 0),
        )}
        detail="Completed sales"
      />
      <Metric
  label="Cash sales"
  value={money(report.cashSalesTotal)}
  detail="Completed cash sales"
/>
<Metric
  label="Cash received"
  value={money(report.cashTotal)}
  detail="Before change is deducted"
/>
<Metric
  label="Potential change"
  value={money(report.potentialCashChange)}
  detail="Estimated change from recorded payments"
/>
      <Metric
        label="M-Pesa payments"
        value={money(report.mpesaTotal)}
        detail="Recorded M-Pesa payments"
      />
      <Metric
        label="Other payments"
        value={money(report.otherPaymentTotal)}
        detail="Other recorded methods"
      />
      <Metric
  label="Returned sales"
  value={money(report.returnedTotal)}
  detail="Returned transactions, reported separately"
/>
    </div>

<div className="flex flex-wrap gap-2 mt-4">
  <button
    type="button"
    onClick={() => {
  if (!report) return

  const printData: SalesReportPrintData = {
    businessName,
    title: 'Sales Report',
    period: reportStartDate || reportEndDate
      ? `${reportStartDate || 'Beginning'} ${reportStartTime || (reportStartDate ? '00:00' : '')} to ${reportEndDate || 'Today'} ${reportEndTime || (reportEndDate ? '23:59' : '')}`
      : 'All-time sales',
    transactions: report.sales.map(sale => ({
      date: sale.createdAt,
      receiptNumber: sale.receiptNumber,
      cashierName: sale.cashierName,
      total: sale.total,
      paymentMethod: sale.paymentMethod ?? 'Unrecorded',
      status: sale.status,
    })),
    cashierTotals: (() => {
      const totals = new Map<string, { cashierName: string; transactions: number; total: number }>()
      for (const sale of report.sales) {
        if (sale.status !== 'completed') continue
        const key = sale.cashierId || sale.cashierName
        const current = totals.get(key) ?? { cashierName: sale.cashierName, transactions: 0, total: 0 }
        current.transactions += 1
        current.total += sale.total
        totals.set(key, current)
      }
      return [...totals.values()].sort((a, b) => b.total - a.total)
    })(),
    totalSales: report.sales
      .filter(sale => sale.status === 'completed')
      .reduce((sum, sale) => sum + sale.total, 0),
    cashTotal: report.cashTotal,
    cashSalesTotal: report.cashSalesTotal,
potentialCashChange: report.potentialCashChange,
    mpesaTotal: report.mpesaTotal,
    otherPaymentTotal: report.otherPaymentTotal,
  }

  browserPrintSalesReportA4(printData)
}}
    className="rounded-lg bg-ink px-4 py-2.5 text-sm font-medium text-paper"
  >
    Print A4
  </button>
  <button
    type="button"
    onClick={() => {
  if (!report) return

  const printData: SalesReportPrintData = {
    businessName,
    title: 'Sales Report',
    period: reportStartDate || reportEndDate
      ? `${reportStartDate || 'Beginning'} to ${reportEndDate || 'Today'}`
      : 'All-time sales',
    transactions: report.sales.map(sale => ({
      date: sale.createdAt,
      receiptNumber: sale.receiptNumber,
      cashierName: sale.cashierName,
      total: sale.total,
      paymentMethod: sale.paymentMethod ?? 'Unrecorded',
      status: sale.status,
    })),
    cashierTotals: (() => {
      const totals = new Map<string, { cashierName: string; transactions: number; total: number }>()
      for (const sale of report.sales) {
        if (sale.status !== 'completed') continue
        const key = sale.cashierId || sale.cashierName
        const current = totals.get(key) ?? { cashierName: sale.cashierName, transactions: 0, total: 0 }
        current.transactions += 1
        current.total += sale.total
        totals.set(key, current)
      }
      return [...totals.values()].sort((a, b) => b.total - a.total)
    })(),
    totalSales: report.sales
      .filter(sale => sale.status === 'completed')
      .reduce((sum, sale) => sum + sale.total, 0),
    cashTotal: report.cashTotal,
cashSalesTotal: report.cashSalesTotal,
potentialCashChange: report.potentialCashChange,
mpesaTotal: report.mpesaTotal,
    otherPaymentTotal: report.otherPaymentTotal,
  }

  browserPrintSalesReport80mm(printData)
}}
    className="rounded-lg border border-line px-4 py-2.5 text-sm font-medium text-ink"
  >
    Print 80mm
  </button>
</div>
  </section>
)}

      <section className="rounded-2xl border border-line bg-paper-raised p-4 mb-5">
        <h2 className="mb-3 text-sm font-semibold text-ink">Filter sales by department</h2>
        <div className="grid grid-cols-3 gap-2">
          {(['All', 'Kitchen', 'Bar'] as const).map((department) => (
            <button key={department} type="button" onClick={() => setDepartmentFilter(department)} className={`min-h-12 rounded-xl border-2 px-3 py-3 text-sm font-bold transition ${departmentFilter === department ? 'border-market-600 bg-market-600 text-white' : 'border-line bg-paper text-ink hover:bg-paper-raised'}`}>
              {department === 'All' ? 'All Sales' : department}
            </button>
          ))}
        </div>
      </section>

<section className="rounded-2xl border border-line bg-paper-raised p-4 mb-5">
        <label className="relative block max-w-2xl"><span className="sr-only">Search sales</span><span className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-muted"><SearchIcon /></span><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search receipt number..." aria-label="Search sales" className="field h-12 w-full pl-12 pr-4" /></label>
      </section>

      {loading ? <div className="rounded-2xl border border-line bg-paper-raised px-5 py-16 text-center text-sm text-ink-muted">Loading sales…</div> : filteredSales.length === 0 ? <div className="rounded-2xl border border-dashed border-line bg-paper-raised px-5 py-16 text-center"><p className="font-medium text-ink">No sales found in this department</p><p className="text-sm text-ink-muted mt-1">Try another receipt number or complete a new sale.</p><Link to="/checkout" className="inline-flex mt-5 rounded-lg bg-ink px-4 py-2.5 text-sm font-medium text-paper">Start a sale</Link></div> : <>
        <div className="hidden md:block overflow-hidden rounded-2xl border border-line bg-paper-raised">
          <table className="w-full text-sm"><thead className="border-b border-line bg-paper text-left"><tr><th className="px-5 py-3.5 text-[11px] font-medium uppercase tracking-wide text-ink-muted">Date</th><th className="px-5 py-3.5 text-[11px] font-medium uppercase tracking-wide text-ink-muted">Receipt</th><th className="px-5 py-3.5 text-[11px] font-medium uppercase tracking-wide text-ink-muted">Cashier</th><th className="px-5 py-3.5 text-[11px] font-medium uppercase tracking-wide text-ink-muted">Total</th><th className="px-5 py-3.5 text-[11px] font-medium uppercase tracking-wide text-ink-muted">Status</th><th className="px-5 py-3.5 text-right text-[11px] font-medium uppercase tracking-wide text-ink-muted">Action</th></tr></thead><tbody className="divide-y divide-line">{filteredSales.map((sale) => <tr key={sale.id} className="hover:bg-paper transition-colors"><td className="px-5 py-4 text-ink-muted">{new Date(sale.createdAt).toLocaleString()}</td><td className="px-5 py-4 font-mono font-medium text-ink">{sale.receiptNumber}</td><td className="px-5 py-4 text-ink">{sale.cashierName}</td><td className="px-5 py-4 font-semibold text-ink">{money(sale.total)}</td><td className="px-5 py-4"><Status status={sale.status} /></td><td className="px-5 py-4 text-right"><button type="button" onClick={() => void openSale(sale.id)} className="rounded-lg border border-line px-3 py-2 text-xs font-medium text-ink hover:bg-paper">View receipt</button></td></tr>)}</tbody></table>
        </div>
        <div className="md:hidden space-y-3">{sales.map((sale) => <button key={sale.id} type="button" onClick={() => void openSale(sale.id)} className="w-full text-left rounded-2xl border border-line bg-paper-raised p-4 active:scale-[0.995]"><div className="flex items-start justify-between gap-3"><div><p className="font-mono text-xs font-medium text-ink">{sale.receiptNumber}</p><p className="text-xs text-ink-muted mt-1">{new Date(sale.createdAt).toLocaleString()}</p><p className="text-xs text-ink-muted mt-1">Cashier: <span className="text-ink">{sale.cashierName}</span></p></div><Status status={sale.status} /></div><div className="flex items-end justify-between mt-5"><div><p className="text-[11px] uppercase tracking-wide text-ink-muted">Total</p><p className="font-display font-semibold text-xl text-ink mt-1">{money(sale.total)}</p></div><span className="text-xs font-medium text-market-700">View receipt →</span></div></button>)}</div>
      </>}

      {selected && <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-5" role="dialog" aria-modal="true" aria-labelledby="sale-detail-title"><div className="w-full sm:max-w-lg max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl border border-line bg-paper-raised shadow-xl"><div className="sticky top-0 bg-paper-raised/95 backdrop-blur px-5 py-5 border-b border-line flex items-start justify-between gap-4"><div><p className="text-xs font-medium uppercase tracking-[0.14em] text-market-600">Sales receipt</p><h2 id="sale-detail-title" className="font-display text-xl sm:text-2xl font-semibold text-ink mt-1">{selected.receiptNumber}</h2><p className="text-xs text-ink-muted mt-1">{new Date(selected.createdAt).toLocaleString()}</p></div><button type="button" aria-label="Close receipt" onClick={() => setSelected(null)} className="h-9 w-9 rounded-lg border border-line flex items-center justify-center text-ink-muted hover:text-ink hover:bg-paper"><CloseIcon /></button></div><div className="px-5 py-4 border-b border-line"><p className="font-display font-semibold text-xl text-ink">{businessName || 'Shop'}</p><p className="text-xs text-ink-muted mt-1">Cashier: <span className="text-ink">{selected.cashierName}</span></p></div><div className="px-5 py-2 divide-y divide-line">{selected.items.map((item) => <div key={item.id} className="py-4 flex justify-between gap-4"><div className="min-w-0"><p className="font-medium text-sm text-ink truncate">{item.productName}</p><p className="text-xs text-ink-muted mt-1">{quantity(item.quantity)} × {money(item.unitPrice)}</p></div><strong className="text-sm text-ink whitespace-nowrap">{money(item.subtotal)}</strong></div>)}</div><div className="border-t border-line px-5 py-5 space-y-2.5 text-sm"><div className="flex justify-between"><span className="text-ink-muted">Subtotal</span><span>{money(selected.subtotal)}</span></div><div className="flex justify-between"><span className="text-ink-muted">Discount</span><span>{money(selected.discount)}</span></div><div className="flex justify-between items-end pt-2"><span className="font-medium text-ink">Total</span><span className="font-display text-2xl font-semibold text-ink">{money(selected.total)}</span></div><div className="flex justify-between pt-2"><span className="text-ink-muted">Payment</span><span className="font-medium text-ink">{paymentLabel(selected.payment?.method)}</span></div><div className="flex justify-between"><span className="text-ink-muted">Paid</span><span>{money(selected.payment?.amount ?? 0)}</span></div><div className="flex justify-between font-semibold"><span>Change</span><span>{money(Math.max(0, (selected.payment?.amount ?? 0) - selected.total))}</span></div></div><div className="px-5 pb-5 grid gap-3 sm:grid-cols-2"><button type="button" onClick={printSale} className="w-full rounded-xl bg-ink px-4 py-3.5 text-sm font-semibold text-paper">Print receipt</button>{selected.status === 'completed' && profile?.businessId && profile.role === 'owner' && <button type="button" onClick={() => { setReturnSale(selected); setSelected(null) }} className="w-full rounded-xl border border-line bg-paper px-4 py-3.5 text-sm font-semibold text-ink hover:bg-paper">Return items</button>}</div></div></div>}

      {returnSale && profile?.businessId && <SaleReturnModal businessId={profile.businessId} businessName={businessName} sale={returnSale} onClose={() => setReturnSale(null)} />}
    </div>
  </main>
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) { return <div className="rounded-2xl border border-line bg-paper-raised p-5"><p className="text-xs font-medium uppercase tracking-wide text-ink-muted">{label}</p><p className="font-display font-semibold text-2xl text-ink tracking-tight mt-3">{value}</p><p className="text-xs text-ink-muted mt-1">{detail}</p></div> }
function Status({ status }: { status: string }) { const completed = status === 'completed'; return <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-medium ${completed ? 'bg-market-50 text-market-700' : 'bg-paper text-ink-muted'}`}>{status}</span> }
