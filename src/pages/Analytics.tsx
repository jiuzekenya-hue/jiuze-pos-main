import { useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/auth-context'
import { can } from '../lib/permissions'
import { getAnalyticsData, type AnalyticsData } from '../services/analyticsService'

const money = (value: number) => `KES ${value.toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const quantity = (value: number) => Number.isInteger(value) ? String(value) : value.toFixed(3).replace(/0+$/, '').replace(/\.$/, '')

export default function Analytics() {
  const { profile, role } = useAuth()
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!profile?.businessId || !can(role, 'reports')) return
    setError('')
    getAnalyticsData(profile.businessId).then(setData).catch((err) => setError(err instanceof Error ? err.message : 'Unable to load analytics.'))
  }, [profile?.businessId, role])

  if (!can(role, 'reports')) return <Navigate to="/" replace />
  if (error) return <main className="min-h-screen bg-paper px-5 py-8"><div className="max-w-6xl mx-auto"><p role="alert" className="rounded-xl border border-brick-200 bg-brick-50 px-4 py-3 text-sm text-brick-700">{error}</p></div></main>
  if (!data) return <main className="min-h-screen bg-paper flex items-center justify-center text-sm text-ink-muted">Loading analytics…</main>

  const maxRevenue = Math.max(...data.salesTrend.map((day) => day.revenue), 1)
  const bestProductRevenue = Math.max(...data.topProducts.map((product) => product.revenue), 1)
  const slowestUnits = Math.max(...data.slowProducts.map((product) => product.units), 1)
  const projectionProgress = data.projectedMonthRevenue ? Math.min(100, (data.monthRevenue / data.projectedMonthRevenue) * 100) : 0
  const trendLabels = data.salesTrend.filter((_, index) => index % 5 === 0 || index === data.salesTrend.length - 1)

  return <main className="min-h-screen bg-paper px-5 py-6 sm:px-6 lg:px-8">
    <div className="max-w-[1500px] mx-auto">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between mb-7">
        <div><p className="text-xs font-medium uppercase tracking-[0.16em] text-market-600">Owner intelligence</p><h1 className="font-display font-semibold text-3xl sm:text-4xl text-ink tracking-tight mt-2">Analytics</h1><p className="text-sm text-ink-muted mt-2">Understand sales, profit, products and where the business is heading.</p></div>
        <div className="flex items-center gap-2"><span className="rounded-full border border-line bg-paper-raised px-3 py-2 text-xs text-ink-muted">Last 30 days</span><Link to="/checkout" className="rounded-lg bg-ink px-4 py-2.5 text-sm font-medium text-paper">New sale</Link></div>
      </header>
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 mb-5"><Metric label="Today" value={money(data.todayRevenue)} detail={`${money(data.todayProfit)} gross profit`} /><Metric label="This week" value={money(data.weekRevenue)} detail={`${money(data.weekProfit)} gross profit`} /><Metric label="This month" value={money(data.monthRevenue)} detail={`${data.monthTransactions} transactions`} /><Metric label="Gross margin" value={`${data.grossMargin.toFixed(1)}%`} detail={`Avg sale ${money(data.averageSale)}`} /></section>
      <section className="grid gap-5 xl:grid-cols-[1.6fr_0.9fr] mb-5">
        <div className="rounded-2xl border border-line bg-paper-raised p-5 sm:p-6"><div className="flex items-start justify-between gap-4 mb-6"><div><h2 className="font-display font-semibold text-lg text-ink">Sales performance</h2><p className="text-xs text-ink-muted mt-1">Daily revenue for the last 30 days</p></div><div className="text-right"><p className="text-xs text-ink-muted">Current month</p><p className="font-display font-semibold text-lg text-ink mt-1">{money(data.monthRevenue)}</p></div></div><div className="h-56 flex items-end gap-1.5 sm:gap-2 border-b border-line pb-1">{data.salesTrend.map((day) => <div key={day.date} className="group flex-1 h-full flex items-end"><div title={`${day.date}: ${money(day.revenue)}`} className="w-full min-h-1 rounded-t-md bg-market-600/80 group-hover:bg-market-700 transition-colors" style={{ height: `${Math.max(2, (day.revenue / maxRevenue) * 100)}%` }} /></div>)}</div><div className="flex justify-between pt-2 text-[10px] font-mono text-ink-muted">{trendLabels.map((day) => <span key={day.date}>{day.date.slice(5)}</span>)}</div></div>
        <div className="rounded-2xl border border-line bg-paper-raised p-5 sm:p-6"><div className="flex items-start justify-between"><div><h2 className="font-display font-semibold text-lg text-ink">Monthly projection</h2><p className="text-xs text-ink-muted mt-1">Based on current daily pace</p></div><span className="text-xs rounded-full bg-market-50 text-market-700 px-2.5 py-1">Estimated</span></div><div className="mt-7"><p className="text-xs uppercase tracking-wide text-ink-muted">Projected revenue</p><p className="font-display font-semibold text-3xl text-ink mt-2">{money(data.projectedMonthRevenue)}</p><div className="h-2 rounded-full bg-paper mt-4 overflow-hidden"><div className="h-full rounded-full bg-market-600" style={{ width: `${projectionProgress}%` }} /></div><div className="flex justify-between text-xs mt-2"><span className="text-ink-muted">{money(data.monthRevenue)} achieved</span><span className="text-ink-muted">{projectionProgress.toFixed(0)}%</span></div></div><div className="border-t border-line mt-6 pt-5"><p className="text-xs uppercase tracking-wide text-ink-muted">Projected gross profit</p><p className="font-display font-semibold text-xl text-ink mt-2">{money(data.projectedMonthProfit)}</p></div></div>
      </section>
      <section className="grid gap-5 lg:grid-cols-3 mb-5"><InsightCard label="Inventory value" value={money(data.inventoryValue)} detail="At current cost price" /><InsightCard label="Low stock" value={String(data.lowStockCount)} detail={data.lowStockCount ? 'Products need attention' : 'Inventory looks healthy'} alert={data.lowStockCount > 0} /><InsightCard label="Average transaction" value={money(data.averageSale)} detail="Current month average" /></section>
      <section className="grid gap-5 lg:grid-cols-2"><ProductTable title="Top products" subtitle="Highest revenue this month" products={data.topProducts} max={bestProductRevenue} /><ProductTable title="Slow-moving products" subtitle="Lowest unit sales this month" products={data.slowProducts} max={slowestUnits} units /></section>
    </div>
  </main>
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) { return <div className="rounded-2xl border border-line bg-paper-raised p-5"><p className="text-xs font-medium uppercase tracking-wide text-ink-muted">{label}</p><p className="font-display font-semibold text-2xl text-ink tracking-tight mt-3">{value}</p><p className="text-xs text-ink-muted mt-1">{detail}</p></div> }
function InsightCard({ label, value, detail, alert = false }: { label: string; value: string; detail: string; alert?: boolean }) { return <div className="rounded-2xl border border-line bg-paper-raised p-5 flex items-start justify-between gap-4"><div><p className="text-xs font-medium uppercase tracking-wide text-ink-muted">{label}</p><p className="font-display font-semibold text-xl text-ink mt-3">{value}</p><p className={`text-xs mt-1 ${alert ? 'text-brick-600' : 'text-ink-muted'}`}>{detail}</p></div>{alert && <span className="h-2.5 w-2.5 rounded-full bg-brick-600 mt-1" />}</div> }
function ProductTable({ title, subtitle, products, max, units = false }: { title: string; subtitle: string; products: AnalyticsData['topProducts']; max: number; units?: boolean }) { return <section className="rounded-2xl border border-line bg-paper-raised overflow-hidden"><div className="px-5 py-4 border-b border-line"><h2 className="font-display font-semibold text-lg text-ink">{title}</h2><p className="text-xs text-ink-muted mt-1">{subtitle}</p></div><div className="divide-y divide-line">{products.length === 0 ? <p className="px-5 py-10 text-sm text-ink-muted">Not enough sales data yet.</p> : products.map((product, index) => <div key={product.id} className="px-5 py-4 flex items-center gap-4"><span className="w-5 text-xs font-mono text-ink-muted">0{index + 1}</span><div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-3"><p className="text-sm font-medium text-ink truncate">{product.name}</p><span className="text-sm font-semibold text-ink whitespace-nowrap">{units ? `${quantity(product.units)} units` : money(product.revenue)}</span></div><div className="h-1.5 rounded-full bg-paper mt-2 overflow-hidden"><div className="h-full rounded-full bg-market-600" style={{ width: `${Math.max(3, ((units ? product.units : product.revenue) / max) * 100)}%` }} /></div><p className="text-[11px] text-ink-muted mt-1">{units ? money(product.revenue) : `${quantity(product.units)} units · ${money(product.profit)} profit`}</p></div></div>)}</div></section> }
