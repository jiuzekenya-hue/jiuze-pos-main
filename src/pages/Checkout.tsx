import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/auth-context'
import { listCategories } from '../services/categoryService'
import { completeSale, type CompletedSale, type SalePaymentMethod } from '../services/saleService'
import { listProducts } from '../services/productService'
import { isFractionalUnit, type Category, type Product } from '../types/products'

type CartLine = { product: Product; quantity: number }

const money = (value: number) => `KES ${value.toFixed(2)}`
const formatQuantity = (value: number) => Number.isInteger(value) ? String(value) : value.toFixed(3).replace(/0+$/, '').replace(/\.$/, '')

function SearchIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5"><circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.8" /><path d="m16 16 4 4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
}

function PlusIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4"><path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
}

function MinusIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4"><path d="M5 12h14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
}

export default function Checkout() {
  const { profile } = useAuth()
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [cart, setCart] = useState<CartLine[]>([])
  const [search, setSearch] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<SalePaymentMethod>('cash')
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentReference, setPaymentReference] = useState('')
  const [discount, setDiscount] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [completed, setCompleted] = useState<CompletedSale | null>(null)
  const [completedItems, setCompletedItems] = useState<CartLine[]>([])

  const load = useCallback(async () => {
    if (!profile?.businessId) return
    setLoading(true)
    setError(null)
    try {
      const [productRows, categoryRows] = await Promise.all([listProducts(profile.businessId), listCategories(profile.businessId)])
      setProducts(productRows)
      setCategories(categoryRows)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load checkout.')
    } finally {
      setLoading(false)
    }
  }, [profile?.businessId])

  useEffect(() => { void load() }, [load])

  const visibleProducts = useMemo(() => {
    const query = search.trim().toLowerCase()
    return products.filter((product) => product.isActive && product.stockQuantity > 0 && (!categoryId || product.categoryId === categoryId) && (!query || product.name.toLowerCase().includes(query) || product.sku.toLowerCase().includes(query) || product.barcode?.toLowerCase().includes(query)))
  }, [products, search, categoryId])

  const subtotal = useMemo(() => cart.reduce((sum, line) => sum + line.product.sellingPrice * line.quantity, 0), [cart])
  const discountValue = Math.max(0, Number(discount) || 0)
  const total = Math.max(0, subtotal - discountValue)
  const paid = Number(paymentAmount) || 0
  const change = Math.max(0, paid - total)

  const addToCart = (product: Product) => {
    setError(null)
    setCart((current) => {
      const existing = current.find((line) => line.product.id === product.id)
      if (!existing) return [...current, { product, quantity: 1 }]
      if (existing.quantity >= product.stockQuantity) return current
      const nextQuantity = isFractionalUnit(product.unitType) ? Math.min(product.stockQuantity, existing.quantity + 1) : existing.quantity + 1
      return current.map((line) => line.product.id === product.id ? { ...line, quantity: nextQuantity } : line)
    })
  }

  const setQuantity = (productId: string, value: number) => setCart((current) => current.flatMap((line) => {
    if (line.product.id !== productId) return [line]
    if (!Number.isFinite(value) || value <= 0) return []
    return [{ ...line, quantity: Math.min(value, line.product.stockQuantity) }]
  }))

  const changeQuantity = (line: CartLine, delta: number) => {
    const step = isFractionalUnit(line.product.unitType) ? 0.001 : 1
    setQuantity(line.product.id, line.quantity + delta * step)
  }

  const submit = async () => {
    if (!cart.length) { setError('Add at least one product to the cart.'); return }
    if (paid < total) { setError('Payment amount is less than the sale total.'); return }
    if (paymentMethod !== 'cash' && !paymentReference.trim()) { setError('A payment reference is required for M-Pesa and card payments.'); return }
    if (paymentMethod !== 'cash' && paid !== total) { setError('M-Pesa and card payments must equal the sale total.'); return }
    setSaving(true)
    setError(null)
    const soldItems = cart.map((line) => ({ ...line }))
    try {
      const result = await completeSale({ items: cart.map((line) => ({ productId: line.product.id, quantity: line.quantity })), paymentMethod, paymentAmount: paid, paymentReference, discount: discountValue })
      setCompleted(result)
      setCompletedItems(soldItems)
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

  const startNewSale = () => {
    setCompleted(null)
    setCompletedItems([])
    setError(null)
  }

  if (completed) return <div className="min-h-screen bg-paper px-4 py-8 sm:px-6">
    <style>{`@media print { body * { visibility: hidden !important; } .receipt-print, .receipt-print * { visibility: visible !important; } .receipt-print { position: absolute; left: 0; top: 0; width: 80mm; margin: 0; padding: 8mm; border: 0 !important; box-shadow: none !important; } .receipt-actions { display: none !important; } }`}</style>
    <div className="max-w-md mx-auto">
      <div className="receipt-print rounded-2xl border border-line bg-paper-raised p-6 shadow-sm">
        <div className="text-center border-b border-line pb-5"><p className="font-display font-semibold text-2xl text-ink">JIUZEPOS</p><p className="text-xs text-ink-muted mt-1">Sales receipt</p><p className="text-xs font-mono text-ink mt-3">{completed.receiptNumber}</p></div>
        <div className="py-5 space-y-3 text-sm">{completedItems.map((line) => <div key={line.product.id} className="flex justify-between gap-4"><div className="min-w-0"><p className="font-medium text-ink">{line.product.name}</p><p className="text-xs text-ink-muted">{formatQuantity(line.quantity)} {line.product.unitType} × {money(line.product.sellingPrice)}</p></div><span className="font-medium text-ink">{money(line.product.sellingPrice * line.quantity)}</span></div>)}</div>
        <div className="border-t border-line pt-4 space-y-2 text-sm"><div className="flex justify-between"><span className="text-ink-muted">Subtotal</span><span>{money(completed.subtotal)}</span></div><div className="flex justify-between"><span className="text-ink-muted">Discount</span><span>{money(completed.discount)}</span></div><div className="flex justify-between text-base font-semibold"><span>Total</span><span>{money(completed.total)}</span></div><div className="flex justify-between"><span className="text-ink-muted">Payment</span><span>{completed.paymentMethod.toUpperCase()}</span></div><div className="flex justify-between"><span className="text-ink-muted">Paid</span><span>{money(completed.amountPaid)}</span></div><div className="flex justify-between font-semibold"><span>Change</span><span>{money(completed.change)}</span></div></div>
        <div className="border-t border-line mt-5 pt-4 text-center text-xs text-ink-muted">Thank you for your purchase.</div>
      </div>
      <div className="receipt-actions flex flex-wrap justify-center gap-3 mt-6"><button type="button" onClick={() => window.print()} className="rounded-xl bg-ink px-4 py-2.5 text-sm font-medium text-paper">Print receipt</button><button type="button" onClick={startNewSale} className="rounded-xl border border-line px-4 py-2.5 text-sm font-medium text-ink">New sale</button><Link to="/products" className="rounded-xl border border-line px-4 py-2.5 text-sm font-medium text-ink-muted">Products</Link><Link to="/" className="rounded-xl border border-line px-4 py-2.5 text-sm font-medium text-ink-muted">Home</Link></div>
    </div>
  </div>

  return <div className="min-h-screen bg-paper px-4 py-5 sm:px-6 lg:px-8">
    <div className="max-w-[1500px] mx-auto">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between mb-6">
        <div><p className="text-xs font-mono uppercase tracking-[0.16em] text-market-700">Point of sale</p><h1 className="font-display font-semibold text-3xl sm:text-4xl text-ink mt-1">New sale</h1><p className="text-sm text-ink-muted mt-2">Select products, review the order and collect payment.</p></div>
        <div className="flex items-center gap-4 text-sm"><Link to="/" className="text-ink-muted hover:text-ink">Dashboard</Link><Link to="/sales" className="text-ink-muted hover:text-ink">Sales history</Link></div>
      </header>

      {error && <div role="alert" className="mb-5 rounded-xl border border-brick-200 bg-brick-50 px-4 py-3 text-sm text-brick-700">{error}</div>}

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_420px] gap-6 items-start">
        <section className="min-w-0">
          <div className="rounded-2xl border border-line bg-paper-raised p-4 sm:p-5 mb-5">
            <label className="relative block">
              <span className="sr-only">Search products</span>
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-muted"><SearchIcon /></span>
              <input autoFocus value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by product name, SKU or barcode..." aria-label="Search products" className="field w-full h-12 pl-12 pr-4 text-sm sm:text-base" />
            </label>
            <div className="flex gap-2 overflow-x-auto pt-4 pb-1 scrollbar-none">
              <button type="button" onClick={() => setCategoryId('')} className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium transition-colors ${!categoryId ? 'bg-ink text-paper' : 'border border-line text-ink-muted hover:text-ink hover:border-ink'}`}>All products</button>
              {categories.map((category) => <button key={category.id} type="button" onClick={() => setCategoryId(category.id)} className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium transition-colors ${categoryId === category.id ? 'bg-ink text-paper' : 'border border-line text-ink-muted hover:text-ink hover:border-ink'}`}>{category.name}</button>)}
            </div>
          </div>

          <div className="flex items-center justify-between mb-3"><div><h2 className="font-display font-semibold text-xl text-ink">Products</h2><p className="text-xs text-ink-muted mt-1">{visibleProducts.length} available</p></div>{cart.length > 0 && <span className="text-sm text-ink-muted">{cart.length} {cart.length === 1 ? 'item' : 'items'} in sale</span>}</div>

          {loading ? <div className="rounded-2xl border border-line bg-paper-raised px-5 py-16 text-center text-sm text-ink-muted">Loading products…</div> : <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
            {visibleProducts.map((product) => {
              const inCart = cart.find((line) => line.product.id === product.id)
              const stockLow = product.stockQuantity <= product.minimumStock
              return <button key={product.id} type="button" onClick={() => addToCart(product)} className="group text-left rounded-2xl border border-line bg-paper-raised p-4 sm:p-5 hover:border-market-300 hover:shadow-sm transition-all active:scale-[0.99]">
                <div className="flex items-start justify-between gap-2"><span className="rounded-full bg-paper px-2.5 py-1 text-[10px] font-mono uppercase tracking-wide text-ink-muted">{product.unitType}</span>{inCart && <span className="rounded-full bg-market-50 px-2.5 py-1 text-[10px] font-semibold text-market-700">{formatQuantity(inCart.quantity)} added</span>}</div>
                <p className="font-medium text-ink mt-5 line-clamp-2 min-h-10">{product.name}</p>
                <p className="font-mono text-[11px] text-ink-muted mt-1 truncate">{product.sku}</p>
                <div className="flex items-end justify-between gap-2 mt-5"><div><p className="font-display font-semibold text-lg text-ink">{money(product.sellingPrice)}</p><p className={`text-[11px] mt-1 ${stockLow ? 'text-brick-600' : 'text-ink-muted'}`}>{formatQuantity(product.stockQuantity)} {product.unitType} left</p></div><span className="h-9 w-9 shrink-0 rounded-xl border border-line flex items-center justify-center text-ink-muted group-hover:bg-ink group-hover:text-paper group-hover:border-ink transition-colors"><PlusIcon /></span></div>
              </button>
            })}
            {visibleProducts.length === 0 && <div className="col-span-full rounded-2xl border border-dashed border-line bg-paper-raised px-5 py-16 text-center"><p className="font-medium text-ink">No products found</p><p className="text-sm text-ink-muted mt-1">Try another search or category.</p></div>}
          </div>}
        </section>

        <aside className="rounded-2xl border border-line bg-paper-raised shadow-sm xl:sticky xl:top-5 overflow-hidden">
          <div className="px-5 py-5 border-b border-line flex items-center justify-between"><div><p className="text-xs font-mono uppercase tracking-[0.14em] text-ink-muted">Current sale</p><h2 className="font-display font-semibold text-xl text-ink mt-1">Order summary</h2></div><span className="rounded-full bg-paper px-3 py-1 text-xs font-mono text-ink-muted">{cart.length} lines</span></div>

          <div className="px-5 max-h-[360px] overflow-y-auto">
            {cart.length === 0 ? <div className="py-14 text-center"><div className="mx-auto h-12 w-12 rounded-2xl bg-paper flex items-center justify-center text-ink-muted"><PlusIcon /></div><p className="font-medium text-ink mt-4">No items yet</p><p className="text-sm text-ink-muted mt-1">Click a product to add it to the sale.</p></div> : cart.map((line) => <div key={line.product.id} className="py-4 border-b border-line last:border-0"><div className="flex justify-between gap-3"><div className="min-w-0"><p className="text-sm font-medium text-ink truncate">{line.product.name}</p><p className="text-xs text-ink-muted mt-1">{money(line.product.sellingPrice)} / {line.product.unitType}</p></div><button type="button" onClick={() => setQuantity(line.product.id, 0)} className="text-xs text-brick-600 hover:underline">Remove</button></div><div className="flex items-center justify-between gap-3 mt-3"><div className="flex items-center rounded-xl border border-line overflow-hidden"><button type="button" aria-label={`Decrease ${line.product.name}`} onClick={() => changeQuantity(line, -1)} className="h-9 w-9 flex items-center justify-center text-ink-muted hover:bg-paper"><MinusIcon /></button><input aria-label={`Quantity for ${line.product.name}`} type="number" min="0.001" max={line.product.stockQuantity} step={isFractionalUnit(line.product.unitType) ? '0.001' : '1'} value={line.quantity} onChange={(e) => setQuantity(line.product.id, Number(e.target.value))} className="h-9 w-16 border-x border-line bg-transparent text-center text-sm font-medium outline-none" /><button type="button" aria-label={`Increase ${line.product.name}`} onClick={() => changeQuantity(line, 1)} disabled={line.quantity >= line.product.stockQuantity} className="h-9 w-9 flex items-center justify-center text-ink-muted hover:bg-paper disabled:opacity-30"><PlusIcon /></button></div><span className="text-sm font-semibold text-ink">{money(line.product.sellingPrice * line.quantity)}</span></div></div>)}
          </div>

          <div className="border-t border-line px-5 py-5 space-y-4">
            <div className="space-y-2 text-sm"><div className="flex justify-between"><span className="text-ink-muted">Subtotal</span><span className="font-medium text-ink">{money(subtotal)}</span></div><label className="block text-ink-muted">Discount<input type="number" min="0" step="0.01" value={discount} onChange={(e) => setDiscount(e.target.value)} placeholder="0.00" className="field mt-1.5 w-full h-10" /></label><div className="flex justify-between items-end pt-2"><span className="font-medium text-ink">Total</span><span className="font-display font-semibold text-2xl text-ink">{money(total)}</span></div></div>

            <div><p className="text-sm font-medium text-ink mb-2.5">Payment method</p><div className="grid grid-cols-3 gap-2">{(['cash', 'mpesa', 'card'] as SalePaymentMethod[]).map((method) => <button key={method} type="button" onClick={() => setPaymentMethod(method)} className={`rounded-xl border px-3 py-2.5 text-sm font-medium capitalize transition-colors ${paymentMethod === method ? 'border-ink bg-ink text-paper' : 'border-line text-ink-muted hover:border-ink hover:text-ink'}`}>{method === 'mpesa' ? 'M-Pesa' : method}</button>)}</div></div>

            <label className="block text-sm font-medium text-ink">Amount paid<input type="number" min="0" step="0.01" value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)} placeholder={total.toFixed(2)} className="field mt-1.5 w-full h-11 text-base" /></label>
            {paymentMethod !== 'cash' && <label className="block text-sm font-medium text-ink">Payment reference<input value={paymentReference} onChange={(e) => setPaymentReference(e.target.value)} placeholder={paymentMethod === 'mpesa' ? 'M-Pesa transaction code' : 'Card reference'} className="field mt-1.5 w-full h-11" /></label>}

            <div className="rounded-xl bg-paper px-4 py-3 flex items-center justify-between"><span className="text-sm text-ink-muted">Change</span><span className="font-display font-semibold text-lg text-ink">{money(change)}</span></div>
            <button type="button" onClick={() => void submit()} disabled={saving || !cart.length || paid < total || (paymentMethod !== 'cash' && paid !== total)} className="w-full rounded-xl bg-market-700 px-4 py-3.5 text-sm font-semibold text-white shadow-sm hover:bg-market-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">{saving ? 'Completing sale…' : 'Complete sale'}</button>
            {!cart.length && <p className="text-center text-xs text-ink-muted">Add products to enable checkout.</p>}
          </div>
        </aside>
      </div>
    </div>
  </div>
}
