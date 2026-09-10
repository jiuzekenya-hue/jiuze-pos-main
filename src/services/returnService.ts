import { supabase } from '../lib/supabase'

export type RefundMethod = 'cash' | 'mpesa' | 'card'
export type ReturnUnitType = 'piece' | 'pack' | 'kg' | 'g' | 'litre' | 'ml'

export type ReturnableSaleItem = {
  id: string
  productId: string | null
  productName: string
  unitType: ReturnUnitType
  soldQuantity: number
  returnedQuantity: number
  remainingQuantity: number
  unitPrice: number
  costPrice: number
  lineDiscount: number
  subtotal: number
}

export type ProcessSaleReturnInput = {
  saleId: string
  items: Array<{
    saleItemId: string
    quantity: number
  }>
  refundMethod: RefundMethod
  refundReference?: string
  reason: string
}

export type ProcessedSaleReturn = {
  returnId: string
  returnReceiptNumber: string
  originalSaleId: string
  originalReceiptNumber: string
  businessId: string
  refundMethod: RefundMethod
  refundAmount: number
  refundReference: string | null
  reason: string
  status: 'completed'
}

type SaleItemRow = {
  id: string
  product_id: string | null
  product_name: string
  quantity: number
  unit_price: number
  cost_price: number
  discount: number
  subtotal: number
}

type ReturnItemRow = {
  original_sale_item_id: string
  quantity: number
}

type ProductUnitRow = {
  id: string
  unit_type: ReturnUnitType
}

const validateReturnInput = (input: ProcessSaleReturnInput) => {
  if (!input.saleId.trim()) throw new Error('Original sale is required.')
  if (!input.items.length) throw new Error('Select at least one item to return.')
  if (!['cash', 'mpesa', 'card'].includes(input.refundMethod)) throw new Error('Invalid refund method.')
  if (!input.reason.trim()) throw new Error('A return reason is required.')
  if ((input.refundMethod === 'mpesa' || input.refundMethod === 'card') && !input.refundReference?.trim()) {
    throw new Error(`Refund reference is required for ${input.refundMethod === 'mpesa' ? 'M-Pesa' : 'card'} refunds.`)
  }
  for (const item of input.items) {
    if (!item.saleItemId.trim()) throw new Error('Each return item requires a sale item.')
    if (!Number.isFinite(item.quantity) || item.quantity <= 0) throw new Error('Return quantity must be greater than zero.')
  }
}

export const getReturnableSaleItems = async (businessId: string, saleId: string): Promise<ReturnableSaleItem[]> => {
  if (!businessId) throw new Error('Business is required.')
  if (!saleId) throw new Error('Sale is required.')

  const [{ data: saleItems, error: saleItemsError }, { data: returns, error: returnsError }] = await Promise.all([
    supabase
      .from('sale_items')
      .select('id, product_id, product_name, quantity, unit_price, cost_price, discount, subtotal')
      .eq('sale_id', saleId)
      .order('created_at', { ascending: true }),
    supabase
      .from('sales_return_items')
      .select('original_sale_item_id, quantity')
      .eq('business_id', businessId),
  ])

  if (saleItemsError) throw saleItemsError
  if (returnsError) throw returnsError

  const rows = (saleItems ?? []) as SaleItemRow[]
  const productIds = Array.from(new Set(rows.map((row) => row.product_id).filter((id): id is string => Boolean(id))))
  const productUnits = new Map<string, ReturnUnitType>()

  if (productIds.length) {
    const { data, error } = await supabase
      .from('products')
      .select('id, unit_type')
      .in('id', productIds)
    if (error) throw error
    for (const row of (data ?? []) as ProductUnitRow[]) productUnits.set(row.id, row.unit_type)
  }

  const returnedByItem = new Map<string, number>()
  for (const row of (returns ?? []) as ReturnItemRow[]) {
    returnedByItem.set(row.original_sale_item_id, (returnedByItem.get(row.original_sale_item_id) ?? 0) + Number(row.quantity))
  }

  return rows.map((row) => {
    const soldQuantity = Number(row.quantity)
    const returnedQuantity = returnedByItem.get(row.id) ?? 0
    return {
      id: row.id,
      productId: row.product_id,
      productName: row.product_name,
      unitType: productUnits.get(row.product_id ?? '') ?? 'piece',
      soldQuantity,
      returnedQuantity,
      remainingQuantity: Math.max(0, soldQuantity - returnedQuantity),
      unitPrice: Number(row.unit_price),
      costPrice: Number(row.cost_price),
      lineDiscount: Number(row.discount),
      subtotal: Number(row.subtotal),
    }
  })
}

export const processSaleReturn = async (input: ProcessSaleReturnInput): Promise<ProcessedSaleReturn> => {
  validateReturnInput(input)

  const { data, error } = await supabase.rpc('process_sale_return', {
    p_sale_id: input.saleId,
    p_items: input.items.map((item) => ({ sale_item_id: item.saleItemId, quantity: item.quantity })),
    p_refund_method: input.refundMethod,
    p_refund_reference: input.refundReference?.trim() || null,
    p_reason: input.reason.trim(),
  })

  if (error) throw error
  if (!data) throw new Error('Return completed but no result was returned.')

  return {
    returnId: data.return_id,
    returnReceiptNumber: data.return_receipt_number,
    originalSaleId: data.original_sale_id,
    originalReceiptNumber: data.original_receipt_number,
    businessId: data.business_id,
    refundMethod: data.refund_method,
    refundAmount: Number(data.refund_amount),
    refundReference: data.refund_reference,
    reason: data.reason,
    status: data.status,
  }
}
