import { supabase } from '../lib/supabase'

export type AnalyticsProduct = {
  id: string
  name: string
  units: number
  revenue: number
  profit: number
}

export type AnalyticsDay = {
  date: string
  revenue: number
  grossRevenue: number
  returns: number
  profit: number
}

export type AnalyticsData = {
  todayGrossRevenue: number
  todayReturns: number
  todayRevenue: number
  todayProfit: number
  todayTransactions: number
  weekGrossRevenue: number
  weekReturns: number
  weekRevenue: number
  weekProfit: number
  monthGrossRevenue: number
  monthReturns: number
  monthRevenue: number
  monthProfit: number
  monthTransactions: number
  inventoryValue: number
  lowStockCount: number
  averageSale: number
  grossMargin: number
  projectedMonthRevenue: number
  projectedMonthProfit: number
  salesTrend: AnalyticsDay[]
  topProducts: AnalyticsProduct[]
  slowProducts: AnalyticsProduct[]
}

type SaleRow = { id: string; total: number; discount: number; subtotal: number; created_at: string }
type ItemRow = { sale_id: string; product_id: string; product_name: string; quantity: number; unit_price: number; cost_price: number; discount: number; subtotal: number }
type ReturnRow = { id: string; refund_amount: number; created_at: string }
type ReturnItemRow = { return_id: string; product_id: string | null; product_name: string; quantity: number; refund_amount: number; cost_price: number }

const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate())
const startOfWeek = (date: Date) => {
  const day = date.getDay()
  const mondayOffset = day === 0 ? -6 : 1 - day
  const result = startOfDay(date)
  result.setDate(result.getDate() + mondayOffset)
  return result
}
const startOfMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth(), 1)
const endOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1)
const iso = (date: Date) => date.toISOString()

export async function getAnalyticsData(businessId: string): Promise<AnalyticsData> {
  if (!businessId) throw new Error('Business is required.')

  const now = new Date()
  const todayStart = startOfDay(now)
  const weekStart = startOfWeek(now)
  const monthStart = startOfMonth(now)
  const thirtyDaysAgo = new Date(todayStart)
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 29)

  const [salesResult, productsResult, returnsResult] = await Promise.all([
    supabase.from('sales').select('id, total, discount, subtotal, created_at').eq('business_id', businessId).eq('status', 'completed').gte('created_at', iso(thirtyDaysAgo)).lt('created_at', iso(endOfDay(now))).order('created_at', { ascending: true }),
    supabase.from('products').select('id, name, stock_quantity, cost_price, minimum_stock').eq('business_id', businessId).eq('is_active', true),
    supabase.from('sales_returns').select('id, refund_amount, created_at').eq('business_id', businessId).gte('created_at', iso(thirtyDaysAgo)).lt('created_at', iso(endOfDay(now))).order('created_at', { ascending: true }),
  ])

  if (salesResult.error) throw salesResult.error
  if (productsResult.error) throw productsResult.error
  if (returnsResult.error) throw returnsResult.error

  const sales = (salesResult.data ?? []) as SaleRow[]
  const products = productsResult.data ?? []
  const returns = (returnsResult.data ?? []) as ReturnRow[]

  const saleIds = sales.map((sale) => sale.id)
  let items: ItemRow[] = []
  if (saleIds.length > 0) {
    const itemsResult = await supabase
      .from('sale_items')
      .select('sale_id, product_id, product_name, quantity, unit_price, cost_price, discount, subtotal')
      .in('sale_id', saleIds)
    if (itemsResult.error) throw itemsResult.error
    items = (itemsResult.data ?? []) as ItemRow[]
  }

  const returnIds = returns.map((row) => row.id)
  let returnItems: ReturnItemRow[] = []
  if (returnIds.length > 0) {
    const returnItemsResult = await supabase
      .from('sales_return_items')
      .select('return_id, product_id, product_name, quantity, refund_amount, cost_price')
      .in('return_id', returnIds)
    if (returnItemsResult.error) throw returnItemsResult.error
    returnItems = (returnItemsResult.data ?? []) as ReturnItemRow[]
  }

  const saleById = new Map(sales.map((sale) => [sale.id, sale]))
  const returnById = new Map(returns.map((row) => [row.id, row]))
  const inRange = (createdAt: string, start: Date) => new Date(createdAt) >= start
  const salesInPeriod = (start: Date) => sales.filter((sale) => inRange(sale.created_at, start))
  const returnsInPeriod = (start: Date) => returns.filter((row) => inRange(row.created_at, start))
  const revenue = (rows: SaleRow[]) => rows.reduce((sum, row) => sum + Number(row.total), 0)
  const returnValue = (rows: ReturnRow[]) => rows.reduce((sum, row) => sum + Number(row.refund_amount), 0)

  const profitForItems = (rows: ItemRow[]) => rows.reduce((sum, item) => {
    const sale = saleById.get(item.sale_id)
    const lineSubtotal = Number(item.subtotal)
    const saleSubtotal = Number(sale?.subtotal ?? 0)
    const saleDiscount = Number(sale?.discount ?? 0)
    const allocatedSaleDiscount = saleSubtotal > 0 ? (lineSubtotal / saleSubtotal) * saleDiscount : 0
    const netLineRevenue = lineSubtotal - allocatedSaleDiscount
    const cost = Number(item.cost_price) * Number(item.quantity)
    return sum + netLineRevenue - cost
  }, 0)

  const profitReversedForReturns = (rows: ReturnItemRow[]) => rows.reduce((sum, item) => {
    return sum + Number(item.refund_amount) - (Number(item.cost_price) * Number(item.quantity))
  }, 0)

  const itemsForSales = (rows: SaleRow[]) => {
    const ids = new Set(rows.map((sale) => sale.id))
    return items.filter((item) => ids.has(item.sale_id))
  }

  const returnItemsForReturns = (rows: ReturnRow[]) => {
    const ids = new Set(rows.map((row) => row.id))
    return returnItems.filter((item) => ids.has(item.return_id))
  }

  const todaySales = salesInPeriod(todayStart)
  const weekSales = salesInPeriod(weekStart)
  const monthSales = salesInPeriod(monthStart)
  const todayReturns = returnsInPeriod(todayStart)
  const weekReturns = returnsInPeriod(weekStart)
  const monthReturns = returnsInPeriod(monthStart)
  const todayItems = itemsForSales(todaySales)
  const weekItems = itemsForSales(weekSales)
  const monthItems = itemsForSales(monthSales)
  const monthReturnItems = returnItemsForReturns(monthReturns)

  const todayGrossRevenue = revenue(todaySales)
  const weekGrossRevenue = revenue(weekSales)
  const monthGrossRevenue = revenue(monthSales)
  const todayReturnValue = returnValue(todayReturns)
  const weekReturnValue = returnValue(weekReturns)
  const monthReturnValue = returnValue(monthReturns)
  const todayRevenue = todayGrossRevenue - todayReturnValue
  const weekRevenue = weekGrossRevenue - weekReturnValue
  const monthRevenue = monthGrossRevenue - monthReturnValue
  const todayProfit = profitForItems(todayItems) - profitReversedForReturns(returnItemsForReturns(todayReturns))
  const weekProfit = profitForItems(weekItems) - profitReversedForReturns(returnItemsForReturns(weekReturns))
  const monthProfit = profitForItems(monthItems) - profitReversedForReturns(monthReturnItems)

  const monthDaysElapsed = Math.max(1, Math.ceil((now.getTime() - monthStart.getTime()) / 86400000))
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  const projectedMonthRevenue = (monthRevenue / monthDaysElapsed) * daysInMonth
  const projectedMonthProfit = (monthProfit / monthDaysElapsed) * daysInMonth

  const trendMap = new Map<string, { grossRevenue: number; returns: number; profit: number }>()
  for (let index = 0; index < 30; index += 1) {
    const date = new Date(thirtyDaysAgo)
    date.setDate(date.getDate() + index)
    trendMap.set(date.toISOString().slice(0, 10), { grossRevenue: 0, returns: 0, profit: 0 })
  }
  for (const sale of sales) {
    const key = new Date(sale.created_at).toISOString().slice(0, 10)
    const current = trendMap.get(key)
    if (current) current.grossRevenue += Number(sale.total)
  }
  for (const returnRow of returns) {
    const key = new Date(returnRow.created_at).toISOString().slice(0, 10)
    const current = trendMap.get(key)
    if (current) current.returns += Number(returnRow.refund_amount)
  }
  for (const item of items) {
    const sale = saleById.get(item.sale_id)
    if (!sale) continue
    const key = new Date(sale.created_at).toISOString().slice(0, 10)
    const current = trendMap.get(key)
    if (current) current.profit += profitForItems([item])
  }
  for (const item of returnItems) {
    const returnRow = returnById.get(item.return_id)
    if (!returnRow) continue
    const key = new Date(returnRow.created_at).toISOString().slice(0, 10)
    const current = trendMap.get(key)
    if (current) current.profit -= Number(item.refund_amount) - (Number(item.cost_price) * Number(item.quantity))
  }

  const productMap = new Map<string, AnalyticsProduct>()
  for (const item of monthItems) {
    const sale = saleById.get(item.sale_id)
    const lineSubtotal = Number(item.subtotal)
    const saleSubtotal = Number(sale?.subtotal ?? 0)
    const saleDiscount = Number(sale?.discount ?? 0)
    const allocatedSaleDiscount = saleSubtotal > 0 ? (lineSubtotal / saleSubtotal) * saleDiscount : 0
    const netRevenue = lineSubtotal - allocatedSaleDiscount
    const profit = netRevenue - (Number(item.cost_price) * Number(item.quantity))
    const current = productMap.get(item.product_id) ?? { id: item.product_id, name: item.product_name, units: 0, revenue: 0, profit: 0 }
    current.units += Number(item.quantity)
    current.revenue += netRevenue
    current.profit += profit
    productMap.set(item.product_id, current)
  }

  for (const item of monthReturnItems) {
    if (!item.product_id) continue
    const current = productMap.get(item.product_id) ?? { id: item.product_id, name: item.product_name, units: 0, revenue: 0, profit: 0 }
    current.units = Math.max(0, current.units - Number(item.quantity))
    current.revenue -= Number(item.refund_amount)
    current.profit -= Number(item.refund_amount) - (Number(item.cost_price) * Number(item.quantity))
    productMap.set(item.product_id, current)
  }

  const productPerformance = Array.from(productMap.values()).map((product) => ({
    ...product,
    revenue: Math.max(0, product.revenue),
    profit: product.profit,
  }))
  const topProducts = [...productPerformance].sort((a, b) => b.revenue - a.revenue).slice(0, 5)
  const slowProducts = [...productPerformance].sort((a, b) => a.units - b.units).slice(0, 5)

  const inventoryValue = products.reduce((sum, product) => sum + Number(product.stock_quantity) * Number(product.cost_price), 0)
  const lowStockCount = products.filter((product) => Number(product.stock_quantity) <= Number(product.minimum_stock)).length
  const averageSale = monthSales.length ? monthRevenue / monthSales.length : 0
  const grossMargin = monthRevenue > 0 ? (monthProfit / monthRevenue) * 100 : 0

  return {
    todayGrossRevenue,
    todayReturns: todayReturnValue,
    todayRevenue,
    todayProfit,
    todayTransactions: todaySales.length,
    weekGrossRevenue,
    weekReturns: weekReturnValue,
    weekRevenue,
    weekProfit,
    monthGrossRevenue,
    monthReturns: monthReturnValue,
    monthRevenue,
    monthProfit,
    monthTransactions: monthSales.length,
    inventoryValue,
    lowStockCount,
    averageSale,
    grossMargin,
    projectedMonthRevenue,
    projectedMonthProfit,
    salesTrend: Array.from(trendMap, ([date, values]) => ({ date, revenue: values.grossRevenue - values.returns, ...values })),
    topProducts,
    slowProducts,
  }
}
