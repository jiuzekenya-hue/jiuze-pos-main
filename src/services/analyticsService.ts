import { supabase } from '../lib/supabase'

export type AnalyticsProduct = {
  id: string
  name: string
  units: number
  revenue: number
  profit: number
}

export type AnalyticsMonth = {
  month: string
  label: string
  grossRevenue: number
  returns: number
  revenue: number
  profit: number
  transactions: number
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
  monthlyHistory: AnalyticsMonth[]
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
const endOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1)
const iso = (date: Date) => date.toISOString()

export async function getAnalyticsData(businessId: string, selectedMonth?: string): Promise<AnalyticsData> {
  if (!businessId) throw new Error('Business is required.')

  const now = new Date()
  const todayStart = startOfDay(now)
  const weekStart = startOfWeek(now)
  const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const monthKey = /^\d{4}-\d{2}$/.test(selectedMonth ?? '') ? selectedMonth! : currentMonthKey
  const [selectedYear, selectedMonthNumber] = monthKey.split('-').map(Number)
  const monthStart = new Date(selectedYear, selectedMonthNumber - 1, 1)
  const monthEnd = new Date(selectedYear, selectedMonthNumber, 1)
  const selectedMonthIsCurrent = monthKey === currentMonthKey
  const historyStart = new Date(now.getFullYear(), now.getMonth() - 11, 1)
  const trendDays = selectedMonthIsCurrent ? Math.min(now.getDate(), new Date(selectedYear, selectedMonthNumber, 0).getDate()) : new Date(selectedYear, selectedMonthNumber, 0).getDate()
  const trendStart = new Date(monthStart)
  const trendEnd = selectedMonthIsCurrent ? new Date(now) : new Date(monthEnd)


  const PAGE_SIZE = 500
  const ID_CHUNK_SIZE = 100

  const fetchSales = async (): Promise<SaleRow[]> => {
    const rows: SaleRow[] = []
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await supabase
        .from('sales')
        .select('id, total, discount, subtotal, created_at')
        .eq('business_id', businessId)
        .eq('status', 'completed')
        .gte('created_at', iso(historyStart))
        .lt('created_at', iso(endOfDay(now)))
        .order('created_at', { ascending: true })
        .range(from, from + PAGE_SIZE - 1)
      if (error) throw new Error(`Analytics sales query failed: ${error.message}`)
      const page = (data ?? []) as SaleRow[]
      rows.push(...page)
      if (page.length < PAGE_SIZE) break
    }
    return rows
  }

  const fetchReturns = async (): Promise<ReturnRow[]> => {
    const rows: ReturnRow[] = []
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await supabase
        .from('sales_returns')
        .select('id, refund_amount, created_at')
        .eq('business_id', businessId)
        .gte('created_at', iso(historyStart))
        .lt('created_at', iso(endOfDay(now)))
        .order('created_at', { ascending: true })
        .range(from, from + PAGE_SIZE - 1)
      if (error) throw new Error(`Analytics returns query failed: ${error.message}`)
      const page = (data ?? []) as ReturnRow[]
      rows.push(...page)
      if (page.length < PAGE_SIZE) break
    }
    return rows
  }

  const [sales, productsResult, returns] = await Promise.all([
    fetchSales(),
    supabase.from('products').select('id, name, stock_quantity, cost_price, minimum_stock').eq('business_id', businessId).eq('is_active', true),
    fetchReturns(),
  ])

  if (productsResult.error) throw new Error(`Analytics products query failed: ${productsResult.error.message}`)
  const products = productsResult.data ?? []

  const fetchItemsByIds = async (table: 'sale_items' | 'sales_return_items', ids: string[]) => {
    const rows: Array<ItemRow | ReturnItemRow> = []
    for (let index = 0; index < ids.length; index += ID_CHUNK_SIZE) {
      const chunk = ids.slice(index, index + ID_CHUNK_SIZE)
      if (table === 'sale_items') {
        const { data, error } = await supabase
          .from('sale_items')
          .select('sale_id, product_id, product_name, quantity, unit_price, cost_price, discount, subtotal')
          .in('sale_id', chunk)
        if (error) throw new Error(`Analytics sale items query failed: ${error.message}`)
        rows.push(...((data ?? []) as ItemRow[]))
      } else {
        const { data, error } = await supabase
          .from('sales_return_items')
          .select('return_id, product_id, product_name, quantity, refund_amount, cost_price')
          .in('return_id', chunk)
        if (error) throw new Error(`Analytics return items query failed: ${error.message}`)
        rows.push(...((data ?? []) as ReturnItemRow[]))
      }
    }
    return rows
  }

  const items = (await fetchItemsByIds('sale_items', sales.map((sale) => sale.id))) as ItemRow[]
  const returnItems = (await fetchItemsByIds('sales_return_items', returns.map((row) => row.id))) as ReturnItemRow[]

  const saleById = new Map(sales.map((sale) => [sale.id, sale]))
  const returnById = new Map(returns.map((row) => [row.id, row]))
  const inRange = (createdAt: string, start: Date, end: Date) => {
    const date = new Date(createdAt)
    return date >= start && date < end
  }
  const salesInPeriod = (start: Date, end: Date) => sales.filter((sale) => inRange(sale.created_at, start, end))
  const returnsInPeriod = (start: Date, end: Date) => returns.filter((row) => inRange(row.created_at, start, end))
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

  const todayEnd = endOfDay(now)
  const weekEnd = endOfDay(now)
  const selectedMonthEnd = selectedMonthIsCurrent ? todayEnd : monthEnd
  const todaySales = salesInPeriod(todayStart, todayEnd)
  const weekSales = salesInPeriod(weekStart, weekEnd)
  const monthSales = salesInPeriod(monthStart, selectedMonthEnd)
  const todayReturns = returnsInPeriod(todayStart, todayEnd)
  const weekReturns = returnsInPeriod(weekStart, weekEnd)
  const monthReturns = returnsInPeriod(monthStart, selectedMonthEnd)
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

  const daysInMonth = new Date(selectedYear, selectedMonthNumber, 0).getDate()
  const monthDaysElapsed = selectedMonthIsCurrent
    ? Math.max(1, Math.ceil((now.getTime() - monthStart.getTime()) / 86400000))
    : daysInMonth
  const projectedMonthRevenue = selectedMonthIsCurrent ? (monthRevenue / monthDaysElapsed) * daysInMonth : monthRevenue
  const projectedMonthProfit = selectedMonthIsCurrent ? (monthProfit / monthDaysElapsed) * daysInMonth : monthProfit

  const trendMap = new Map<string, { grossRevenue: number; returns: number; profit: number }>()
  for (let index = 0; index < trendDays; index += 1) {
    const date = new Date(trendStart)
    date.setDate(date.getDate() + index)
    trendMap.set(date.toISOString().slice(0, 10), { grossRevenue: 0, returns: 0, profit: 0 })
  }
  for (const sale of sales) {
    const saleDate = new Date(sale.created_at)
    if (saleDate < trendStart || saleDate >= trendEnd) continue
    const key = saleDate.toISOString().slice(0, 10)
    const current = trendMap.get(key)
    if (current) current.grossRevenue += Number(sale.total)
  }
  for (const returnRow of returns) {
    const returnDate = new Date(returnRow.created_at)
    if (returnDate < trendStart || returnDate >= trendEnd) continue
    const key = returnDate.toISOString().slice(0, 10)
    const current = trendMap.get(key)
    if (current) current.returns += Number(returnRow.refund_amount)
  }
  for (const item of items) {
    const sale = saleById.get(item.sale_id)
    if (!sale) continue
    const saleDate = new Date(sale.created_at)
    if (saleDate < trendStart || saleDate >= trendEnd) continue
    const key = saleDate.toISOString().slice(0, 10)
    const current = trendMap.get(key)
    if (current) current.profit += profitForItems([item])
  }
  for (const item of returnItems) {
    const returnRow = returnById.get(item.return_id)
    if (!returnRow) continue
    const returnDate = new Date(returnRow.created_at)
    if (returnDate < trendStart || returnDate >= trendEnd) continue
    const key = returnDate.toISOString().slice(0, 10)
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

  const monthlyMap = new Map<string, AnalyticsMonth>()
  for (let index = 0; index < 12; index += 1) {
    const date = new Date(monthStart)
    date.setMonth(date.getMonth() - (11 - index))
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
    monthlyMap.set(monthKey, {
      month: monthKey,
      label: date.toLocaleDateString('en-KE', { month: 'short', year: 'numeric' }),
      grossRevenue: 0,
      returns: 0,
      revenue: 0,
      profit: 0,
      transactions: 0,
    })
  }

  for (const sale of sales) {
    const date = new Date(sale.created_at)
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
    const current = monthlyMap.get(key)
    if (current) {
      current.grossRevenue += Number(sale.total)
      current.transactions += 1
    }
  }

  for (const returnRow of returns) {
    const date = new Date(returnRow.created_at)
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
    const current = monthlyMap.get(key)
    if (current) current.returns += Number(returnRow.refund_amount)
  }

  for (const item of items) {
    const sale = saleById.get(item.sale_id)
    if (!sale) continue
    const date = new Date(sale.created_at)
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
    const current = monthlyMap.get(key)
    if (current) current.profit += profitForItems([item])
  }

  for (const item of returnItems) {
    const returnRow = returnById.get(item.return_id)
    if (!returnRow) continue
    const date = new Date(returnRow.created_at)
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
    const current = monthlyMap.get(key)
    if (current) current.profit -= Number(item.refund_amount) - (Number(item.cost_price) * Number(item.quantity))
  }

  const monthlyHistory = Array.from(monthlyMap.values()).map((month) => ({
    ...month,
    revenue: month.grossRevenue - month.returns,
  }))

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
    monthlyHistory,
    topProducts,
    slowProducts,
  }
}
