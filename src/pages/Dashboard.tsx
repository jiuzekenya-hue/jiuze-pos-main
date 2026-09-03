import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/auth-context'
import { can } from '../lib/permissions'
import { getDashboardData, type DashboardData } from '../services/dashboardService'
import { getBusiness, type Business } from '../services/businessService'

const money = (value: number) => `KES ${value.toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const quantity = (value: number) => Number.isInteger(value) ? String(value) : value.toFixed(3).replace(/0+$/, '').replace(/\.$/, '')

export default function Dashboard() {
  const { profile, role } = useAuth()
  const [data, setData] = useState<DashboardData | null>(null)
  const [business, setBusiness] = useState<Business | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!profile?.businessId) return
    setError('')
    Promise.all([getDashboardData(profile.businessId), getBusiness(profile.businessId)])
      .then(([dashboardData, businessData]) => {
        setData(dashboardData)
        setBusiness(businessData)
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Unable to load dashboard.'))
  }, [profile?.businessId])

  if (error) return <main className="min-h-screen bg-paper px-6 py-8"><div className="max-w-5xl mx-auto"><p role="alert" className="rounded-xl border border-brick-200 bg-brick-50 px-4 py-3 text-sm text-brick-700">{error}</p></div></main>
  if (!data || !business) return <main className="min-h-screen bg-paper flex items-center justify-center text-sm text-ink-muted">Loading dashboard…</main>

  const stats = [
    { label: 'Today revenue', value: money(data.todayRevenue), detail: 'Sales today' },
    { label: 'Transactions', value: data.todayTransactions, detail: 'Completed sales' },
    { label: 'Items sold', value: quantity(data.todayItemsSold), detail: 'Units moved' },
    { label: 'Low stock', value: data.lowStockCount, detail: data.lowStockCount === 1 ? 'Needs attention' : 'Need attention', alert: data.lowStockCount > 0 },
  ]

  return (
    <main className="min-h-screen bg-paper px-5 py-6 sm:px-6 sm:py-8">
      <div className="max-w-6xl mx-auto">
        <header className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between mb-9">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-market-600">JIUZE POS</p>
            <h1 className="font-display font-semibold text-3xl sm:text-4xl text-ink tracking-tight mt-2">{business.name}</h1>
            <p className="text-sm text-ink-muted mt-2">Dashboard · Today at a glance</p>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Link className="rounded-lg bg-ink px-4 py-2.5 font-medium text-paper transition-transform hover:-translate-y-px" to="/checkout">New sale</Link>
            <Link className="hidden sm:inline-flex rounded-lg border border-line bg-paper-raised px-4 py-2.5 font-medium text-ink transition-colors hover:bg-paper" to="/sales">Sales</Link>
            {can(role, 'userManagement') && <Link className="hidden sm:inline-flex rounded-lg border border-line bg-paper-raised px-4 py-2.5 font-medium text-ink transition-colors hover:bg-paper" to="/users">Users</Link>}
          </div>
        </header>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 mb-8">
          {stats.map((stat) => (
            <div key={stat.label} className="bg-paper-raised border border-line rounded-xl p-5 shadow-[0_1px_2px_rgba(20,30,25,0.03)]">
              <div className="flex items-start justify-between gap-3">
                <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">{stat.label}</p>
                {stat.alert && <span className="h-2 w-2 rounded-full bg-brick-600 mt-1.5" aria-label="Attention required" />}
              </div>
              <p className="font-display font-semibold text-2xl sm:text-[27px] tracking-tight text-ink mt-3">{stat.value}</p>
              <p className={`text-xs mt-1 ${stat.alert ? 'text-brick-600' : 'text-ink-muted'}`}>{stat.detail}</p>
            </div>
          ))}
        </section>

        <div className="grid gap-5 lg:grid-cols-[1.25fr_1fr]">
          <section className="bg-paper-raised border border-line rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-line flex items-center justify-between">
              <div><h2 className="font-display font-semibold text-lg text-ink">Recent sales</h2><p className="text-xs text-ink-muted mt-1">Latest completed transactions</p></div>
              <Link className="text-xs font-medium text-market-600 hover:underline" to="/sales">View all</Link>
            </div>
            <div className="divide-y divide-line">
              {data.recentSales.length === 0 ? <p className="px-5 py-10 text-sm text-ink-muted">No completed sales yet.</p> : data.recentSales.map((sale) => (
                <Link to={`/sales?sale=${sale.id}`} key={sale.id} className="px-5 py-4 flex items-center justify-between gap-4 transition-colors hover:bg-paper">
                  <div className="min-w-0"><p className="font-mono text-sm font-medium text-ink truncate">{sale.receiptNumber}</p><p className="text-xs text-ink-muted mt-1">{new Date(sale.createdAt).toLocaleString()}</p></div>
                  <strong className="text-sm font-semibold text-ink whitespace-nowrap">{money(sale.total)}</strong>
                </Link>
              ))}
            </div>
          </section>

          <section className="bg-paper-raised border border-line rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-line flex items-center justify-between">
              <div><h2 className="font-display font-semibold text-lg text-ink">Low stock</h2><p className="text-xs text-ink-muted mt-1">Products needing attention</p></div>
              <Link className="text-xs font-medium text-market-600 hover:underline" to="/products">Products</Link>
            </div>
            <div className="divide-y divide-line">
              {data.lowStockProducts.length === 0 ? <p className="px-5 py-10 text-sm text-ink-muted">No products are at or below minimum stock.</p> : data.lowStockProducts.map((product) => (
                <div key={product.id} className="px-5 py-4 flex items-center justify-between gap-4">
                  <div className="min-w-0"><p className="text-sm font-medium text-ink truncate">{product.name}</p><p className="text-xs text-ink-muted mt-1">Minimum {quantity(product.minimumStock)}</p></div>
                  <strong className="text-sm font-semibold text-brick-600 whitespace-nowrap">{quantity(product.stockQuantity)} left</strong>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </main>
  )
}
