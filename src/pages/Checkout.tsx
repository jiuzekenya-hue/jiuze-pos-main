import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/auth-context'
import { listCategories } from '../services/categoryService'
import { completeSale, type CompletedSale, type SalePaymentMethod } from '../services/saleService'
import { listProducts } from '../services/productService'
import type { Category, Product } from '../types/products'

type CartLine = { product: Product; quantity: number }

const money = (value: number) => `KES ${value.toFixed(2)}`

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
      return current.map((line) => line.product.id === product.id ? { ...line, quantity: line.quantity + 1 } : line)
    })
  }

  const setQuantity = (productId: string, value: number) => {
    setCart((current) => current.flatMap((line) => {
      if (line.product.id !== productId) return [line]
      if (value <= 0) return []
      return [{ ...line, quantity: Math.min(value, line.product.stockQuantity) }]
    }))
  }

  const submit = async () => {
    if (!cart.length) { setError('Add at least one product to the cart.'); return }
    if (paid < total) { setError('Payment amount is less than the sale total.'); return }
    if (paymentMethod !== 'cash' && !paymentReference.trim()) { setError('A payment reference is required for M-Pesa and card payments.'); return }
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

  if (completed) return (
    <div className="min-h-screen bg-paper px-4 py-8 sm:px-6">
      <style>{`@media print { body * { visibility: hidden !important; } .receipt-print, .receipt-print * { visibility: visible !important; } .receipt-print { position: absolute; left: 0; top: 0; width: 80mm; margin: 0; padding: 8mm; border: 0 !important; box-shadow: none !important; } .receipt-actions { display: none !important; } }`}</style>
      <div className="max-w-md mx-auto">
        <div className="receipt-print rounded-lg border border-line bg-paper-raised p-6 shadow-sm">
          <div className="text-center border-b border-line pb-5">
            <p className="font-display font-semibold text-2xl text-ink">JIUZEPOS</p>
            <p className="text-xs text-ink-muted mt-1">Sales receipt</p>
            <p className="text-xs font-mono text-ink mt-3">{completed.receiptNumber}</p>
          </div>
          <div className="py-5 space-y-3 text-sm">
            {completedItems.map((line) => (
              <div key={line.product.id} className="flex justify-between gap-4">
                <div className="min-w-0">
                  <p className="font-medium text-ink">{line.product.name}</p>
                  <p className="text-xs text-ink-muted">{line.quantity} × {money(line.product.sellingPrice)}</p>
                </div>
                <span className="font-medium text-ink">{money(line.product.sellingPrice * line.quantity)}</span>
              </div>
            ))}
          </div>
          <div className="border-t border-line pt-4 space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-ink-muted">Subtotal</span><span>{money(completed.subtotal)}</span></div>
            <div className="flex justify-between"><span className="text-ink-muted">Discount</span><span>{money(completed.discount)}</span></div>
            <div className="flex justify-between text-base font-semibold"><span>Total</span><span>{money(completed.total)}</span></div>
            <div className="flex justify-between"><span className="text-ink-muted">Payment</span><span>{completed.paymentMethod.toUpperCase()}</span></div>
            <div className="flex justify-between"><span className="text-ink-muted">Paid</span><span>{money(completed.amountPaid)}</span></div>
            <div className="flex justify-between font-semibold"><span>Change</span><span>{money(completed.change)}</span></div>
          </div>
          <div className="border-t border-line mt-5 pt-4 text-center text-xs text-ink-muted">Thank you for your purchase.</div>
        </div>
        <div className="receipt-actions flex justify-center gap-3 mt-6">
          <button type="button" onClick={() => window.print()} className="rounded-md bg-ink px-4 py-2 text-sm font-medium text-paper">Print receipt</button>
          <button type="button" onClick={startNewSale} className="rounded-md border border-line px-4 py-2 text-sm font-medium text-ink">New sale</button>
          <Link to="/products" className="rounded-md border border-line px-4 py-2 text-sm font-medium text-ink-muted">Products</Link>
        </div>
      </div>
    </div>
  )

  return <div className="min-h-screen bg-paper px-4 py-6 sm:px-6"><div className="max-w-7xl mx-auto"><div className="flex items-start justify-between gap-4 mb-6"><div><p className="text-xs font-mono uppercase tracking-wide text-market-600">Phase 4</p><h1 className="font-display font-semibold text-3xl text-ink mt-1">Checkout</h1><p className="text-sm text-ink-muted mt-2">Sell products, collect payment and update stock atomically.</p></div><div className="flex gap-3 text-sm"><Link to="/products" className="text-market-700">Products</Link><Link to="/stock-movements" className="text-market-700">Stock history</Link></div></div>{error && <div role="alert" className="mb-5 rounded-md border border-brick-200 bg-brick-50 px-4 py-3 text-sm text-brick-700">{error}</div>}<div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-6"><section><div className="flex flex-col sm:flex-row gap-3 mb-4"><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search product, SKU or barcode" aria-label="Search products" className="field flex-1" /><select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} aria-label="Category" className="field sm:w-48"><option value="">All categories</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></div>{loading ? <div className="rounded-lg border border-line bg-paper-raised px-5 py-12 text-center text-sm text-ink-muted">Loading products…</div> : <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">{visibleProducts.map((product) => <button key={product.id} type="button" onClick={() => addToCart(product)} className="text-left rounded-lg border border-line bg-paper-raised p-4 hover:border-ink transition-colors"><p className="font-medium text-ink">{product.name}</p><p className="font-mono text-xs text-ink-muted mt-1">{product.sku}</p><p className="text-sm text-ink mt-3">{money(product.sellingPrice)}</p><p className="text-xs text-ink-muted mt-1">Stock {product.stockQuantity}</p></button>)}{visibleProducts.length === 0 && <div className="col-span-full rounded-lg border border-line bg-paper-raised px-5 py-12 text-center text-sm text-ink-muted">No active products found.</div>}</div>}</section><aside className="rounded-lg border border-line bg-paper-raised p-5 h-fit lg:sticky lg:top-5"><div className="flex items-center justify-between border-b border-line pb-4"><h2 className="font-medium text-ink">Cart</h2><span className="text-xs font-mono text-ink-muted">{cart.reduce((sum, line) => sum + line.quantity, 0)} items</span></div><div className="divide-y divide-line max-h-80 overflow-y-auto">{cart.length === 0 ? <p className="py-8 text-center text-sm text-ink-muted">Cart is empty.</p> : cart.map((line) => <div key={line.product.id} className="py-4"><div className="flex justify-between gap-3"><div><p className="text-sm font-medium text-ink">{line.product.name}</p><p className="text-xs text-ink-muted">{money(line.product.sellingPrice)} each</p></div><button type="button" onClick={() => setQuantity(line.product.id, 0)} className="text-xs text-brick-600">Remove</button></div><div className="flex items-center justify-between mt-2"><input aria-label={`Quantity for ${line.product.name}`} type="number" min="1" max={line.product.stockQuantity} value={line.quantity} onChange={(e) => setQuantity(line.product.id, Number(e.target.value))} className="field w-20" /><span className="text-sm font-medium text-ink">{money(line.product.sellingPrice * line.quantity)}</span></div></div>)}</div><div className="border-t border-line pt-4 mt-2 space-y-3"><div className="flex justify-between text-sm"><span className="text-ink-muted">Subtotal</span><span>{money(subtotal)}</span></div><label className="block text-sm text-ink">Discount<input type="number" min="0" step="0.01" value={discount} onChange={(e) => setDiscount(e.target.value)} placeholder="0.00" className="field mt-1 w-full" /></label><div className="flex justify-between text-lg font-semibold text-ink"><span>Total</span><span>{money(total)}</span></div><label className="block text-sm text-ink">Payment method<select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as SalePaymentMethod)} className="field mt-1 w-full"><option value="cash">Cash</option><option value="mpesa">M-Pesa</option><option value="card">Card</option></select></label><label className="block text-sm text-ink">Amount paid<input type="number" min="0" step="0.01" value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)} placeholder={total.toFixed(2)} className="field mt-1 w-full" /></label>{paymentMethod !== 'cash' && <label className="block text-sm text-ink">Payment reference<input value={paymentReference} onChange={(e) => setPaymentReference(e.target.value)} placeholder="Transaction reference" className="field mt-1 w-full" /></label>}<div className="flex justify-between text-sm"><span className="text-ink-muted">Change</span><strong>{money(change)}</strong></div><button type="button" onClick={() => void submit()} disabled={saving || !cart.length || paid < total} className="w-full rounded-md bg-ink px-4 py-3 text-sm font-medium text-paper disabled:opacity-50">{saving ? 'Completing sale…' : 'Complete sale'}</button></div></aside></div></div></div>
}
