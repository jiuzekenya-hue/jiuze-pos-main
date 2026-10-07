import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { useAuth } from '../contexts/auth-context'

import { getBusiness, type Business } from '../services/businessService'

import { listCategories } from '../services/categoryService'

import { type SalePaymentMethod } from '../services/saleService'

import { listProducts } from '../services/productService'

import { directPrint } from '../services/printerService'

import { completeRestaurantOrder, listOpenRestaurantOrders, listRestaurantLocationStatus, saveRestaurantOrder, type RestaurantOpenOrder, type RestaurantLocation } from '../services/restaurantOrderService'

import type { Category, Product } from '../types/products'

type CartLine = { product: Product; quantity: number }

const money = (value: number) => 'KES ' + value.toFixed(2)

const tables = Array.from({ length: 12 }, (_, index) => index + 1)

const locationKey = (location: RestaurantLocation) => location.type === 'takeaway' ? 'takeaway' : 'table-' + location.tableNumber

const selectedLocation = (value: number | 'takeaway'): RestaurantLocation => value === 'takeaway' ? { type: 'takeaway', tableNumber: null } : { type: 'table', tableNumber: value }

const toRestaurantLocation = (locationType: RestaurantOpenOrder['locationType'], tableNumber: RestaurantOpenOrder['tableNumber']): RestaurantLocation =>

  locationType === 'takeaway' ? { type: 'takeaway', tableNumber: null } : { type: 'table', tableNumber: tableNumber as number }

const statusLocation = (locationType: RestaurantOpenOrder['locationType'], tableNumber: RestaurantOpenOrder['tableNumber']): RestaurantLocation =>

  locationType === 'takeaway' ? { type: 'takeaway', tableNumber: null } : { type: 'table', tableNumber: tableNumber as number }

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

  const [savingOrder, setSavingOrder] = useState(false)

  const [message, setMessage] = useState('')

  const [error, setError] = useState('')

  const [locationStatuses, setLocationStatuses] = useState<Array<{ locationType: 'table' | 'takeaway'; tableNumber: number | null; occupied: boolean; canManage: boolean; orderNumber: string | null }>>([])

  const [orderNumber, setOrderNumber] = useState<string | null>(null)

  const selectedTableRef = useRef<number | 'takeaway'>(1)

  const orderIdsRef = useRef<Record<string, string>>({})

  const saveQueuesRef = useRef<Record<string, Promise<unknown>>>({})

  const activeProfileKeyRef = useRef<string | null>(null)

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

  const selectedLocationStatus = locationStatuses.find((status) =>
    locationKey(statusLocation(status.locationType, status.tableNumber)) === locationKey(selectedLocation(selectedTable))
  )

  const selectedLocationBlocked = Boolean(selectedLocationStatus?.occupied && !selectedLocationStatus.canManage)

  const hydrateOrder = useCallback((order: RestaurantOpenOrder | undefined, productRows: Product[]) => {

    if (!order) return { cart: [] as CartLine[], discount: '', id: null as string | null, number: null as string | null }

    return {

      cart: order.items.flatMap((item) => {

        const product = productRows.find((row) => row.id === item.productId)

        return product ? [{ product, quantity: item.quantity }] : []

      }),

      discount: order.discount ? String(order.discount) : '',

      id: order.id,

      number: order.orderNumber,

    }

  }, [])

  const applyOpenOrders = useCallback((orders: RestaurantOpenOrder[], productRows: Product[], selected: number | 'takeaway') => {

    orderIdsRef.current = {}

    orders.forEach((order) => {

      orderIdsRef.current[locationKey(toRestaurantLocation(order.locationType, order.tableNumber))] = order.id

    })

    const target = orders.find((order) => locationKey(toRestaurantLocation(order.locationType, order.tableNumber)) === locationKey(selectedLocation(selected)))

    const hydrated = hydrateOrder(target, productRows)

    setOrderNumber(hydrated.number)

    setCart(hydrated.cart)

    setDiscount(hydrated.discount)

  }, [hydrateOrder])

  const load = useCallback(async () => {

    if (!profile?.businessId) return

    setLoading(true)

    setError('')

    try {

      const [businessData, productRows, categoryRows, orders, statuses] = await Promise.all([

        getBusiness(profile.businessId),

        listProducts(profile.businessId),

        listCategories(profile.businessId),

        listOpenRestaurantOrders(),

        listRestaurantLocationStatus(),

      ])

      setBusiness(businessData)

      setProducts(productRows)

      setCategories(categoryRows)

      setLocationStatuses(statuses)

      const preferred = selectedTableRef.current

      const preferredStatus = statuses.find((status) =>

        locationKey(statusLocation(status.locationType, status.tableNumber)) === locationKey(selectedLocation(preferred))

      )

      const firstUsable = statuses.find((status) => !status.occupied || status.canManage)

      const nextSelected = preferredStatus && (!preferredStatus.occupied || preferredStatus.canManage)

        ? preferred

        : firstUsable

          ? (firstUsable.locationType === 'takeaway' ? 'takeaway' : firstUsable.tableNumber as number)

          : preferred

      selectedTableRef.current = nextSelected

      setSelectedTable(nextSelected)

      applyOpenOrders(orders, productRows, nextSelected)

    } catch (err) {

      setError(err instanceof Error ? err.message : 'Unable to load restaurant POS.')

    } finally {

      setLoading(false)

    }

  }, [applyOpenOrders, profile?.businessId])

  useEffect(() => {
    const profileKey = profile?.id && profile.businessId ? profile.id + ':' + profile.businessId : null
    if (!profileKey || activeProfileKeyRef.current === profileKey) return

    activeProfileKeyRef.current = profileKey
    selectedTableRef.current = 1
    orderIdsRef.current = {}
    saveQueuesRef.current = {}
    setSelectedTable(1)
    setCart([])
    setDiscount('')
    setOrderNumber(null)
    setPaymentAmount('')
    setPaymentReference('')
    setMessage('')
    setError('')
    void load()
  }, [load, profile?.id, profile?.businessId])

  const persistOrder = useCallback((location: RestaurantLocation, items: CartLine[], nextDiscount: number) => {

    const key = locationKey(location)

    if (!items.length && !orderIdsRef.current[key]) return Promise.resolve(null)

    const previous = saveQueuesRef.current[key] || Promise.resolve()

    const next = previous.catch(() => undefined).then(async () => {

      setSavingOrder(true)

      try {

        const saved = await saveRestaurantOrder({

          orderId: orderIdsRef.current[key] || null,

          location,

          items: items.map((line) => ({ productId: line.product.id, quantity: line.quantity })),

          discount: nextDiscount,

        })

        if (saved.orderId && saved.orderNumber) {

          const savedOrderId = saved.orderId

          const savedOrderNumber = saved.orderNumber

          orderIdsRef.current[key] = savedOrderId

          if (locationKey(selectedLocation(selectedTableRef.current)) === key) {

            setOrderNumber(savedOrderNumber)

          }

        } else {

          delete orderIdsRef.current[key]

          if (locationKey(selectedLocation(selectedTableRef.current)) === key) {

            setOrderNumber(null)

          }

        }

        return saved

      } finally {

        setSavingOrder(false)

      }

    })

    saveQueuesRef.current[key] = next.catch(() => undefined)

    return next

  }, [profile?.id])

  const selectLocation = async (nextTable: number | 'takeaway') => {

    if (nextTable === selectedTableRef.current) return

    const currentLocation = selectedLocation(selectedTableRef.current)

    setError('')

    setMessage('')

    try {

      const currentKey = locationKey(currentLocation)
      const currentOrderId = orderIdsRef.current[currentKey]

      // Only persist an existing order or a genuinely new cart. If the
      // current order is stale from another account, do not send its ID
      // back to Supabase and let the database correctly reject ownership.
      if (currentOrderId || (cart.length > 0 && !orderNumber)) {
        await persistOrder(currentLocation, cart, discountValue)
      }

      const [orders, statuses] = await Promise.all([

        listOpenRestaurantOrders(),

        listRestaurantLocationStatus(),

      ])

      const targetStatus = statuses.find((status) =>

        locationKey(statusLocation(status.locationType, status.tableNumber)) === locationKey(selectedLocation(nextTable))

      )

      if (targetStatus?.occupied && !targetStatus.canManage) {

        setLocationStatuses(statuses)

        setError(nextTable === 'takeaway' ? 'Takeaway is occupied by another cashier.' : 'Table ' + nextTable + ' is occupied by another cashier.')

        return

      }

      orders.forEach((order) => {

        orderIdsRef.current[locationKey(toRestaurantLocation(order.locationType, order.tableNumber))] = order.id

      })

      setLocationStatuses(statuses)

      const target = orders.find((order) => locationKey(toRestaurantLocation(order.locationType, order.tableNumber)) === locationKey(selectedLocation(nextTable)))

      selectedTableRef.current = nextTable

      setSelectedTable(nextTable)


      const hydrated = hydrateOrder(target, products)

      setOrderNumber(hydrated.number)

      setCart(hydrated.cart)

      setDiscount(hydrated.discount)

      setPaymentAmount('')

      setPaymentReference('')

    } catch (err) {

      setError(err instanceof Error ? err.message : 'Unable to switch location.')

    }

  }

  const addProduct = (product: Product) => {

    setMessage('')

    setError('')

    if (selectedLocationBlocked) {

      setError(selectedTable === 'takeaway' ? 'Takeaway is occupied by another cashier.' : 'Table ' + selectedTable + ' is occupied by another cashier.')

      return

    }

    const existing = cart.find((line) => line.product.id === product.id)

    const nextCart = existing

      ? existing.quantity >= product.stockQuantity

        ? cart

        : cart.map((line) => line.product.id === product.id ? { ...line, quantity: line.quantity + 1 } : line)

      : [...cart, { product, quantity: 1 }]

    setCart(nextCart)

    void persistOrder(selectedLocation(selectedTableRef.current), nextCart, discountValue).catch(() => undefined)

  }

  const changeQuantity = (productId: string, delta: number) => {

    const nextCart = cart.flatMap((line) => {

      if (line.product.id !== productId) return [line]

      const next = Math.min(line.product.stockQuantity, line.quantity + delta)

      return next <= 0 ? [] : [{ ...line, quantity: next }]

    })

    setCart(nextCart)

    void persistOrder(selectedLocation(selectedTableRef.current), nextCart, discountValue).catch(() => undefined)

  }

  const removeItem = (productId: string) => {

    const nextCart = cart.filter((item) => item.product.id !== productId)

    setCart(nextCart)

    void persistOrder(selectedLocation(selectedTableRef.current), nextCart, discountValue).catch(() => undefined)

  }

  const printOrder = async () => {

    if (!cart.length) {

      setError('Add items to the order first.')

      return

    }

    setError('')

    try {

      await persistOrder(selectedLocation(selectedTableRef.current), cart, discountValue)

      setMessage('Order saved. Printing order…')

      const printed = await directPrint({

        businessName: business?.name || 'Restaurant',

        serviceType: 'restaurant',

        location: selectedTable === 'takeaway' ? 'Takeaway' : 'Table ' + selectedTable,

        title: 'ORDER SLIP',

        status: 'unpaid',

        cashier: profile?.fullName?.trim() || 'Unknown cashier',

        items: cart.map((line) => ({ name: line.product.name, quantity: line.quantity, unitPrice: line.product.sellingPrice, lineTotal: line.product.sellingPrice * line.quantity })),

        subtotal,

        discount: discountValue,

        total,

      })

      setMessage(printed ? 'Order printed · ' + (selectedTable === 'takeaway' ? 'Takeaway' : 'Table ' + selectedTable) + (orderNumber ? ' · ' + orderNumber : '') : 'Order saved, but the Print Bridge is unavailable.')

    } catch (err) {

      setError(err instanceof Error ? 'Unable to save order: ' + err.message : 'Unable to save order.')

    }

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

    const location = selectedLocation(selectedTableRef.current)

    try {

      const savedOrder = await persistOrder(location, soldItems, discountValue)

      const savedOrderId = savedOrder?.orderId || orderIdsRef.current[locationKey(location)]

      if (!savedOrderId) throw new Error('Restaurant order could not be saved before payment.')

      const result = await completeRestaurantOrder({

        orderId: savedOrderId,

        paymentMethod,

        paymentAmount: paid,

        paymentReference,

      })

      const printed = await directPrint({

        businessName: business?.name || 'Restaurant',

        serviceType: 'restaurant',

        location: location.type === 'takeaway' ? 'Takeaway' : 'Table ' + location.tableNumber,

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

      delete orderIdsRef.current[locationKey(location)]

      setOpenOrders((current) => current.filter((order) => locationKey(toRestaurantLocation(order.locationType, order.tableNumber)) !== locationKey(location)))

      setMessage((location.type === 'takeaway' ? 'Takeaway' : 'Table ' + location.tableNumber) + ' paid · ' + result.receiptNumber + (printed ? '' : ' · receipt ready for browser printing'))

      setCart([])

      setOrderNumber(null)

      setPaymentAmount('')

      setPaymentReference('')

      setDiscount('')

      await load()

    } catch (err) {

      const message = err instanceof Error ? err.message : 'Unable to complete sale.'
      setError('Unable to complete sale: ' + message)

    } finally {

      setSaving(false)

    }

  }

  const clearOrder = () => {

    const location = selectedLocation(selectedTableRef.current)

    const existingId = orderIdsRef.current[locationKey(location)]

    // If this is stale UI state without a current user's order ID,
    // clear locally only. Never attempt to delete another user's order.
    setCart([])

    setDiscount('')

    setOrderNumber(null)

    if (!existingId) return

    void persistOrder(location, [], 0)

      .then(() => {

        delete orderIdsRef.current[locationKey(location)]


      })

      .catch((err) => setError(err instanceof Error ? err.message : 'Unable to clear order.'))

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

            {(() => {

              const status = locationStatuses.find((item) => item.locationType === 'takeaway' && item.tableNumber === null)

              const label = status?.occupied ? (status.canManage ? 'My order' : 'Occupied') : 'Available'

              return <button type="button" onClick={() => void selectLocation('takeaway')} className={'mb-1 w-full rounded-lg px-3 py-3 text-left text-sm font-semibold ' + (selectedTable === 'takeaway' ? 'bg-slate-800 text-white' : status?.occupied && !status.canManage ? 'bg-slate-200 text-slate-500' : status?.occupied ? 'bg-amber-50 text-amber-800 ring-1 ring-amber-200' : 'hover:bg-slate-100')}>Takeaway <span className="float-right text-[10px] font-normal">{label}</span></button>

            })()}

            <div className="grid grid-cols-2 gap-1">

              {tables.map((table) => {

                const status = locationStatuses.find((item) => item.locationType === 'table' && item.tableNumber === table)

                const isOpen = Boolean(status?.occupied)

                const label = status?.occupied ? (status.canManage ? 'My order' : 'Occupied') : 'Available'

                return <button key={table} type="button" onClick={() => void selectLocation(table)} className={'rounded-lg px-2 py-3 text-sm font-semibold ' + (selectedTable === table ? 'bg-market-600 text-white' : status?.occupied && !status.canManage ? 'bg-slate-200 text-slate-500' : isOpen ? 'bg-amber-50 text-amber-800 ring-1 ring-amber-200' : 'bg-slate-100 text-slate-700 hover:bg-slate-200')}><span className="block">Table {table}</span><span className="block text-[9px] font-normal opacity-80">{label}</span></button>

              })}

            </div>

          </aside>

          <section className="min-w-0 rounded-xl border border-slate-300 bg-white shadow-sm overflow-hidden">

            <div className="border-b border-slate-300 p-3">

              <div className="flex gap-2 overflow-x-auto pb-2">

                {departments.map((item) => <button key={item} type="button" onClick={() => setDepartment(item)} className={'shrink-0 rounded-md border px-4 py-2 text-xs font-semibold ' + (department === item ? 'border-market-600 bg-market-600 text-white' : 'border-slate-300 bg-slate-50 text-slate-700')}>{item}</button>)}

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

              <div>

                <p className="text-[10px] uppercase tracking-wider text-slate-500">Current order</p>

                <h2 className="font-display text-lg font-semibold">{selectedTable === 'takeaway' ? 'Takeaway' : 'Table ' + selectedTable}</h2>

                {orderNumber && <p className="text-[10px] font-mono text-slate-400">{orderNumber}</p>}

              </div>

              <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-semibold text-slate-500">{cart.length} items</span>

            </div>

            <div className="max-h-[32vh] overflow-y-auto">

              {cart.length === 0 ? <div className="py-12 text-center text-sm text-slate-500">No items added</div> : cart.map((line) => <div key={line.product.id} className="border-b border-slate-200 px-4 py-3">

                <div className="flex items-start justify-between gap-3"><p className="text-sm font-semibold">{line.product.name}</p><button type="button" onClick={() => removeItem(line.product.id)} className="text-slate-400"><Icon name="close"/></button></div>

                <div className="mt-2 flex items-center justify-between"><div className="flex items-center rounded-md border border-slate-300"><button type="button" onClick={() => changeQuantity(line.product.id, -1)} className="h-8 w-8 flex items-center justify-center"><Icon name="minus"/></button><span className="w-9 text-center text-sm font-semibold">{line.quantity}</span><button type="button" onClick={() => changeQuantity(line.product.id, 1)} className="h-8 w-8 flex items-center justify-center"><Icon name="plus"/></button></div><span className="font-mono text-sm font-semibold">{money(line.product.sellingPrice * line.quantity)}</span></div>

              </div>)}

            </div>

            <div className="border-t border-slate-300 p-4 space-y-3">

              <div className="flex justify-between text-sm"><span className="text-slate-500">Subtotal</span><b>{money(subtotal)}</b></div>

              <div className="flex items-center justify-between gap-3"><label className="text-sm text-slate-500">Discount</label><input type="number" min="0" step="0.01" value={discount} onChange={(e) => setDiscount(e.target.value)} className="h-9 w-28 rounded border border-slate-300 px-2 text-right text-sm"/></div>

              <div className="flex justify-between border-t border-slate-200 pt-3"><span className="font-semibold">TOTAL</span><span className="font-mono text-xl font-bold">{money(total)}</span></div>

              <div className="grid grid-cols-3 gap-1.5">{(['cash','mpesa','card'] as SalePaymentMethod[]).map((method) => <button key={method} type="button" onClick={() => setPaymentMethod(method)} className={'rounded-md border py-2 text-xs font-semibold capitalize ' + (paymentMethod === method ? 'border-slate-800 bg-slate-800 text-white' : 'border-slate-300')}>{method === 'mpesa' ? 'M-Pesa' : method}</button>)}</div>

              <input type="number" min="0" step="0.01" value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)} placeholder="Amount paid" className="field w-full"/>

              {paymentMethod !== 'cash' && <input value={paymentReference} onChange={(e) => setPaymentReference(e.target.value)} placeholder="Payment reference" className="field w-full"/>}

              {paymentMethod === 'cash' && <div className="flex justify-between rounded bg-slate-100 px-3 py-2 text-sm"><span className="text-slate-500">Change</span><b>{money(change)}</b></div>}

              <button type="button" onClick={() => void printOrder()} disabled={saving || savingOrder || selectedLocationBlocked || !cart.length} className="w-full rounded-lg border border-slate-300 bg-white py-2.5 text-sm font-semibold text-slate-700 disabled:opacity-40">{savingOrder ? 'Saving order…' : 'Print order'}</button>

              <button type="button" onClick={() => void takePayment()} disabled={saving || savingOrder || selectedLocationBlocked || !cart.length} className="w-full rounded-lg bg-market-600 py-3.5 text-sm font-bold text-white disabled:opacity-50">{saving ? 'Processing…' : 'PAY ' + money(total)}</button>

              <button type="button" onClick={clearOrder} disabled={!cart.length || savingOrder || saving || selectedLocationBlocked} className="w-full rounded-lg border border-slate-300 py-2.5 text-xs font-semibold text-slate-600 disabled:opacity-40">Clear order</button>

            </div>

          </aside>

        </div>

      </div>

    </main>

  )

}
