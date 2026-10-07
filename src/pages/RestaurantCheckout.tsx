import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../contexts/auth-context'
import { getBusiness, type Business } from '../services/businessService'
import { listCategories } from '../services/categoryService'
import { completeSale, type SalePaymentMethod } from '../services/saleService'
import { listProducts } from '../services/productService'
import { directPrint } from '../services/printerService'
import type { Category, Product } from '../types/products'

type CartLine = { product: Product; quantity: number }

const money = (value: number) => `KES ${value.toFixed(2)}`
const tables = Array.from({ length: 12 }, (_, index) => index + 1)

function Icon({ name }: { name: 'search' | 'plus' | 'minus' | 'close' }) {
  if (name === 'search') return <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true"><circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.8"/><path d="m16 16 4 4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
  if (name === 'plus') return <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true"><path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
  if (name === 'minus') return <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true"><path d="M5 12h14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
  return <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
}

export default function RestaurantCheckout() {
  const { profile } = useAuth()
  const [business, setBusiness] = useState<Business | null>(null)
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [selectedTable, setSelectedTable] = useState<number | 'takeaway'>(1)
  const [department, setDepartment] = useState('All')
  const [search, setSearch] = useState('')
  const [cart, setCart] = useState<CartLine[]>([])
  const [paymentMethod, setPaymentMethod] = useState<SalePaymentMethod>('cash')
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentReference, setPaymentReference] = useState('')
  const [discount, setDiscount] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    if (!profile?.businessId) return
    setLoading(true)
    setError('')
    try {
      const [businessData, productRows, categoryRows] = await Promise.all([
        getBusiness(profile.businessId),
        listProducts(profile.businessId),
        listCategories(profile.businessId),
      ])
      setBusiness(businessData)
      setProducts(productRows)
      setCategories(categoryRows)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load restaurant POS.')
    } finally {
      setLoading(false)
    }
  }, [profile?.businessId])

  useEffect(() => { void load() }, [load])

  const departments = useMemo(() => ['All', ...categories.map((category) => category.name)], [categories])
  const visibleProducts = useMemo(() => {
    const query = search.trim().toLowerCase()
    return products.filter((product) => product.isActive && product.stockQuantity > 0 &&
      (department === 'All' || categories.find((category) => category.id === product.categoryId)?.name === department) &&
      (!query || product.name.toLowerCase().includes(query) || product.sku.toLowerCase().includes(query)))
  }, [products, categories, department, search])

  const subtotal = useMemo(() => cart.reduce((sum, line) => sum + line.product.sellingPrice * line.quantity, 0), [cart])
  const discountValue = Math.max(0, Number(discount) || 0)
  const total = Math.max(0, subtotal - discountValue)
  const paid = Number(paymentAmount) || 0
  const change = Math.max(0, paid - total)

  const addProduct = (product: Product) => {
    setMessage('')
    setError('')
    setCart((current) => {
      const existing = current.find((line) => line.product.id === product.id)
      if (existing) {
        if (existing.quantity >= product.stockQuantity) return current
        return current.map((line) => line.product.id === product.id ? { ...line, quantity: line.quantity + 1 } : line)
      }
      return [...current, { product, quantity: 1 }]
    })
  }

  const changeQuantity = (productId: string, delta: number) => {
    setCart((current) => current.flatMap((line) => {
      if (line.product.id !== productId) return [line]
      const next = Math.min(line.product.stockQuantity, line.quantity + delta)
      return next <= 0 ? [] : [{ ...line, quantity: next }]
    }))
  }

  const takePayment = async () => {
    if (!cart.length) { setError('Add items to the order first.'); return }
    if (paid < total) { setError('Payment amount is less than the total due.'); return }
    if (paymentMethod !== 'cash' && (!paymentReference.trim() || paid !== total)) {
      setError('M-Pesa and card payments must equal the total and include a reference.')
      return
    }
    if (!profile?.businessId) return
    setSaving(true)
    setError('')
    setMessage('')
    const soldItems = cart.map((line) => ({ ...line }))
    try {
      const result = await completeSale({
        items: soldItems.map((line) => ({ productId: line.product.id, quantity: line.quantity })),
        paymentMethod,
        paymentAmount: paid,
        paymentReference,
        discount: discountValue,
      })
      const printed = await directPrint({
        businessName: business?.name || 'Restaurant',
        serviceType: 'restaurant',
        location: selectedTable === 'takeaway' ? 'Takeaway' : `Table ${selectedTable}`,
        title: 'SALES RECEIPT',
        status: 'paid',
        receiptNumber: result.receiptNumber,
        cashier: profile.fullName?.trim() || 'Unknown cashier',
        items: soldItems.map((line) => ({ name: line.product.name, quantity: line.quantity, unitPrice: line.product.sellingPrice, lineTotal: line.product.sellingPrice * line.quantity })),
        subtotal: result.subtotal,
        discount: result.discount,
        total: result.total,
        paymentMethod: result.paymentMethod,
        paymentReference: paymentReference.trim(),
        amountPaid: result.amountPaid,
        change: result.change,
      })
      setMessage(`Table ${selectedTable === 'takeaway' ? 'Takeaway' : selectedTable} paid · ${result.receiptNumber}${printed ? '' : ' · receipt ready for browser printing'}`)
      setCart([])
      setPaymentAmount('')
      setPaymentReference('')
      setDiscount('')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to complete sale.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="min-h-screen bg-[#eef0f5] text-ink px-3 py-3 sm:px-5 lg:px-7">
      <div className="mx-auto max-w-[1600px]">
        <header className="mb-3 flex items-center justify-between rounded-xl border border-slate-300 bg-white px-4 py-3 shadow-sm">
          <div>
            <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Restaurant POS</p>
            <h1 className="font-display text-xl font-semibold">{business?.name || 'Bar & Restaurant'}</h1>
          </div>
          <div className="text-right text-xs text-slate-500"><p className="font-medium text-slate-700">{profile?.fullName || 'Cashier'}</p><p>Table service</p></div>
        </header>

        {error && <div role="alert" className="mb-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
        {message && <div role="status" className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</div>}

        <div className="grid gap-3 xl:grid-cols-[190px_minmax(0,1fr)_390px]">
          <aside className="rounded-xl border border-slate-300 bg-white p-2 shadow-sm">
            <p className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Locations</p>
            <button type="button" onClick={() => setSelectedTable('takeaway')} className={`mb-1 w-full rounded-lg px-3 py-3 text-left text-sm font-semibold ${selectedTable === 'takeaway' ? 'bg-slate-800 text-white' : 'hover:bg-slate-100'}`}>Takeaway</button>
            <div className="grid grid-cols-2 gap-1">
              {tables.map((table) => <button key={table} type="button" onClick={() => setSelectedTable(table)} className={`rounded-lg px-2 py-3 text-sm font-semibold ${selectedTable === table ? 'bg-market-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>Table {table}</button>)}
            </div>
          </aside>

          <section className="min-w-0 rounded-xl border border-slate-300 bg-white shadow-sm overflow-hidden">
            <div className="border-b border-slate-300 p-3">
              <div className="flex gap-2 overflow-x-auto pb-2">
                {departments.map((item) => <button key={item} type="button" onClick={() => setDepartment(item)} className={`shrink-0 rounded-md border px-4 py-2 text-xs font-semibold ${department === item ? 'border-market-600 bg-market-600 text-white' : 'border-slate-300 bg-slate-50 text-slate-700'}`}>{item}</button>)}
              </div>
              <label className="relative block">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"><Icon name="search"/></span>
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search item..." className="h-11 w-full rounded-lg border border-slate-300 bg-slate-50 pl-10 pr-3 text-sm outline-none focus:border-market-500"/>
              </label>
            </div>
            <div className="max-h-[calc(100vh-190px)] overflow-y-auto p-3">
              {loading ? <div className="py-20 text-center text-sm text-slate-500">Loading products…</div> : <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                {visibleProducts.map((product) => <button key={product.id} type="button" onClick={() => addProduct(product)} className="min-h-24 rounded-lg border border-slate-300 bg-gradient-to-b from-white to-slate-50 p-3 text-left hover:border-market-500 hover:shadow-sm">
                  <span className="block text-[10px] uppercase tracking-wide text-slate-400">{product.unitType}</span>
                  <span className="mt-2 block line-clamp-2 text-sm font-semibold text-slate-800">{product.name}</span>
                  <span className="mt-2 block font-mono text-sm font-bold text-slate-900">{money(product.sellingPrice)}</span>
                </button>)}
              </div>}
              {!loading && visibleProducts.length === 0 && <div className="py-16 text-center text-sm text-slate-500">No items found in this department.</div>}
            </div>
          </section>

          <aside className="rounded-xl border border-slate-300 bg-white shadow-sm overflow-hidden">
            <div className="border-b border-slate-300 bg-slate-50 px-4 py-3 flex items-center justify-between">
              <div><p className="text-[10px] uppercase tracking-wider text-slate-500">Current order</p><h2 className="font-display text-lg font-semibold">{selectedTable === 'takeaway' ? 'Takeaway' : `Table ${selectedTable}`}</h2></div>
              <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-semibold text-slate-500">{cart.length} items</span>
            </div>
            <div className="max-h-[32vh] overflow-y-auto">
              {cart.length === 0 ? <div className="py-12 text-center text-sm text-slate-500">No items added</div> : cart.map((line) => <div key={line.product.id} className="border-b border-slate-200 px-4 py-3">
                <div className="flex items-start justify-between gap-3"><p className="text-sm font-semibold">{line.product.name}</p><button type="button" onClick={() => setCart((current) => current.filter((item) => item.product.id !== line.product.id))} className="text-slate-400"><Icon name="close"/></button></div>
                <div className="mt-2 flex items-center justify-between"><div className="flex items-center rounded-md border border-slate-300"><button type="button" onClick={() => changeQuantity(line.product.id, -1)} className="h-8 w-8 flex items-center justify-center"><Icon name="minus"/></button><span className="w-9 text-center text-sm font-semibold">{line.quantity}</span><button type="button" onClick={() => changeQuantity(line.product.id, 1)} className="h-8 w-8 flex items-center justify-center"><Icon name="plus"/></button></div><span className="font-mono text-sm font-semibold">{money(line.product.sellingPrice * line.quantity)}</span></div>
              </div>)}
            </div>
            <div className="border-t border-slate-300 p-4 space-y-3">
              <div className="flex justify-between text-sm"><span className="text-slate-500">Subtotal</span><b>{money(subtotal)}</b></div>
              <div className="flex items-center justify-between gap-3"><label className="text-sm text-slate-500">Discount</label><input type="number" min="0" step="0.01" value={discount} onChange={(e) => setDiscount(e.target.value)} className="h-9 w-28 rounded border border-slate-300 px-2 text-right text-sm"/></div>
              <div className="flex justify-between border-t border-slate-200 pt-3"><span className="font-semibold">TOTAL</span><span className="font-mono text-xl font-bold">{money(total)}</span></div>
              <div className="grid grid-cols-3 gap-1.5">{(['cash','mpesa','card'] as SalePaymentMethod[]).map((method) => <button key={method} type="button" onClick={() => setPaymentMethod(method)} className={`rounded-md border py-2 text-xs font-semibold capitalize ${paymentMethod === method ? 'border-slate-800 bg-slate-800 text-white' : 'border-slate-300'}`}>{method === 'mpesa' ? 'M-Pesa' : method}</button>)}</div>
              <input type="number" min="0" step="0.01" value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)} placeholder="Amount paid" className="field w-full"/>
              {paymentMethod !== 'cash' && <input value={paymentReference} onChange={(e) => setPaymentReference(e.target.value)} placeholder="Payment reference" className="field w-full"/>}
              {paymentMethod === 'cash' && <div className="flex justify-between rounded bg-slate-100 px-3 py-2 text-sm"><span className="text-slate-500">Change</span><b>{money(change)}</b></div>}
              <button type="button" onClick={() => void takePayment()} disabled={saving || !cart.length} className="w-full rounded-lg bg-market-600 py-3.5 text-sm font-bold text-white disabled:opacity-50">{saving ? 'Processing…' : `PAY ${money(total)}`}</button>
              <button type="button" onClick={() => setCart([])} disabled={!cart.length || saving} className="w-full rounded-lg border border-slate-300 py-2.5 text-xs font-semibold text-slate-600 disabled:opacity-40">Clear order</button>
            </div>
          </aside>
        </div>
      </div>
    </main>
  )
}
