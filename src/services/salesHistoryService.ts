import { supabase } from '../lib/supabase'

export type SaleSummary = {
  id: string
  receiptNumber: string
  cashierId: string
  subtotal: number
  discount: number
  total: number
  status: 'completed' | 'voided' | 'returned'
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

export const listSales = async (businessId: string, search = ''): Promise<SaleSummary[]> => {
  let query = supabase.from('sales').select('id, receipt_number, cashier_id, subtotal, discount, total, status, created_at').eq('business_id', businessId).order('created_at', { ascending: false })
  if (search.trim()) query = query.ilike('receipt_number', `%${search.trim()}%`)
  const { data, error } = await query
  if (error) throw error
  return (data ?? []).map((row) => ({
    id: row.id,
    receiptNumber: row.receipt_number,
    cashierId: row.cashier_id,
    subtotal: Number(row.subtotal),
    discount: Number(row.discount),
    total: Number(row.total),
    status: row.status,
    createdAt: row.created_at,
  }))
}

export const getSale = async (businessId: string, saleId: string): Promise<SaleDetail> => {
  const [{ data: sale, error: saleError }, { data: items, error: itemsError }, { data: payment, error: paymentError }] = await Promise.all([
    supabase.from('sales').select('id, receipt_number, cashier_id, subtotal, discount, total, status, created_at').eq('business_id', businessId).eq('id', saleId).maybeSingle(),
    supabase.from('sale_items').select('id, product_id, product_name, quantity, unit_price, discount, subtotal').eq('sale_id', saleId).order('created_at', { ascending: true }),
    supabase.from('payments').select('method, amount, reference').eq('sale_id', saleId).maybeSingle(),
  ])
  if (saleError) throw saleError
  if (itemsError) throw itemsError
  if (paymentError) throw paymentError
  if (!sale) throw new Error('Sale not found.')
  return {
    id: sale.id,
    receiptNumber: sale.receipt_number,
    cashierId: sale.cashier_id,
    subtotal: Number(sale.subtotal),
    discount: Number(sale.discount),
    total: Number(sale.total),
    status: sale.status,
    createdAt: sale.created_at,
    items: (items ?? []).map((row) => ({ id: row.id, productId: row.product_id, productName: row.product_name, quantity: row.quantity, unitPrice: Number(row.unit_price), discount: Number(row.discount), subtotal: Number(row.subtotal) })),
    payment: payment ? { method: payment.method, amount: Number(payment.amount), reference: payment.reference } : null,
  }
}
