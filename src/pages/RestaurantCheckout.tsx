import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../contexts/auth-context'
import { getBusiness, type Business } from '../services/businessService'
import { listCategories } from '../services/categoryService'
import { listProducts } from '../services/productService'
import { browserPrint } from '../services/printerService'
import {
  listOpenRestaurantOrders,
  listLockedRestaurantOrderIds,
  listRecentRestaurantOrders,
  listRestaurantLocationStatus,
  recordRestaurantOrderPrint,
  reserveRestaurantOrderPrint,
  saveRestaurantOrder,
  type RestaurantOpenOrder,
  type RestaurantRecentOrder,
  type RestaurantLocation,
} from '../services/restaurantOrderService'
import type { Category, Product } from '../types/products'

type CartLine = {
  product: Product
  quantity: number
}

const money = (value: number) => 'KES ' + value.toFixed(2)

// Food and Snack categories route to Kitchen; every other category routes to Bar.
const serviceSectionFor = (product: Product, categories: Category[]) => {
  const categoryName = categories.find((category) => category.id === product.categoryId)?.name.trim().toLowerCase()
  return ['food', 'foods', 'snack', 'snacks'].includes(categoryName || '')
    ? 'Kitchen'
    : 'Bar'
}

const tables = Array.from({ length: 12 }, (_, index) => index + 1)

const locationKey = (location: RestaurantLocation) =>
  location.type === 'takeaway' ? 'takeaway' : 'table-' + location.tableNumber

const selectedLocation = (
  value: number | 'takeaway',
): RestaurantLocation =>
  value === 'takeaway'
    ? { type: 'takeaway', tableNumber: null }
    : { type: 'table', tableNumber: value }

const toRestaurantLocation = (
  locationType: RestaurantOpenOrder['locationType'],
  tableNumber: RestaurantOpenOrder['tableNumber'],
): RestaurantLocation =>
  locationType === 'takeaway'
    ? { type: 'takeaway', tableNumber: null }
    : { type: 'table', tableNumber: tableNumber as number }

const statusLocation = (
  locationType: RestaurantOpenOrder['locationType'],
  tableNumber: RestaurantOpenOrder['tableNumber'],
): RestaurantLocation =>
  locationType === 'takeaway'
    ? { type: 'takeaway', tableNumber: null }
    : { type: 'table', tableNumber: tableNumber as number }

function Icon({
  name,
}: {
  name: 'search' | 'plus' | 'minus' | 'close'
}) {
  if (name === 'search')
    return (
      <svg
        viewBox="0 0 24 24"
        className="h-5 w-5"
        aria-hidden="true"
      >
        <circle
          cx="11"
          cy="11"
          r="6.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
        />
        <path
          d="m16 16 4 4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      </svg>
    )

  if (name === 'plus')
    return (
      <svg
        viewBox="0 0 24 24"
        className="h-4 w-4"
        aria-hidden="true"
      >
        <path
          d="M12 5v14M5 12h14"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    )

  if (name === 'minus')
    return (
      <svg
        viewBox="0 0 24 24"
        className="h-4 w-4"
        aria-hidden="true"
      >
        <path
          d="M5 12h14"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    )

  return (
    <svg
      viewBox="0 0 24 24"
      className="h-5 w-5"
      aria-hidden="true"
    >
      <path
        d="m6 6 12 12M18 6 6 18"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  )
}

export default function RestaurantCheckout() {
  const { profile } = useAuth()

  const [business, setBusiness] = useState<Business | null>(null)
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [selectedTable, setSelectedTable] =
    useState<number | 'takeaway'>(1)
  const [department, setDepartment] = useState('All')
  const [serviceSection, setServiceSection] = useState<'Kitchen' | 'Bar'>('Kitchen')
  const [search, setSearch] = useState('')
  const [cart, setCart] = useState<CartLine[]>([])
  const [discount, setDiscount] = useState('')
  const [loading, setLoading] = useState(true)
  const [savingOrder, setSavingOrder] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [openOrders, setOpenOrders] = useState<RestaurantOpenOrder[]>([])
  const [lockedOrderIds, setLockedOrderIds] = useState<Set<string>>(new Set())
  const [recentOrders, setRecentOrders] = useState<RestaurantRecentOrder[]>([])
  const [showOpenOrders, setShowOpenOrders] = useState(false)
  const [showRecentOrders, setShowRecentOrders] = useState(false)

  const [locationStatuses, setLocationStatuses] = useState<
    Array<{
      locationType: 'table' | 'takeaway'
      tableNumber: number | null
      occupied: boolean
      canManage: boolean
      orderNumber: string | null
    }>
  >([])

  const [orderNumber, setOrderNumber] = useState<string | null>(null)

  const selectedTableRef = useRef<number | 'takeaway'>(1)

  const orderIdsRef = useRef<Record<string, string>>({})

  const saveQueuesRef = useRef<Record<string, Promise<unknown>>>({})

  const activeProfileKeyRef = useRef<string | null>(null)

  const departments = useMemo(
    () => ['All', ...categories.map((category) => category.name)],
    [categories],
  )

  const visibleProducts = useMemo(() => {
    const query = search.trim().toLowerCase()

    return products.filter(
      (product) =>
        product.isActive &&
        product.stockQuantity > 0 &&
        serviceSectionFor(product, categories) === serviceSection &&
        (department === 'All' ||
          categories.find(
            (category) => category.id === product.categoryId,
          )?.name === department) &&
        (!query ||
          product.name.toLowerCase().includes(query) ||
          product.sku.toLowerCase().includes(query)),
    )
  }, [products, categories, department, search, serviceSection])

  const subtotal = useMemo(
    () =>
      cart.reduce(
        (sum, line) =>
          sum + line.product.sellingPrice * line.quantity,
        0,
      ),
    [cart],
  )

  const discountValue = Math.max(0, Number(discount) || 0)

  const total = Math.max(0, subtotal - discountValue)

  // Tables are shared by the restaurant team. Occupancy does not block
  // another cashier; each cashier sees and manages only their own order.

  const hydrateOrder = useCallback(
    (
      order: RestaurantOpenOrder | undefined,
      productRows: Product[],
    ) => {
      if (!order) {
        return {
          cart: [] as CartLine[],
          discount: '',
          id: null as string | null,
          number: null as string | null,
        }
      }

      return {
        cart: order.items.flatMap((item) => {
          const product = productRows.find(
            (row) => row.id === item.productId,
          )

          return product
            ? [{ product, quantity: item.quantity }]
            : []
        }),
        discount: order.discount ? String(order.discount) : '',
        id: order.id,
        number: order.orderNumber,
      }
    },
    [],
  )

  const applyOpenOrders = useCallback(
    (
      orders: RestaurantOpenOrder[],
      productRows: Product[],
      selected: number | 'takeaway',
    ) => {
      orderIdsRef.current = {}

      // Only map orders owned by the signed-in cashier (owners can manage
      // any order). Never let another cashier's order ID become the save target.
      const canManageAll = profile?.role === 'owner'
      const editableOrders = orders

      editableOrders.forEach((order) => {
        if (!canManageAll && order.createdBy !== profile?.id) return

        const key = locationKey(
          toRestaurantLocation(order.locationType, order.tableNumber),
        )
        if (!orderIdsRef.current[key]) orderIdsRef.current[key] = order.id
      })

      const target =
        selected === 'takeaway'
          ? editableOrders.find(
              (order) =>
                order.locationType === 'takeaway' &&
                (canManageAll || order.createdBy === profile?.id),
            )
          : editableOrders.find(
              (order) =>
                locationKey(
                  toRestaurantLocation(order.locationType, order.tableNumber),
                ) === locationKey(selectedLocation(selected)) &&
                (canManageAll || order.createdBy === profile?.id),
            )

      const hydrated = hydrateOrder(target, productRows)

      setOrderNumber(hydrated.number)
      setCart(hydrated.cart)
      setDiscount(hydrated.discount)
    },
    [hydrateOrder, lockedOrderIds, profile?.id],
  )

  const load = useCallback(async () => {
    if (!profile?.businessId) return

    setLoading(true)
    setError('')

    try {
      const [
        businessData,
        productRows,
        categoryRows,
        orders,
        statuses,
        lockedOrderIds,
      ] = await Promise.all([
        getBusiness(profile.businessId),
        listProducts(profile.businessId),
        listCategories(profile.businessId),
        listOpenRestaurantOrders(),
        listRestaurantLocationStatus(),
        listLockedRestaurantOrderIds(),
      ])

      setBusiness(businessData)
      setProducts(productRows)
      setCategories(categoryRows)
      setLocationStatuses(statuses)
      setOpenOrders(orders)
      setLockedOrderIds(lockedOrderIds)

      const preferred = selectedTableRef.current

      const preferredStatus = statuses.find(
        (status) =>
          locationKey(
            statusLocation(
              status.locationType,
              status.tableNumber,
            ),
          ) === locationKey(selectedLocation(preferred)),
      )

      const firstUsable = statuses.find(
        (status) => !status.occupied || status.canManage,
      )

      const nextSelected =
        preferredStatus &&
        (!preferredStatus.occupied || preferredStatus.canManage)
          ? preferred
          : firstUsable
            ? firstUsable.locationType === 'takeaway'
              ? 'takeaway'
              : (firstUsable.tableNumber as number)
            : preferred

      selectedTableRef.current = nextSelected
      setSelectedTable(nextSelected)

      applyOpenOrders(orders, productRows, nextSelected)
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to load restaurant POS.',
      )
    } finally {
      setLoading(false)
    }
  }, [applyOpenOrders, profile?.businessId])

  useEffect(() => {
    const profileKey =
      profile?.id && profile.businessId
        ? profile.id + ':' + profile.businessId
        : null

    if (
      !profileKey ||
      activeProfileKeyRef.current === profileKey
    )
      return

    activeProfileKeyRef.current = profileKey
    selectedTableRef.current = 1
    orderIdsRef.current = {}
    saveQueuesRef.current = {}

    setSelectedTable(1)
    setCart([])
    setDiscount('')
    setOrderNumber(null)
    setMessage('')
    setError('')

    void load()
  }, [load, profile?.id, profile?.businessId])

  const persistOrder = useCallback(
    (
      location: RestaurantLocation,
      items: CartLine[],
      nextDiscount: number,
    ) => {
      const key = locationKey(location)
      if (!items.length && !orderIdsRef.current[key]) {
        return Promise.resolve(null)
      }

      const previous =
        saveQueuesRef.current[key] || Promise.resolve()

      const next = previous
        .catch(() => undefined)
        .then(async () => {
          setSavingOrder(true)

          try {
            const saved = await saveRestaurantOrder({
              orderId: orderIdsRef.current[key] || null,
              location,
              items: items.map((line) => ({
                productId: line.product.id,
                quantity: line.quantity,
              })),
              discount: nextDiscount,
            })

                  if (saved.orderId && saved.orderNumber) {
              const savedOrderId = saved.orderId
              const savedOrderNumber = saved.orderNumber

              orderIdsRef.current[key] = savedOrderId

              if (location.type !== 'takeaway') {
                setLocationStatuses((current) =>
                  current.map((status) =>
                    locationKey(
                      statusLocation(
                        status.locationType,
                        status.tableNumber,
                      ),
                    ) === key
                      ? {
                          ...status,
                          occupied: true,
                          canManage: true,
                          orderNumber: savedOrderNumber,
                        }
                      : status,
                  ),
                )
              }

              if (
                locationKey(
                  selectedLocation(
                    selectedTableRef.current,
                  ),
                ) === key
              ) {
                setOrderNumber(savedOrderNumber)
              }
            } else {
              delete orderIdsRef.current[key]

              if (location.type !== 'takeaway') {
                setLocationStatuses((current) =>
                  current.map((status) =>
                    locationKey(
                      statusLocation(
                        status.locationType,
                        status.tableNumber,
                      ),
                    ) === key
                      ? {
                          ...status,
                          occupied: false,
                          canManage: false,
                          orderNumber: null,
                        }
                      : status,
                  ),
                )
              }

              if (
                locationKey(
                  selectedLocation(
                    selectedTableRef.current,
                  ),
                ) === key
              ) {
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
    },
    [profile?.id, lockedOrderIds],
  )

  const refreshOpenOrders = useCallback(async () => {
    try {
      const [orders, lockedIds, statuses] = await Promise.all([
        listOpenRestaurantOrders(),
        listLockedRestaurantOrderIds(),
        listRestaurantLocationStatus(),
      ])
      setOpenOrders(orders)
      setLockedOrderIds(lockedIds)
      setLocationStatuses(statuses)

      // If the selected table's order was paid elsewhere, clear the stale
      // cart/order reference so the cashier cannot continue editing it.
      const selectedKey = locationKey(
        selectedLocation(selectedTableRef.current),
      )
      const selectedOrderId = orderIdsRef.current[selectedKey]
      if (
        selectedOrderId &&
        !orders.some((order) => order.id === selectedOrderId)
      ) {
        delete orderIdsRef.current[selectedKey]
        setOrderNumber(null)
        setCart([])
        setDiscount('')
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to load open orders.',
      )
    }
  }, [])

  // Keep the Open Orders panel current when the owner pays an order on
  // another device. Poll only while the panel is visible.
  useEffect(() => {
    if (!showOpenOrders) return

    void refreshOpenOrders()
    const intervalId = window.setInterval(() => {
      void refreshOpenOrders()
    }, 5000)

    return () => window.clearInterval(intervalId)
  }, [showOpenOrders, refreshOpenOrders])

  const refreshRecentOrders = useCallback(async () => {
    try {
      const orders = await listRecentRestaurantOrders(30)
      setRecentOrders(orders)
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to load recent orders.',
      )
    }
  }, [])

  const selectOpenOrder = async (orderId: string) => {
    setError('')
    setMessage('')

    try {
      const currentLocation = selectedLocation(
        selectedTableRef.current,
      )
      // Only persist when there are items to save. An empty local cart can be
      // stale while switching between open bills; saving it against the current
      // order would delete that bill before the selected order is loaded.
      if (cart.length > 0) {
        await persistOrder(
          currentLocation,
          cart,
          discountValue,
        )
      }

      const orders = await listOpenRestaurantOrders()
      const target = orders.find((order) => order.id === orderId)

      if (!target) {
        throw new Error('That open order is no longer available.')
      }
      if (profile?.role !== 'owner' && target.createdBy !== profile?.id) {
        throw new Error('You can only open your own restaurant orders.')
      }

      const targetLocation = toRestaurantLocation(
        target.locationType,
        target.tableNumber,
      )
      const targetKey = locationKey(targetLocation)

      orderIdsRef.current[targetKey] = target.id

      const hydrated = hydrateOrder(target, products)

      selectedTableRef.current =
        target.locationType === 'takeaway'
          ? 'takeaway'
          : (target.tableNumber as number)

      setSelectedTable(selectedTableRef.current)
      setOrderNumber(hydrated.number)
      setCart(hydrated.cart)
      setDiscount(hydrated.discount)
      setOpenOrders(orders)
      setShowOpenOrders(false)
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to open order.',
      )
    }
  }

  const startNewTakeaway = async () => {
    setError('')
    setMessage('')

    try {
      const currentLocation = selectedLocation(
        selectedTableRef.current,
      )
      const currentKey = locationKey(currentLocation)
      const currentOrderId = orderIdsRef.current[currentKey]

      if (currentOrderId || (cart.length > 0 && !orderNumber)) {
        await persistOrder(
          currentLocation,
          cart,
          discountValue,
        )
      }

      selectedTableRef.current = 'takeaway'
      setSelectedTable('takeaway')
      delete orderIdsRef.current['takeaway']
      setOrderNumber(null)
      setCart([])
      setDiscount('')
      setMessage('New takeaway order ready.')
      setShowOpenOrders(false)
      await refreshOpenOrders()
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to start a new takeaway order.',
      )
    }
  }

  const selectLocation = async (
    nextTable: number | 'takeaway',
  ) => {
    if (nextTable === selectedTableRef.current) return

    const currentLocation = selectedLocation(
      selectedTableRef.current,
    )

    setError('')
    setMessage('')

    try {
      const currentKey = locationKey(currentLocation)
      const currentOrderId =
        orderIdsRef.current[currentKey]

      // Only persist an existing order or a genuinely new cart.
      // If the current order is stale from another account,
      // do not send its ID back to Supabase and let the
      // database correctly reject ownership.
      // Existing orders can be updated while checkout is stabilizing.
      if (currentOrderId) {
        await persistOrder(currentLocation, cart, discountValue)
      } else if (!currentOrderId && cart.length > 0 && !orderNumber) {
        await persistOrder(currentLocation, cart, discountValue)
      }

      const [orders, statuses, refreshedLockedIds] = await Promise.all([
        listOpenRestaurantOrders(),
        listRestaurantLocationStatus(),
        listLockedRestaurantOrderIds(),
      ])
      setLockedOrderIds(refreshedLockedIds)

      orderIdsRef.current = {}
      const editableOrders = orders
      const canManageAll = profile?.role === 'owner'
      editableOrders.forEach((order) => {
        if (!canManageAll && order.createdBy !== profile?.id) return

        const key = locationKey(
          toRestaurantLocation(order.locationType, order.tableNumber),
        )
        if (!orderIdsRef.current[key]) orderIdsRef.current[key] = order.id
      })

      setLocationStatuses(statuses)

      const target =
        nextTable === 'takeaway'
          ? editableOrders.find(
              (order) =>
                order.locationType === 'takeaway' &&
                (canManageAll || order.createdBy === profile?.id),
            )
          : editableOrders.find(
              (order) =>
                locationKey(
                  toRestaurantLocation(order.locationType, order.tableNumber),
                ) === locationKey(selectedLocation(nextTable)) &&
                (canManageAll || order.createdBy === profile?.id),
            )

      selectedTableRef.current = nextTable
      setSelectedTable(nextTable)

      const hydrated = hydrateOrder(target, products)

      setOrderNumber(hydrated.number)
      setCart(hydrated.cart)
      setDiscount(hydrated.discount)
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to switch location.',
      )
    }
  }

  const addProduct = (product: Product) => {
    setMessage('')
    setError('')

    const existing = cart.find(
      (line) => line.product.id === product.id,
    )

    const nextCart = existing
      ? existing.quantity >= product.stockQuantity
        ? cart
        : cart.map((line) =>
            line.product.id === product.id
              ? {
                  ...line,
                  quantity: line.quantity + 1,
                }
              : line,
          )
      : [...cart, { product, quantity: 1 }]

    setCart(nextCart)

    void persistOrder(
      selectedLocation(selectedTableRef.current),
      nextCart,
      discountValue,
    ).catch(() => undefined)
  }

  const changeQuantity = (
    productId: string,
    delta: number,
  ) => {
    const nextCart = cart.flatMap((line) => {
      if (line.product.id !== productId) return [line]

      const next = Math.min(
        line.product.stockQuantity,
        line.quantity + delta,
      )

      return next <= 0
        ? []
        : [{ ...line, quantity: next }]
    })

    setCart(nextCart)

    void persistOrder(
      selectedLocation(selectedTableRef.current),
      nextCart,
      discountValue,
    ).catch(() => undefined)
  }

  const removeItem = (productId: string) => {
    const nextCart = cart.filter(
      (item) => item.product.id !== productId,
    )

    setCart(nextCart)

    void persistOrder(
      selectedLocation(selectedTableRef.current),
      nextCart,
      discountValue,
    ).catch(() => undefined)
  }

  const printOrder = async () => {
    if (!cart.length) {
      setError('Add items to the order first.')
      return
    }

    setError('')

    try {
      const savedOrder = await persistOrder(
        selectedLocation(selectedTableRef.current),
        cart,
        discountValue,
      )

      const printOrderId =
        savedOrder?.orderId ||
        orderIdsRef.current[
          locationKey(selectedLocation(selectedTableRef.current))
        ]

      if (!printOrderId) {
        throw new Error('Order could not be identified for print audit.')
      }
      await reserveRestaurantOrderPrint(printOrderId)

      setLockedOrderIds((current) => {
        const next = new Set(current)
        next.add(printOrderId)
        return next
      })

      setMessage('Order locked. Printing order…')

      const sections = (['Kitchen', 'Bar'] as const).flatMap((section) => {
        const sectionItems = cart.filter(
          (line) => serviceSectionFor(line.product, categories) === section,
        )
        if (!sectionItems.length) return []
        const sectionSubtotal = sectionItems.reduce(
          (sum, line) => sum + line.product.sellingPrice * line.quantity,
          0,
        )
        return [{ section, items: sectionItems, subtotal: sectionSubtotal }]
      })

      let printedCount = 0
      for (const section of sections) {
        const printed = await browserPrint({
          businessName: business?.name || 'Restaurant',
          serviceType: 'restaurant',
          location:
            (selectedTable === 'takeaway' ? 'Takeaway' : 'Table ' + selectedTable) +
            ' · ' + section.section,
          title: 'ORDER SLIP',
          status: 'unpaid',
          cashier: profile?.fullName?.trim() || 'Unknown cashier',
          items: section.items.map((line) => ({
            name: line.product.name,
            quantity: line.quantity,
            unitPrice: line.product.sellingPrice,
            lineTotal: line.product.sellingPrice * line.quantity,
          })),
          subtotal: section.subtotal,
          // The discount applies to the full bill, so do not duplicate it on department tickets.
          discount: 0,
          total: section.subtotal,
        })
        if (!printed) break
        printedCount += 1
      }

      if (printedCount > 0) {
        await recordRestaurantOrderPrint(printOrderId, 'order_slip')
        setLockedOrderIds((current) => {
          const next = new Set(current)
          next.add(printOrderId)
          return next
        })
      }

      setMessage(
        printedCount === sections.length && printedCount > 0
          ? sections.map((section) => section.section).join(' and ') +
            ' tickets printed · ' +
            (selectedTable === 'takeaway' ? 'Takeaway' : 'Table ' + selectedTable) +
            (orderNumber ? ' · ' + orderNumber : '')
          : printedCount > 0
            ? 'Some department tickets printed. Check the print dialog before retrying.'
            : 'Order saved, but printing did not complete.',
      )
    } catch (err) {
      const details =
        err instanceof Error
          ? err.message
          : typeof err === 'object' && err !== null && 'message' in err
            ? String((err as { message?: unknown }).message || '')
            : String(err || '')

      console.error('[RestaurantCheckout] Unable to save order', err)
      setError(
        details
          ? 'Unable to save order: ' + details
          : 'Unable to save order. Check the browser console for the database error.',
      )
    }
  }


  return (
    <main className="min-h-screen bg-[#eef0f5] text-ink px-3 py-3 sm:px-5 lg:px-7">
      <div className="mx-auto max-w-[1600px]">
        <header className="mb-3 flex items-center justify-between rounded-xl border border-slate-300 bg-white px-4 py-3 shadow-sm">
          <div>
            <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">
              Restaurant POS
            </p>

            <h1 className="font-display text-xl font-semibold">
              {business?.name || 'Bar & Restaurant'}
            </h1>
          </div>

          <div className="text-right text-xs text-slate-500">
            <p className="font-medium text-slate-700">
              {profile?.fullName || 'Cashier'}
            </p>

            <p>Table service</p>
          </div>
          <button
            type="button"
            onClick={() => {
              setShowOpenOrders(true)
              void refreshOpenOrders()
            }}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Open Orders
          </button>
          <button
            type="button"
            onClick={() => {
              setShowRecentOrders(true)
              void refreshRecentOrders()
            }}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Recent Orders
          </button>
        </header>

        {error && (
          <div
            role="alert"
            className="mb-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          >
            {error}
          </div>
        )}

        {message && (
          <div
            role="status"
            className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700"
          >
            {message}
          </div>
        )}

        {showRecentOrders && (
          <div
            className="fixed inset-0 z-50 flex items-start justify-center bg-slate-950/40 p-4 sm:p-8"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) {
                setShowRecentOrders(false)
              }
            }}
          >
            <section className="w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl">
              <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                    Restaurant POS
                  </p>
                  <h2 className="font-display text-xl font-semibold text-slate-900">
                    Recent Orders
                  </h2>
                  <p className="mt-1 text-xs text-slate-500">
                    See who opened each order and who processed the payment.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setShowRecentOrders(false)}
                  className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
                  aria-label="Close recent orders"
                >
                  <Icon name="close" />
                </button>
              </div>

              <div className="max-h-[65vh] overflow-y-auto p-4">
                {recentOrders.length === 0 ? (
                  <div className="py-16 text-center">
                    <p className="text-sm font-semibold text-slate-700">
                      No recent orders
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {recentOrders.map((order) => {
                      const orderLocation =
                        order.locationType === 'takeaway'
                          ? 'Takeaway'
                          : 'Table ' + order.tableNumber

                      return (
                        <div
                          key={order.id}
                          className="rounded-xl border border-slate-200 bg-white p-4"
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-bold text-slate-900">
                                  {orderLocation}
                                </span>
                                <span
                                  className={
                                    'rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ' +
                                    (order.status === 'paid'
                                      ? 'bg-emerald-100 text-emerald-700'
                                      : order.status === 'cancelled'
                                        ? 'bg-red-100 text-red-700'
                                        : 'bg-amber-100 text-amber-700')
                                  }
                                >
                                  {order.status}
                                </span>
                              </div>

                              <p className="mt-1 font-mono text-[11px] text-slate-500">
                                {order.orderNumber}
                              </p>

                              <div className="mt-2 space-y-0.5 text-[10px] text-slate-500">
                                <p>
                                  Cashier: <span className="font-semibold text-slate-700">{order.createdByName}</span>
                                </p>
{order.status === 'paid' && (
  <>
    {order.isReconciled && (
      <p className="font-semibold text-amber-700">
        Historical reconciliation —{' '}
        {(order.reconciliationPaymentMethod || 'unknown').toUpperCase() === 'MPESA'
          ? 'M-Pesa'
          : order.reconciliationPaymentMethod || 'Unknown method'}
      </p>
    )}
    <p>
      Paid by:{' '}
      <span className="font-semibold text-slate-700">
        {order.isReconciled
          ? 'Not recorded'
          : order.paidByName || 'Unknown user'}
      </span>
    </p>
    <p>
      Payment time:{' '}
      <span className="font-semibold text-slate-700">
        {order.isReconciled
          ? 'Not recorded'
          : order.paidAt
            ? new Date(order.paidAt).toLocaleString()
            : 'Not recorded'}
      </span>
    </p>
  </>
)}

                                {order.orderSlipPrintCount > 0 && (
                                  <p>
                                    Order slip printed: <span className="font-semibold text-slate-700">{order.orderSlipPrintCount}×</span>
                                    {order.lastOrderSlipPrintedByName
                                      ? ' · Last by ' + order.lastOrderSlipPrintedByName
                                      : ''}
                                  </p>
                                )}
                                {order.salesReceiptPrintCount > 0 && (
                                  <p>
                                    Sales receipt printed: <span className="font-semibold text-slate-700">{order.salesReceiptPrintCount}×</span>
                                  </p>
                                )}
                              </div>
                            </div>

                            <div className="text-right">
                              <p className="font-mono text-sm font-bold text-slate-900">
                                {money(order.total)}
                              </p>
                              {order.paidAt && (
                                <p className="mt-1 text-[10px] text-slate-500">
                                  {new Date(order.paidAt).toLocaleString()}
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </section>
          </div>
        )}

        {showOpenOrders && (
          <div
            className="fixed inset-0 z-50 flex items-start justify-center bg-slate-950/40 p-4 sm:p-8"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) {
                setShowOpenOrders(false)
              }
            }}
          >
            <section className="w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl">
              <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                    Restaurant POS
                  </p>
                  <h2 className="font-display text-xl font-semibold text-slate-900">
                    Open Orders
                  </h2>
                  <p className="mt-1 text-xs text-slate-500">
                    Select an unpaid order to continue.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setShowOpenOrders(false)}
                  className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
                  aria-label="Close open orders"
                >
                  <Icon name="close" />
                </button>
              </div>

              <div className="max-h-[65vh] overflow-y-auto p-4">
                {openOrders.length === 0 ? (
                  <div className="py-16 text-center">
                    <p className="text-sm font-semibold text-slate-700">
                      No open orders
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      Start a table or takeaway order to see it here.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {openOrders.map((order) => {
                      const orderTotal = Math.max(
                        0,
                        order.items.reduce(
                          (sum, item) => sum + item.subtotal,
                          0,
                        ) - order.discount,
                      )
                      const orderLocation =
                        order.locationType === 'takeaway'
                          ? 'Takeaway'
                          : 'Table ' + order.tableNumber
                      const isCurrent =
                        order.id ===
                        orderIdsRef.current[
                          locationKey(
                            toRestaurantLocation(
                              order.locationType,
                              order.tableNumber,
                            ),
                          )
                        ]

                      return (
                        <button
                          key={order.id}
                          type="button"
                          onClick={() => void selectOpenOrder(order.id)}
                          className={
                            'w-full rounded-xl border p-4 text-left transition-colors ' +
                            (isCurrent
                              ? 'border-market-500 bg-market-50'
                              : 'border-slate-200 bg-white hover:border-slate-400 hover:bg-slate-50')
                          }
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-bold text-slate-900">
                                  {orderLocation}
                                </span>
                                {isCurrent && (
                                  <span className="rounded-full bg-market-100 px-2 py-0.5 text-[9px] font-bold uppercase text-market-700">
                                    Current
                                  </span>
                                )}
                              </div>
                              <p className="mt-1 font-mono text-[11px] text-slate-500">
                                {order.orderNumber}
                              </p>
                              <p className="mt-1 text-[10px] font-medium text-slate-500">
                                Cashier: {order.createdByName}
                              </p>
                            </div>

                            <div className="text-right">
                              <p className="font-mono text-sm font-bold text-slate-900">
                                {money(orderTotal)}
                              </p>
                              <p className="mt-1 text-[10px] text-slate-500">
                                {order.items.length} item{order.items.length === 1 ? '' : 's'}
                              </p>
                            </div>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>

              <div className="border-t border-slate-200 bg-slate-50 p-4">
                <button
                  type="button"
                  onClick={() => void startNewTakeaway()}
                  className="w-full rounded-lg bg-market-600 py-3 text-sm font-bold text-white hover:bg-market-700"
                >
                  + New Takeaway Order
                </button>
              </div>
            </section>
          </div>
        )}

        <div className="grid gap-3 xl:grid-cols-[190px_minmax(0,1fr)_390px]">
          <aside className="rounded-xl border border-slate-300 bg-white p-2 shadow-sm">
            <p className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              Locations
            </p>

            <button
              type="button"
              onClick={() => void selectLocation('takeaway')}
              className={
                'mb-1 w-full rounded-lg px-3 py-3 text-left text-sm font-semibold ' +
                (selectedTable === 'takeaway'
                  ? 'bg-slate-800 text-white'
                  : 'hover:bg-slate-100')
              }
            >
              Takeaway
              <span className="float-right text-[10px] font-normal">
                Available
              </span>
            </button>

            <div className="grid grid-cols-3 gap-1 sm:grid-cols-4 xl:grid-cols-2">
              {tables.map((table) => {
                const status = locationStatuses.find(
                  (item) =>
                    item.locationType === 'table' &&
                    item.tableNumber === table,
                )

                const isOpen = Boolean(status?.occupied)

                const label = status?.occupied
                  ? 'Occupied'
                  : 'Available'

                return (
                  <button
                    key={table}
                    type="button"
                    onClick={() =>
                      void selectLocation(table)
                    }
                    className={
                      'rounded-lg px-2 py-3 text-sm font-semibold ' +
                      (selectedTable === table
                        ? 'bg-market-600 text-white'
                        : isOpen
                            ? 'bg-amber-50 text-amber-800 ring-1 ring-amber-200'
                            : 'bg-slate-100 text-slate-700 hover:bg-slate-200')
                    }
                  >
                    <span className="block">
                      Table {table}
                    </span>

                    <span className="block text-[9px] font-normal opacity-80">
                      {label}
                    </span>
                  </button>
                )
              })}
            </div>
          </aside>

          <section className="min-w-0 rounded-xl border border-slate-300 bg-white shadow-sm overflow-hidden">
            <div className="border-b border-slate-300 p-3">
              <div className="mb-3 grid grid-cols-2 gap-2">
                {(['Kitchen', 'Bar'] as const).map((section) => (
                  <button
                    key={section}
                    type="button"
                    onClick={() => {
                      setServiceSection(section)
                      setDepartment('All')
                    }}
                    className={
                      'rounded-lg border px-4 py-3 text-sm font-bold ' +
                      (serviceSection === section
                        ? section === 'Kitchen'
                          ? 'border-emerald-700 bg-emerald-700 text-white'
                          : 'border-amber-700 bg-amber-700 text-white'
                        : 'border-slate-300 bg-slate-50 text-slate-700')
                    }
                  >
                    {section}
                  </button>
                ))}
              </div>
              <p className="mb-2 text-[10px] text-slate-500">
                {serviceSection === 'Kitchen'
                  ? 'Food and Snack categories only'
                  : 'All other product categories'}
              </p>
              <div className="flex gap-2 overflow-x-auto pb-2">
                {departments.map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setDepartment(item)}
                    className={
                      'shrink-0 rounded-md border px-4 py-2 text-xs font-semibold ' +
                      (department === item
                        ? 'border-market-600 bg-market-600 text-white'
                        : 'border-slate-300 bg-slate-50 text-slate-700')
                    }
                  >
                    {item}
                  </button>
                ))}
              </div>

              <label className="relative block">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                  <Icon name="search" />
                </span>

                <input
                  value={search}
                  onChange={(e) =>
                    setSearch(e.target.value)
                  }
                  placeholder="Search item..."
                  className="h-11 w-full rounded-lg border border-slate-300 bg-slate-50 pl-10 pr-3 text-sm outline-none focus:border-market-500"
                />
              </label>
            </div>

            <div className="max-h-[calc(100vh-190px)] overflow-y-auto p-3">
              {loading ? (
                <div className="py-20 text-center text-sm text-slate-500">
                  Loading products…
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                  {visibleProducts.map((product) => (
                    <button
                      key={product.id}
                      type="button"
                      onClick={() => addProduct(product)}
                      className="min-h-24 rounded-lg border border-slate-300 bg-gradient-to-b from-white to-slate-50 p-3 text-left hover:border-market-500 hover:shadow-sm"
                    >
                      <span className="block text-[10px] uppercase tracking-wide text-slate-400">
                        {product.unitType}
                      </span>

                      <span className="mt-2 block line-clamp-2 text-sm font-semibold text-slate-800">
                        {product.name}
                      </span>

                      <span className="mt-2 block font-mono text-sm font-bold text-slate-900">
                        {money(product.sellingPrice)}
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {!loading &&
                visibleProducts.length === 0 && (
                  <div className="py-16 text-center text-sm text-slate-500">
                    No items found in this department.
                  </div>
                )}
            </div>
          </section>

          <aside className="rounded-xl border border-slate-300 bg-white shadow-sm overflow-hidden">
            <div className="border-b border-slate-300 bg-slate-50 px-4 py-3 flex items-center justify-between">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-slate-500">
                  Current order
                </p>

                <h2 className="font-display text-lg font-semibold">
                  {selectedTable === 'takeaway'
                    ? 'Takeaway'
                    : 'Table ' + selectedTable}
                </h2>

                {orderNumber && (
                  <p className="text-[10px] font-mono text-slate-400">
                    {orderNumber}
                  </p>
                )}
                {(() => {
                  const currentOrder = openOrders.find(
                    (order) => order.id === orderIdsRef.current[
                      locationKey(selectedLocation(selectedTable))
                    ],
                  )
                  return currentOrder ? (
                    <p className="text-[10px] font-medium text-slate-500">
                      Cashier: {currentOrder.createdByName}
                    </p>
                  ) : null
                })()}
              </div>

              <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-semibold text-slate-500">
                {cart.length} items
              </span>
            </div>

            <div className="max-h-[32vh] overflow-y-auto">
              {cart.length === 0 ? (
                <div className="py-12 text-center text-sm text-slate-500">
                  No items added
                </div>
              ) : (
                cart.map((line) => (
                  <div
                    key={line.product.id}
                    className="border-b border-slate-200 px-4 py-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm font-semibold">
                        {line.product.name}
                      </p>

                      <button
                        type="button"
                        onClick={() =>
                          removeItem(line.product.id)
                        }
                        className="text-slate-400"
                      >
                        <Icon name="close" />
                      </button>
                    </div>

                    <div className="mt-2 flex items-center justify-between">
                      <div className="flex items-center rounded-md border border-slate-300">
                        <button
                          type="button"
                          onClick={() =>
                            changeQuantity(
                              line.product.id,
                              -1,
                            )
                          }
                          className="h-8 w-8 flex items-center justify-center"
                        >
                          <Icon name="minus" />
                        </button>

                        <span className="w-9 text-center text-sm font-semibold">
                          {line.quantity}
                        </span>

                        <button
                          type="button"
                          onClick={() =>
                            changeQuantity(
                              line.product.id,
                              1,
                            )
                          }
                          className="h-8 w-8 flex items-center justify-center"
                        >
                          <Icon name="plus" />
                        </button>
                      </div>

                      <span className="font-mono text-sm font-semibold">
                        {money(
                          line.product.sellingPrice *
                            line.quantity,
                        )}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="border-t border-slate-300 p-4 space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">
                  Subtotal
                </span>

                <b>{money(subtotal)}</b>
              </div>

              <div className="flex items-center justify-between gap-3">
                <label className="text-sm text-slate-500">
                  Discount
                </label>

                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={discount}
                  onChange={(e) =>
                    setDiscount(e.target.value)
                  }
                  className="h-9 w-28 rounded border border-slate-300 px-2 text-right text-sm"
                />
              </div>

              <div className="flex justify-between border-t border-slate-200 pt-3">
                <span className="font-semibold">
                  TOTAL
                </span>

                <span className="font-mono text-xl font-bold">
                  {money(total)}
                </span>
              </div>

              <button
                type="button"
                onClick={() => void printOrder()}
                disabled={
                  savingOrder ||
                  !cart.length
                }
                className="w-full rounded-lg border border-slate-300 bg-white py-2.5 text-sm font-semibold text-slate-700 disabled:opacity-40"
              >
                {savingOrder
                  ? 'Saving order…'
                  : 'Print Kitchen & Bar tickets'}
              </button>
            </div>
          </aside>
        </div>
      </div>
    </main>
  )
}