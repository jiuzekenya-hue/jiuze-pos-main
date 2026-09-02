import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/auth-context'
import { can } from '../lib/permissions'
import { getDashboardData, type DashboardData } from '../services/dashboardService'

const money = (value: number) => `KES ${value.toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export default function Dashboard() {
  const { profile, role, signOut } = useAuth()
  const [data, setData] = useState<DashboardData | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!profile?.businessId) return
    getDashboardData(profile.businessId).then(setData).catch((err) => setError(err instanceof Error ? err.message : 'Unable to load dashboard.'))
  }, [profile?.businessId])

  if (error) return <main className="min-h-screen p-6"><p className="text-brick-600">{error}</p></main>
  if (!data) return <main className="min-h-screen flex items-center justify-center text-ink-muted">Loading dashboard…</main>

  return (
    <main className="min-h-screen bg-paper px-6 py-8">
      <div className="max-w-5xl mx-auto">
        <header className="flex items-center justify-between mb-8">
          <div><h1 className="font-display font-semibold text-3xl text-ink">Dashboard</h1><p className="text-sm text-ink-muted mt-1">Today at a glance</p></div>
          <div className="flex items-center gap-3 text-sm">
            <Link className="px-3 py-2 border border-line rounded" to="/checkout">New sale</Link>
            <Link className="px-3 py-2 border border-line rounded" to="/sales">Sales</Link>
            {can(role, 'userManagement') && <Link className="px-3 py-2 border border-line rounded" to="/users">Users</Link>}
            <button type="button" onClick={() => void signOut()} className="px-3 py-2 text-ink-muted hover:text-brick-600 transition-colors">Sign out</button>
          </div>
        </header>

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-8">
          {[['Today revenue', money(data.todayRevenue)], ['Transactions', data.todayTransactions], ['Items sold', data.todayItemsSold], ['Low stock', data.lowStockCount]].map(([label, value]) => <div key={String(label)} className="bg-paper-raised border border-line rounded-lg p-5"><p className="text-xs text-ink-muted">{label}</p><p className="font-display font-semibold text-2xl text-ink mt-2">{value}</p></div>)}
        </section>

        <div className="grid gap-6 lg:grid-cols-2">
          <section className="bg-paper-raised border border-line rounded-lg overflow-hidden">
            <div className="px-5 py-4 border-b border-line flex justify-between"><h2 className="font-display font-semibold text-lg">Recent sales</h2><Link className="text-xs text-market-600" to="/sales">View all</Link></div>
            <div className="divide-y divide-line">{data.recentSales.length === 0 ? <p className="p-5 text-sm text-ink-muted">No completed sales yet.</p> : data.recentSales.map((sale) => <Link to={`/sales?sale=${sale.id}`} key={sale.id} className="p-4 flex items-center justify-between hover:bg-paper"><div><p className="font-mono text-sm text-ink">{sale.receiptNumber}</p><p className="text-xs text-ink-muted">{new Date(sale.createdAt).toLocaleString()}</p></div><strong className="text-sm text-ink">{money(sale.total)}</strong></Link>)}</div>
          </section>

          <section className="bg-paper-raised border border-line rounded-lg overflow-hidden">
            <div className="px-5 py-4 border-b border-line flex justify-between"><h2 className="font-display font-semibold text-lg">Low stock</h2><Link className="text-xs text-market-600" to="/products">Products</Link></div>
            <div className="divide-y divide-line">{data.lowStockProducts.length === 0 ? <p className="p-5 text-sm text-ink-muted">No products are at or below minimum stock.</p> : data.lowStockProducts.map((product) => <div key={product.id} className="p-4 flex items-center justify-between"><div><p className="text-sm font-medium text-ink">{product.name}</p><p className="text-xs text-ink-muted">Minimum {product.minimumStock}</p></div><strong className="text-sm text-ink">{product.stockQuantity} left</strong></div>)}</div>
          </section>
        </div>

        <nav className="mt-6 flex flex-wrap gap-3 text-sm"><Link className="text-market-600" to="/products">Products</Link><Link className="text-market-600" to="/categories">Categories</Link><Link className="text-market-600" to="/stock-movements">Stock history</Link><Link className="text-market-600" to="/sales">Sales history</Link>{can(role, 'userManagement') && <Link className="text-market-600" to="/users">Users</Link>}</nav>
      </div>
    </main>
  )
}
