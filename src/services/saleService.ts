import { supabase } from '../lib/supabase'

export type SalePaymentMethod = 'cash' | 'mpesa' | 'card'

export type SaleItemInput = {
  productId: string
  quantity: number
  discount?: number
}

export type CompleteSaleInput = {
  items: SaleItemInput[]
  paymentMethod: SalePaymentMethod
  paymentAmount: number
  paymentReference?: string
  discount?: number
}

export type CompletedSale = {
  saleId: string
  receiptNumber: string
  businessId: string
  subtotal: number
  discount: number
  total: number
  paymentMethod: SalePaymentMethod
  amountPaid: number
  change: number
  status: 'completed'
}

const validate = (input: CompleteSaleInput) => {
  if (!input.items.length) throw new Error('Cart cannot be empty.')
  if (!['cash', 'mpesa', 'card'].includes(input.paymentMethod)) throw new Error('Invalid payment method.')
  if (!Number.isFinite(input.paymentAmount) || input.paymentAmount < 0) throw new Error('Payment amount must be a valid non-negative number.')
  if (input.discount !== undefined && (!Number.isFinite(input.discount) || input.discount < 0)) throw new Error('Discount cannot be negative.')
  for (const item of input.items) {
    if (!item.productId.trim()) throw new Error('Each cart item requires a product.')
    if (!Number.isFinite(item.quantity) || item.quantity <= 0) throw new Error('Item quantity must be a positive number.')
    if (item.discount !== undefined && (!Number.isFinite(item.discount) || item.discount < 0)) throw new Error('Item discount cannot be negative.')
  }
}

export const completeSale = async (input: CompleteSaleInput): Promise<CompletedSale> => {
  validate(input)
  const { data, error } = await supabase.rpc('complete_sale', {
    p_items: input.items.map((item) => ({ product_id: item.productId, quantity: item.quantity, ...(item.discount !== undefined ? { discount: item.discount } : {}) })),
    p_payment_method: input.paymentMethod,
    p_payment_amount: input.paymentAmount,
    p_payment_reference: input.paymentReference?.trim() || null,
    p_discount: input.discount ?? 0,
  })
  if (error) throw error
  if (!data) throw new Error('Sale completed but no result was returned.')
  return {
    saleId: data.sale_id,
    receiptNumber: data.receipt_number,
    businessId: data.business_id,
    subtotal: Number(data.subtotal),
    discount: Number(data.discount),
    total: Number(data.total),
    paymentMethod: data.payment_method,
    amountPaid: Number(data.amount_paid),
    change: Number(data.change),
    status: data.status,
  }
}
