import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/auth-context'
import { listCategories } from '../services/categoryService'
import { adjustStock } from '../services/inventoryService'
import { activateProduct, createProduct, deactivateProduct, listProducts, updateProduct } from '../services/productService'
import { isFractionalUnit, PRODUCT_UNITS, type Category, type Product, type ProductUnitType } from '../types/products'

const emptyForm = {
  categoryId: '',
  name: '',
  sku: '',
  barcode: '',
  costPrice: '',
  sellingPrice: '',
  stockQuantity: '',
  minimumStock: '',
  unitType: 'piece' as ProductUnitType,
}

type FormState = typeof emptyForm
type MovementType = 'purchase' | 'adjustment' | 'return' | 'damage'

const quantityStep = (unit: ProductUnitType) => isFractionalUnit(unit) ? '0.001' : '1'

const quantityMinimum = (unit: ProductUnitType) =>
  isFractionalUnit(unit) ? '0.001' : '1'

const formatQuantity = (value: number) =>
  Number.isInteger(value)
    ? String(value)
    : value.toFixed(3).replace(/0+$/, '').replace(/\.$/, '')

const money = (value: number) =>
  `KES ${value.toLocaleString('en-KE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`

function Icon({
  name,
}: {
  name:
    | 'search'
    | 'plus'
    | 'box'
    | 'alert'
    | 'tag'
    | 'more'
    | 'edit'
    | 'stock'
    | 'close'
}) {
  const common = {
    width: 17,
    height: 17,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  }

  if (name === 'search') {
    return (
      <svg {...common}>
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-4-4" />
      </svg>
    )
  }

  if (name === 'plus') {
    return (
      <svg {...common}>
        <path d="M12 5v14M5 12h14" />
      </svg>
    )
  }

  if (name === 'box') {
    return (
      <svg {...common}>
        <path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z" />
        <path d="m4.5 7.5 7.5 4 7.5-4M12 11.5V21" />
      </svg>
    )
  }

  if (name === 'alert') {
    return (
      <svg {...common}>
        <path d="M10.3 4.4 3.2 17a2 2 0 0 0 1.7 3h14.2a2 2 0 0 0 1.7-3L13.7 4.4a2 2 0 0 0-3.4 0Z" />
        <path d="M12 9v4M12 17h.01" />
      </svg>
    )
  }

  if (name === 'tag') {
    return (
      <svg {...common}>
        <path d="M20 13 13 20l-9-9V4h7l9 9Z" />
        <path d="M8 8h.01" />
      </svg>
    )
  }

  if (name === 'more') {
    return (
      <svg {...common}>
        <circle cx="5" cy="12" r="1" fill="currentColor" />
        <circle cx="12" cy="12" r="1" fill="currentColor" />
        <circle cx="19" cy="12" r="1" fill="currentColor" />
      </svg>
    )
  }

  if (name === 'edit') {
    return (
      <svg {...common}>
        <path d="m4 16.5-.7 3.2 3.2-.7L18.8 6.7a2.1 2.1 0 0 0-3-3L4 16.5Z" />
        <path d="m14.5 5.5 3 3" />
      </svg>
    )
  }

  if (name === 'stock') {
    return (
      <svg {...common}>
        <path d="M4 7h16M4 12h16M4 17h10" />
        <path d="M18 15v5M15.5 17.5H20.5" />
      </svg>
    )
  }

  return (
    <svg {...common}>
      <path d="m6 6 12 12M18 6 6 18" />
    </svg>
  )
}

export default function Products() {
  const { profile, role } = useAuth()
  const isOwner = role === 'owner'

  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [form, setForm] = useState<FormState>(emptyForm)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [adjustingProduct, setAdjustingProduct] = useState<Product | null>(null)
  const [movementType, setMovementType] = useState<MovementType>('purchase')
  const [adjustmentQuantity, setAdjustmentQuantity] = useState('')
  const [adjustmentReason, setAdjustmentReason] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [adjusting, setAdjusting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [menuProductId, setMenuProductId] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!profile?.businessId) return

    setLoading(true)
    setError(null)

    try {
      const [productRows, categoryRows] = await Promise.all([
        listProducts(profile.businessId),
        listCategories(profile.businessId),
      ])

      setProducts(productRows)
      setCategories(categoryRows)

      if (!form.categoryId && categoryRows[0]) {
        setForm((current) => ({
          ...current,
          categoryId: categoryRows[0].id,
        }))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load products.')
    } finally {
      setLoading(false)
    }
  }, [profile?.businessId])

  useEffect(() => {
    void load()
  }, [load])

  const reset = () => {
    setForm(emptyForm)
    setEditingId(null)
    setDrawerOpen(false)
  }

  const closeAdjustment = () => {
    setAdjustingProduct(null)
    setMovementType('purchase')
    setAdjustmentQuantity('')
    setAdjustmentReason('')
  }

  const setField = (key: keyof FormState, value: string) => {
    setForm((current) => ({
      ...current,
      [key]: value,
    }))
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()

    if (!profile?.businessId || !isOwner) return

    setSaving(true)
    setError(null)

    try {
      const input = {
        categoryId: form.categoryId,
        name: form.name,
        sku: form.sku,
        barcode: form.barcode || null,
        costPrice: Number(form.costPrice),
        sellingPrice: Number(form.sellingPrice),
        stockQuantity: Number(form.stockQuantity),
        minimumStock: Number(form.minimumStock),
        unitType: form.unitType,
      }

      if (editingId) {
        const updated = await updateProduct(editingId, input)

        setProducts((current) =>
          current.map((item) =>
            item.id === updated.id ? updated : item,
          ),
        )
      } else {
        const created = await createProduct({
          businessId: profile.businessId,
          ...input,
        })

        setProducts((current) =>
          [...current, created].sort((a, b) =>
            a.name.localeCompare(b.name),
          ),
        )
      }

      reset()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save product.')
    } finally {
      setSaving(false)
    }
  }

  const openAdd = () => {
    setForm({
      ...emptyForm,
      categoryId: categories[0]?.id ?? '',
    })

    setEditingId(null)
    setError(null)
    setDrawerOpen(true)
  }

  const edit = (product: Product) => {
    setEditingId(product.id)

    setForm({
      categoryId: product.categoryId,
      name: product.name,
      sku: product.sku,
      barcode: product.barcode ?? '',
      costPrice: String(product.costPrice),
      sellingPrice: String(product.sellingPrice),
      stockQuantity: String(product.stockQuantity),
      minimumStock: String(product.minimumStock),
      unitType: product.unitType,
    })

    setMenuProductId(null)
    setError(null)
    setDrawerOpen(true)
  }

  const deactivate = async (product: Product) => {
    setMenuProductId(null)

    if (!isOwner || !window.confirm(`Deactivate “${product.name}”?`)) {
      return
    }

    setError(null)

    try {
      const updated = await deactivateProduct(product.id)

      setProducts((current) =>
        current.map((item) =>
          item.id === updated.id ? updated : item,
        ),
      )
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to deactivate product.',
      )
    }
  }

  const activate = async (product: Product) => {
    setMenuProductId(null)

    if (!isOwner || !window.confirm(`Activate “${product.name}”?`)) {
      return
    }

    setError(null)

    try {
      const updated = await activateProduct(product.id)

      setProducts((current) =>
        current.map((item) =>
          item.id === updated.id ? updated : item,
        ),
      )
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to activate product.',
      )
    }
  }

  const openAdjustment = (product: Product) => {
    setMenuProductId(null)
    setAdjustingProduct(product)
  }

  const submitAdjustment = async (event: React.FormEvent) => {
    event.preventDefault()

    if (!adjustingProduct || !isOwner) return

    setAdjusting(true)
    setError(null)

    try {
      const raw = Number(adjustmentQuantity)
      const delta =
        movementType === 'damage'
          ? -Math.abs(raw)
          : raw

      const updated = await adjustStock(
        adjustingProduct.id,
        delta,
        movementType,
        adjustmentReason,
      )

      setProducts((current) =>
        current.map((item) =>
          item.id === updated.id ? updated : item,
        ),
      )

      closeAdjustment()
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to adjust stock.',
      )
    } finally {
      setAdjusting(false)
    }
  }

  const filteredProducts = useMemo(
    () =>
      products.filter((product) => {
        const query = search.trim().toLowerCase()

        const matchesSearch =
          !query ||
          product.name.toLowerCase().includes(query) ||
          product.sku.toLowerCase().includes(query) ||
          (product.barcode ?? '').toLowerCase().includes(query)

        const matchesCategory =
          categoryFilter === 'all' ||
          product.categoryId === categoryFilter

        return matchesSearch && matchesCategory
      }),
    [products, search, categoryFilter],
  )

  const lowStockCount = products.filter(
    (product) =>
      product.isActive &&
      product.stockQuantity <= product.minimumStock,
  ).length

  const inventoryValue = products.reduce(
    (sum, product) =>
      sum + product.sellingPrice * product.stockQuantity,
    0,
  )

  const formFractional = isFractionalUnit(form.unitType)

  return (
    <div className="min-h-screen bg-paper px-5 py-6 sm:px-6 sm:py-8">
      <div className="max-w-6xl mx-auto">
        <header className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between mb-7">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-market-600">
              Catalogue
            </p>

            <h1 className="font-display font-semibold text-3xl sm:text-4xl tracking-tight text-ink mt-2">
              Products
            </h1>

            <p className="text-sm text-ink-muted mt-2">
              Manage your catalogue, prices, units and stock levels.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Link
              to="/"
              className="hidden sm:inline-flex rounded-lg border border-line bg-paper-raised px-4 py-2.5 text-sm font-medium text-ink transition-colors hover:bg-paper"
            >
              Dashboard
            </Link>

            {isOwner && (
              <button
                type="button"
                onClick={openAdd}
                disabled={categories.length === 0}
                className="inline-flex items-center gap-2 rounded-lg bg-ink px-4 py-2.5 text-sm font-medium text-paper transition-transform hover:-translate-y-px disabled:opacity-50 disabled:hover:translate-y-0"
              >
                <Icon name="plus" />
                Add product
              </button>
            )}
          </div>
        </header>

        <section className="bg-paper-raised border border-line rounded-xl p-4 mb-5">
          <div className="flex flex-col gap-3 lg:flex-row">
            <label className="relative flex-1">
              <span className="sr-only">
                Search products
              </span>

              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-muted">
                <Icon name="search" />
              </span>

              <input
                value={search}
                onChange={(event) =>
                  setSearch(event.target.value)
                }
                className="field w-full pl-10"
                placeholder="Search by name, SKU or barcode..."
              />
            </label>

            <select
              value={categoryFilter}
              onChange={(event) =>
                setCategoryFilter(event.target.value)
              }
              aria-label="Filter by category"
              className="field lg:w-52"
            >
              <option value="all">
                All categories
              </option>

              {categories.map((category) => (
                <option
                  key={category.id}
                  value={category.id}
                >
                  {category.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2 overflow-x-auto pt-3 pb-1">
            <button
              type="button"
              onClick={() => setCategoryFilter('all')}
              className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors ${
                categoryFilter === 'all'
                  ? 'bg-ink text-paper'
                  : 'bg-paper border border-line text-ink-muted hover:text-ink'
              }`}
            >
              All
            </button>

            {categories.slice(0, 6).map(
              (category, index) => (
                <button
                  type="button"
                  key={category.id}
                  onClick={() =>
                    setCategoryFilter(category.id)
                  }
                  className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors ${
                    categoryFilter === category.id
                      ? 'bg-market-100 text-market-700'
                      : index % 3 === 0
                        ? 'bg-market-50 text-market-700'
                        : 'bg-paper text-ink-muted border border-line hover:text-ink'
                  }`}
                >
                  {category.name}
                </button>
              ),
            )}
          </div>
        </section>

        {error && (
          <div
            role="alert"
            className="mb-5 rounded-xl border border-brick-200 bg-brick-50 px-4 py-3 text-sm text-brick-700"
          >
            {error}
          </div>
        )}

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 mb-6">
          {[
            {
              label: 'Total products',
              value: products.length,
              detail: 'Catalogue items',
              icon: 'box' as const,
            },
            {
              label: 'Low stock',
              value: lowStockCount,
              detail: lowStockCount
                ? 'Need attention'
                : 'All levels healthy',
              icon: 'alert' as const,
              alert: lowStockCount > 0,
            },
            {
              label: 'Inventory value',
              value: money(inventoryValue),
              detail: 'At selling price',
              icon: 'stock' as const,
            },
            {
              label: 'Categories',
              value: categories.length,
              detail: 'Product groups',
              icon: 'tag' as const,
            },
          ].map((stat) => (
            <div
              key={stat.label}
              className="bg-paper-raised border border-line rounded-xl p-4 flex items-start gap-3 shadow-[0_1px_2px_rgba(20,30,25,0.03)]"
            >
              <span
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                  stat.alert
                    ? 'bg-brick-50 text-brick-600'
                    : 'bg-market-50 text-market-700'
                }`}
              >
                <Icon name={stat.icon} />
              </span>

              <div className="min-w-0">
                <p className="text-[11px] font-medium uppercase tracking-wide text-ink-muted">
                  {stat.label}
                </p>

                <p className="font-display font-semibold text-xl tracking-tight text-ink mt-1 truncate">
                  {stat.value}
                </p>

                <p
                  className={`text-xs mt-0.5 ${
                    stat.alert
                      ? 'text-brick-600'
                      : 'text-ink-muted'
                  }`}
                >
                  {stat.detail}
                </p>
              </div>
            </div>
          ))}
        </section>

        <section>
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="font-display font-semibold text-lg text-ink">
                Your products
              </h2>

              <p className="text-xs text-ink-muted mt-1">
                Showing {filteredProducts.length} of{' '}
                {products.length}
              </p>
            </div>
          </div>

          {loading ? (
            <div className="bg-paper-raised border border-line rounded-xl px-5 py-14 text-center text-sm text-ink-muted">
              Loading products…
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="bg-paper-raised border border-line rounded-xl px-5 py-14 text-center">
              <p className="text-sm font-medium text-ink">
                {products.length === 0
                  ? 'No products yet.'
                  : 'No products match your search.'}
              </p>

              <p className="text-xs text-ink-muted mt-1">
                {products.length === 0 && isOwner
                  ? 'Add your first product to start building the catalogue.'
                  : 'Try a different search or category.'}
              </p>

              {products.length === 0 &&
                isOwner &&
                categories.length > 0 && (
                  <button
                    type="button"
                    onClick={openAdd}
                    className="mt-4 rounded-lg bg-ink px-4 py-2 text-sm font-medium text-paper"
                  >
                    Add product
                  </button>
                )}
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {filteredProducts.map((product) => {
                const category =
                  categories.find(
                    (item) =>
                      item.id === product.categoryId,
                  )?.name ?? 'Uncategorized'

                const lowStock =
                  product.isActive &&
                  product.stockQuantity <=
                    product.minimumStock

                return (
                  <article
                    key={product.id}
                    className="relative bg-paper-raised border border-line rounded-xl overflow-visible shadow-[0_1px_2px_rgba(20,30,25,0.03)] transition-shadow hover:shadow-[0_5px_18px_rgba(20,30,25,0.06)]"
                  >
                    <div className="p-5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h3 className="font-display font-semibold text-lg text-ink truncate">
                            {product.name}
                          </h3>

                          <p className="font-mono text-xs text-ink-muted mt-1 truncate">
                            SKU: {product.sku}
                          </p>
                        </div>

                        <span
                          className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium ${
                            product.isActive
                              ? 'bg-market-50 text-market-700'
                              : 'bg-paper text-ink-muted border border-line'
                          }`}
                        >
                          {product.isActive
                            ? 'Active'
                            : 'Inactive'}
                        </span>
                      </div>

                      <div className="mt-3">
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-market-50 px-2.5 py-1 text-[11px] font-medium text-market-700">
                          <Icon name="tag" />
                          {category}
                        </span>
                      </div>

                      <p className="font-display font-semibold text-xl text-ink mt-5">
                        {money(product.sellingPrice)}{' '}
                        <span className="text-sm font-normal text-ink-muted">
                          / {product.unitType}
                        </span>
                      </p>

                      <div className="flex items-center justify-between mt-4">
                        <span
                          className={`inline-flex items-center gap-1.5 text-sm font-medium ${
                            lowStock
                              ? 'text-brick-600'
                              : 'text-market-700'
                          }`}
                        >
                          <Icon
                            name={
                              lowStock
                                ? 'alert'
                                : 'box'
                            }
                          />

                          {formatQuantity(
                            product.stockQuantity,
                          )}{' '}
                          {product.unitType} in stock
                        </span>

                        {lowStock && (
                          <span className="text-[11px] text-brick-600">
                            Min{' '}
                            {formatQuantity(
                              product.minimumStock,
                            )}
                          </span>
                        )}
                      </div>
                    </div>

                    {isOwner && (
                      <div className="grid grid-cols-[1fr_1.45fr_48px] border-t border-line">
                        <button
                          type="button"
                          onClick={() => edit(product)}
                          className="inline-flex items-center justify-center gap-1.5 px-3 py-3 text-xs font-medium text-ink-muted hover:text-ink hover:bg-paper transition-colors"
                        >
                          <Icon name="edit" />
                          Edit
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            openAdjustment(product)
                          }
                          className="inline-flex items-center justify-center gap-1.5 border-x border-line px-3 py-3 text-xs font-medium text-ink-muted hover:text-ink hover:bg-paper transition-colors"
                        >
                          <Icon name="stock" />
                          Adjust stock
                        </button>

                        <div className="relative">
                          <button
                            type="button"
                            aria-label={`More actions for ${product.name}`}
                            onClick={() =>
                              setMenuProductId(
                                menuProductId ===
                                  product.id
                                  ? null
                                  : product.id,
                              )
                            }
                            className="flex h-full w-full items-center justify-center text-ink-muted hover:text-ink hover:bg-paper transition-colors"
                          >
                            <Icon name="more" />
                          </button>

                          {menuProductId === product.id && (
                            <div className="absolute right-2 bottom-12 z-20 w-36 rounded-lg border border-line bg-paper-raised p-1 shadow-lg">
                              {product.isActive ? (
                                <button
                                  type="button"
                                  onClick={() =>
                                    void deactivate(product)
                                  }
                                  className="w-full rounded-md px-3 py-2 text-left text-xs text-brick-600 hover:bg-brick-50"
                                >
                                  Deactivate
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() =>
                                    void activate(product)
                                  }
                                  className="w-full rounded-md px-3 py-2 text-left text-xs text-market-700 hover:bg-market-50"
                                >
                                  Activate
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </article>
                )
              })}
            </div>
          )}
        </section>

        {drawerOpen && isOwner && (
          <div
            className="fixed inset-0 z-50 flex justify-end bg-black/30"
            role="presentation"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) {
                reset()
              }
            }}
          >
            <aside
              role="dialog"
              aria-modal="true"
              aria-labelledby="product-drawer-title"
              className="h-full w-full max-w-lg overflow-y-auto bg-paper-raised border-l border-line shadow-2xl"
            >
              <form
                onSubmit={submit}
                className="flex min-h-full flex-col"
              >
                <div className="flex items-start justify-between gap-4 border-b border-line px-6 py-5">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-[0.14em] text-market-600">
                      Catalogue
                    </p>

                    <h2
                      id="product-drawer-title"
                      className="font-display font-semibold text-2xl text-ink mt-1"
                    >
                      {editingId
                        ? 'Edit product'
                        : 'Add product'}
                    </h2>

                    <p className="text-sm text-ink-muted mt-1">
                      {editingId
                        ? 'Update the details for this product.'
                        : 'Add a product to your store catalogue.'}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={reset}
                    aria-label="Close"
                    className="rounded-lg p-2 text-ink-muted hover:bg-paper hover:text-ink"
                  >
                    <Icon name="close" />
                  </button>
                </div>

                <div className="flex-1 space-y-5 px-6 py-6">
                  <label className="block text-sm font-medium text-ink">
                    Product name
                    <span className="text-brick-600">
                      {' '}
                      *
                    </span>

                    <input
                      value={form.name}
                      onChange={(e) =>
                        setField('name', e.target.value)
                      }
                      maxLength={100}
                      required
                      placeholder="e.g. Fresh Beans"
                      className="field mt-1.5 w-full"
                    />
                  </label>

                  <label className="block text-sm font-medium text-ink">
                    SKU
                    <span className="text-brick-600">
                      {' '}
                      *
                    </span>

                    <input
                      value={form.sku}
                      onChange={(e) =>
                        setField('sku', e.target.value)
                      }
                      maxLength={100}
                      required
                      placeholder="e.g. BEANS-001"
                      className="field mt-1.5 w-full"
                    />
                  </label>

                  <label className="block text-sm font-medium text-ink">
                    Barcode{' '}
                    <span className="font-normal text-ink-muted">
                      (optional)
                    </span>

                    <input
                      value={form.barcode}
                      onChange={(e) =>
                        setField(
                          'barcode',
                          e.target.value,
                        )
                      }
                      placeholder="Scan or enter barcode"
                      className="field mt-1.5 w-full"
                    />
                  </label>

                  <div className="grid grid-cols-2 gap-3">
                    <label className="block text-sm font-medium text-ink">
                      Category
                      <span className="text-brick-600">
                        {' '}
                        *
                      </span>

                      <select
                        value={form.categoryId}
                        onChange={(e) =>
                          setField(
                            'categoryId',
                            e.target.value,
                          )
                        }
                        required
                        className="field mt-1.5 w-full"
                      >
                        <option value="">
                          Select category
                        </option>

                        {categories.map((category) => (
                          <option
                            key={category.id}
                            value={category.id}
                          >
                            {category.name}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="block text-sm font-medium text-ink">
                      Unit
                      <span className="text-brick-600">
                        {' '}
                        *
                      </span>

                      <select
                        value={form.unitType}
                        onChange={(e) =>
                          setField(
                            'unitType',
                            e.target.value,
                          )
                        }
                        required
                        className="field mt-1.5 w-full"
                      >
                        {PRODUCT_UNITS.map((unit) => (
                          <option
                            key={unit.value}
                            value={unit.value}
                          >
                            {unit.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <label className="block text-sm font-medium text-ink">
                      Cost price (KES)
                      <span className="text-brick-600">
                        {' '}
                        *
                      </span>

                      <input
                        value={form.costPrice}
                        onChange={(e) =>
                          setField(
                            'costPrice',
                            e.target.value,
                          )
                        }
                        type="number"
                        min="0"
                        step="0.01"
                        required
                        placeholder="e.g. 100.00"
                        className="field mt-1.5 w-full"
                      />
                    </label>

                    <label className="block text-sm font-medium text-ink">
                      Selling price (KES)
                      <span className="text-brick-600">
                        {' '}
                        *
                      </span>

                      <input
                        value={form.sellingPrice}
                        onChange={(e) =>
                          setField(
                            'sellingPrice',
                            e.target.value,
                          )
                        }
                        type="number"
                        min="0"
                        step="0.01"
                        required
                        placeholder="e.g. 120.00"
                        className="field mt-1.5 w-full"
                      />
                    </label>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <label className="block text-sm font-medium text-ink">
                      Current stock
                      <span className="text-brick-600">
                        {' '}
                        *
                      </span>

                      <input
                        value={form.stockQuantity}
                        onChange={(e) =>
                          setField(
                            'stockQuantity',
                            e.target.value,
                          )
                        }
                        type="number"
                        min="0"
                        step={quantityStep(
                          form.unitType,
                        )}
                        required
                        placeholder="e.g. 0"
                        className="field mt-1.5 w-full"
                      />
                    </label>

                    <label className="block text-sm font-medium text-ink">
                      Minimum stock
                      <span className="text-brick-600">
                        {' '}
                        *
                      </span>

                      <input
                        value={form.minimumStock}
                        onChange={(e) =>
                          setField(
                            'minimumStock',
                            e.target.value,
                          )
                        }
                        type="number"
                        min="0"
                        step={quantityStep(
                          form.unitType,
                        )}
                        required
                        placeholder="e.g. 5"
                        className="field mt-1.5 w-full"
                      />
                    </label>
                  </div>

                  <p className="text-xs text-ink-muted">
                    {formFractional
                      ? 'Fractional quantities allowed, up to 3 decimal places.'
                      : 'Quantity must be a whole number.'}
                  </p>
                </div>

                <div className="sticky bottom-0 border-t border-line bg-paper-raised px-6 py-4 flex gap-3">
                  <button
                    type="button"
                    onClick={reset}
                    className="flex-1 rounded-lg border border-line px-4 py-2.5 text-sm font-medium text-ink-muted hover:bg-paper"
                  >
                    Cancel
                  </button>

                  <button
                    type="submit"
                    disabled={
                      saving || categories.length === 0
                    }
                    className="flex-[1.5] rounded-lg bg-ink px-4 py-2.5 text-sm font-medium text-paper disabled:opacity-50"
                  >
                    {saving
                      ? 'Saving…'
                      : editingId
                        ? 'Save changes'
                        : 'Add product'}
                  </button>
                </div>
              </form>
            </aside>
          </div>
        )}

        {adjustingProduct && (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="adjust-stock-title"
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          >
            <form
              onSubmit={submitAdjustment}
              className="w-full max-w-md rounded-xl border border-line bg-paper-raised p-6 shadow-xl"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-market-600">
                    Inventory
                  </p>

                  <h2
                    id="adjust-stock-title"
                    className="font-display font-semibold text-xl text-ink mt-1"
                  >
                    Adjust stock
                  </h2>

                  <p className="text-sm text-ink-muted mt-1">
                    {adjustingProduct.name} ·{' '}
                    {formatQuantity(
                      adjustingProduct.stockQuantity,
                    )}{' '}
                    {adjustingProduct.unitType} currently
                    in stock
                  </p>
                </div>

                <button
                  type="button"
                  onClick={closeAdjustment}
                  aria-label="Close"
                  className="rounded-lg p-2 text-ink-muted hover:bg-paper hover:text-ink"
                >
                  <Icon name="close" />
                </button>
              </div>

              <div className="space-y-4 mt-6">
                <label className="block text-sm font-medium text-ink">
                  Movement type

                  <select
                    value={movementType}
                    onChange={(e) =>
                      setMovementType(
                        e.target.value as MovementType,
                      )
                    }
                    className="field mt-1.5 w-full"
                  >
                    <option value="purchase">
                      Stock in — Purchase
                    </option>

                    <option value="return">
                      Stock in — Return
                    </option>

                    <option value="adjustment">
                      Manual adjustment
                    </option>

                    <option value="damage">
                      Stock out — Damage
                    </option>
                  </select>
                </label>

                <label className="block text-sm font-medium text-ink">
                  Quantity

                  <input
                    value={adjustmentQuantity}
                    onChange={(e) =>
                      setAdjustmentQuantity(
                        e.target.value,
                      )
                    }
                    type="number"
                    min={quantityMinimum(
                      adjustingProduct.unitType,
                    )}
                    step={quantityStep(
                      adjustingProduct.unitType,
                    )}
                    required
                    placeholder={`Enter quantity (${adjustingProduct.unitType})`}
                    className="field mt-1.5 w-full"
                  />

                  {movementType === 'damage' && (
                    <span className="block text-xs font-normal text-ink-muted mt-1">
                      This will subtract the quantity
                      from stock.
                    </span>
                  )}
                </label>

                <label className="block text-sm font-medium text-ink">
                  Reason

                  {(movementType === 'adjustment' ||
                    movementType === 'damage') && (
                    <span className="text-brick-600">
                      {' '}
                      *
                    </span>
                  )}

                  <textarea
                    value={adjustmentReason}
                    onChange={(e) =>
                      setAdjustmentReason(
                        e.target.value,
                      )
                    }
                    required={
                      movementType === 'adjustment' ||
                      movementType === 'damage'
                    }
                    maxLength={500}
                    rows={3}
                    placeholder={
                      movementType === 'adjustment' ||
                      movementType === 'damage'
                        ? 'Why is the stock changing?'
                        : 'Optional note'
                    }
                    className="field mt-1.5 w-full resize-none"
                  />
                </label>
              </div>

              <div className="flex justify-end gap-3 mt-6">
                <button
                  type="button"
                  onClick={closeAdjustment}
                  className="rounded-lg border border-line px-4 py-2.5 text-sm font-medium text-ink-muted hover:bg-paper"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={adjusting}
                  className="rounded-lg bg-ink px-4 py-2.5 text-sm font-medium text-paper disabled:opacity-50"
                >
                  {adjusting
                    ? 'Updating…'
                    : 'Update stock'}
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  )
}