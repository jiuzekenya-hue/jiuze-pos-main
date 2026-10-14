import { supabase } from '../lib/supabase'

export type SaleSummary = {
  id: string
  receiptNumber: string
  cashierId: string
  cashierName: string
  subtotal: number
  discount: number
  total: number
  status: 'completed' | 'voided' | 'returned'
  paymentMethod?: string
  createdAt: string
}

export type SaleDetail = SaleSummary & {
  items: Array<{
    id: string
    productId: string | null
    productName: string
    quantity: number
    unitPrice: number
    discount: number
    subtotal: number
  }>
  payment: {
    method: 'cash' | 'mpesa' | 'card'
    amount: number
    reference: string | null
  } | null
}

type CashierProfile = { full_name: string | null }
type SaleWithCashier = {
  id: string
  receipt_number: string
  cashier_id: string
  cashier: CashierProfile | CashierProfile[] | null
  subtotal: number
  discount: number
  total: number
  status: 'completed' | 'voided' | 'returned'
  created_at: string
}

const cashierName = (cashier: CashierProfile | CashierProfile[] | null | undefined) => {
  const profile = Array.isArray(cashier) ? cashier[0] : cashier
  return profile?.full_name?.trim() || 'Unknown cashier'
}

export const listSales = async (businessId: string, search = ''): Promise<SaleSummary[]> => {
  let query = supabase
    .from('sales')
    .select('id, receipt_number, cashier_id, cashier:profiles!sales_cashier_id_fkey(full_name), subtotal, discount, total, status, created_at')
    .eq('business_id', businessId)
    .order('created_at', { ascending: false })
  if (search.trim()) query = query.ilike('receipt_number', `%${search.trim()}%`)
  const { data, error } = await query
  if (error) throw error
  return ((data ?? []) as unknown as SaleWithCashier[]).map((row) => ({
    id: row.id,
    receiptNumber: row.receipt_number,
    cashierId: row.cashier_id,
    cashierName: cashierName(row.cashier),
    subtotal: Number(row.subtotal),
    discount: Number(row.discount),
    total: Number(row.total),
    status: row.status,
    createdAt: row.created_at,
  }))
}

export const getSale = async (businessId: string, saleId: string): Promise<SaleDetail> => {
  const [{ data: sale, error: saleError }, { data: items, error: itemsError }, { data: payment, error: paymentError }] = await Promise.all([
    supabase
      .from('sales')
      .select('id, receipt_number, cashier_id, cashier:profiles!sales_cashier_id_fkey(full_name), subtotal, discount, total, status, created_at')
      .eq('business_id', businessId)
      .eq('id', saleId)
      .maybeSingle(),
    supabase.from('sale_items').select('id, product_id, product_name, quantity, unit_price, discount, subtotal').eq('sale_id', saleId).order('created_at', { ascending: true }),
    supabase.from('payments').select('method, amount, reference').eq('sale_id', saleId).maybeSingle(),
  ])
  if (saleError) throw saleError
  if (itemsError) throw itemsError
  if (paymentError) throw paymentError
  if (!sale) throw new Error('Sale not found.')
  const typedSale = sale as unknown as SaleWithCashier
  return {
    id: typedSale.id,
    receiptNumber: typedSale.receipt_number,
    cashierId: typedSale.cashier_id,
    cashierName: cashierName(typedSale.cashier),
    subtotal: Number(typedSale.subtotal),
    discount: Number(typedSale.discount),
    total: Number(typedSale.total),
    status: typedSale.status,
    createdAt: typedSale.created_at,
    items: (items ?? []).map((row) => ({ id: row.id, productId: row.product_id, productName: row.product_name, quantity: row.quantity, unitPrice: Number(row.unit_price), discount: Number(row.discount), subtotal: Number(row.subtotal) })),
    payment: payment ? { method: payment.method, amount: Number(payment.amount), reference: payment.reference } : null,
  }
}

export type SalesReport = {
  sales: SaleSummary[]
  returnedTotal: number
  cashTotal: number
  cashSalesTotal: number
  potentialCashChange: number
  mpesaTotal: number
  otherPaymentTotal: number
}

export const getSalesReport = async (
  businessId: string,
  startDate?: string,
  endDate?: string,
): Promise<SalesReport> => {
  let query = supabase
    .from('sales')
    .select('id, receipt_number, cashier_id, cashier:profiles!sales_cashier_id_fkey(full_name), subtotal, discount, total, status, created_at')
    .eq('business_id', businessId)
    .order('created_at', { ascending: false })

  if (startDate) {
    query = query.gte('created_at', startDate)
  }

  if (endDate) {
    query = query.lt('created_at', endDate)
  }

  const PAGE_SIZE = 500
  const rows: unknown[] = []

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await query
      .range(from, from + PAGE_SIZE - 1)

    if (error) throw error

    const page = data ?? []
    rows.push(...page)

    if (page.length < PAGE_SIZE) break
  }

  const sales = (rows as unknown as SaleWithCashier[]).map((row) => ({
    id: row.id,
    receiptNumber: row.receipt_number,
    cashierId: row.cashier_id,
    cashierName: cashierName(row.cashier),
    subtotal: Number(row.subtotal),
    discount: Number(row.discount),
    total: Number(row.total),
    status: row.status,
    createdAt: row.created_at,
  }))

  const saleIds = sales.map((sale) => sale.id)
  const returns: Array<{ refund_amount: number | null }> = []

  for (let from = 0; ; from += PAGE_SIZE) {
    let query = supabase
      .from('sales_returns')
      .select('refund_amount')
      .eq('business_id', businessId)

    if (startDate) {
      query = query.gte('created_at', startDate)
    }

    if (endDate) {
      query = query.lt('created_at', endDate)
    }

    const { data, error } = await query.range(from, from + PAGE_SIZE - 1)

    if (error) throw error

    const page = data ?? []
    returns.push(...page)

    if (page.length < PAGE_SIZE) break
  }

  const returnedTotal = returns.reduce(
    (sum, row) => sum + Number(row.refund_amount || 0),
    0,
  )
  let cashTotal = 0
  let cashSalesTotal = 0
  let potentialCashChange = 0
  let mpesaTotal = 0
  let otherPaymentTotal = 0

  let payments: Array<{ sale_id: string; method: string; amount: number }> = []

  if (saleIds.length > 0) {
    for (let from = 0; ; from += 500) {
      const { data, error: paymentError } = await supabase
        .from('payments')
        .select('sale_id, method, amount')
        .in('sale_id', saleIds)
        .range(from, from + 499)

      if (paymentError) throw paymentError

      const page = data ?? []
      payments.push(...page)

      if (page.length < 500) break
    }

    const completedSaleIds = new Set(
      sales
        .filter((sale) => sale.status === 'completed')
        .map((sale) => sale.id),
    )
    const saleTotals = new Map(
      sales.map((sale) => [sale.id, sale.total]),
    )

    for (const payment of payments ?? []) {
      if (!completedSaleIds.has(payment.sale_id)) continue

      const amount = Number(payment.amount) || 0

      if (payment.method === 'cash') {
        cashTotal += amount

        const saleTotal = saleTotals.get(payment.sale_id) ?? 0
        cashSalesTotal += saleTotal
        potentialCashChange += Math.max(amount - saleTotal, 0)
      } else if (payment.method === 'mpesa') {
        mpesaTotal += amount
      } else {
        otherPaymentTotal += amount
      }
    }
  }

  const paymentMethodsBySale = new Map<string, Set<string>>()

  for (const payment of payments) {
    const methods = paymentMethodsBySale.get(payment.sale_id) ?? new Set<string>()
    methods.add(String(payment.method).toLowerCase())
    paymentMethodsBySale.set(payment.sale_id, methods)
  }

  const salesWithPaymentMethods = sales.map((sale) => {
    const methods = [...(paymentMethodsBySale.get(sale.id) ?? [])]

    return {
      ...sale,
      paymentMethod: methods.length > 0
        ? methods.join(' + ')
        : 'Unrecorded',
    }
  })

  return {
    sales: salesWithPaymentMethods,
    returnedTotal,
    cashTotal,
    cashSalesTotal,
    potentialCashChange,
    mpesaTotal,
    otherPaymentTotal,
  }
}