import { supabase } from '../lib/supabase'

export type RestaurantLocation =
  | { type: 'table'; tableNumber: number }
  | { type: 'takeaway'; tableNumber: null }

export type RestaurantOrderItem = {
  id: string
  productId: string | null
  productName: string
  quantity: number
  unitPrice: number
  subtotal: number
}

export type RestaurantOpenOrder = {
  id: string
  orderNumber: string
  locationType: 'table' | 'takeaway'
  tableNumber: number | null
  status: 'open'
  discount: number
  createdBy: string
  createdByName: string
  updatedAt: string
  items: RestaurantOrderItem[]
}

export type RestaurantRecentOrder = {
  id: string
  orderNumber: string
  locationType: 'table' | 'takeaway'
  tableNumber: number | null
  status: 'open' | 'paid' | 'cancelled'
  discount: number
  createdBy: string
  createdByName: string
  paidBy: string | null
  paidByName: string | null
  paidAt: string | null
  clearedBy: string | null
  clearedByName: string | null
  clearedAt: string | null
  clearReason: string | null
  orderSlipPrintCount: number
  lastOrderSlipPrintedBy: string | null
  lastOrderSlipPrintedByName: string | null
  lastOrderSlipPrintedAt: string | null
  salesReceiptPrintCount: number
  updatedAt: string
  subtotal: number
  total: number
}

export async function listOpenRestaurantOrders(): Promise<RestaurantOpenOrder[]> {
  const { data, error } = await supabase
    .from('restaurant_orders')
    .select(
      'id, order_number, location_type, table_number, status, discount, created_by, updated_at, created_by_profile:profiles!restaurant_orders_created_by_fkey(full_name), restaurant_order_items(id, product_id, product_name, quantity, unit_price, subtotal)',
    )
    .eq('status', 'open')
    .order('updated_at', { ascending: false })

  if (error) throw error

  return (data ?? []).map((row) => ({
    id: row.id,
    orderNumber: row.order_number,
    locationType: row.location_type,
    tableNumber: row.table_number,
    status: 'open',
    discount: Number(row.discount ?? 0),
    createdBy: row.created_by,
    createdByName:
      row.created_by_profile?.[0]?.full_name || 'Unknown cashier',
    updatedAt: row.updated_at,
    items: (row.restaurant_order_items ?? []).map((item) => ({
      id: item.id,
      productId: item.product_id,
      productName: item.product_name,
      quantity: Number(item.quantity),
      unitPrice: Number(item.unit_price),
      subtotal: Number(item.subtotal),
    })),
  }))
}

export async function listRecentRestaurantOrders(
  limit = 30,
): Promise<RestaurantRecentOrder[]> {
  const { data, error } = await supabase.rpc(
    'list_recent_restaurant_orders',
    { p_limit: limit },
  )

  if (error) throw error

  return ((data ?? []) as Array<{
    id: string
    order_number: string
    location_type: 'table' | 'takeaway'
    table_number: number | null
    status: 'open' | 'paid' | 'cancelled'
    discount: number
    created_by: string
    created_by_name: string
    paid_by: string | null
    paid_by_name: string | null
    paid_at: string | null
    cleared_by: string | null
    cleared_by_name: string | null
    cleared_at: string | null
    clear_reason: string | null
    order_slip_print_count: number
    last_order_slip_printed_by: string | null
    last_order_slip_printed_by_name: string | null
    last_order_slip_printed_at: string | null
    sales_receipt_print_count: number
    updated_at: string
    subtotal: number
    total: number
  }>).map((row) => ({
    id: row.id,
    orderNumber: row.order_number,
    locationType: row.location_type,
    tableNumber: row.table_number,
    status: row.status,
    discount: Number(row.discount ?? 0),
    createdBy: row.created_by,
    createdByName: row.created_by_name || 'Unknown cashier',
    paidBy: row.paid_by,
    paidByName: row.paid_by_name || null,
    paidAt: row.paid_at,
    clearedBy: row.cleared_by,
    clearedByName: row.cleared_by_name || null,
    clearedAt: row.cleared_at,
    clearReason: row.clear_reason,
    orderSlipPrintCount: Number(row.order_slip_print_count ?? 0),
    lastOrderSlipPrintedBy: row.last_order_slip_printed_by,
    lastOrderSlipPrintedByName:
      row.last_order_slip_printed_by_name || null,
    lastOrderSlipPrintedAt: row.last_order_slip_printed_at,
    salesReceiptPrintCount: Number(row.sales_receipt_print_count ?? 0),
    updatedAt: row.updated_at,
    subtotal: Number(row.subtotal ?? 0),
    total: Number(row.total ?? 0),
  }))
}

export type RestaurantLocationStatus = {
  locationType: 'table' | 'takeaway'
  tableNumber: number | null
  occupied: boolean
  canManage: boolean
  orderNumber: string | null
}

export async function listRestaurantLocationStatus(): Promise<
  RestaurantLocationStatus[]
> {
  const { data, error } = await supabase.rpc(
    'list_restaurant_location_status',
  )

  if (error) throw error

  const rows = (data ?? []) as Array<{
    location_type: 'table' | 'takeaway'
    table_number: number | null
    occupied: boolean
    can_manage: boolean
    order_number: string | null
  }>

  return rows.map((row) => ({
    locationType: row.location_type,
    tableNumber: row.table_number,
    occupied: Boolean(row.occupied),
    canManage: Boolean(row.can_manage),
    orderNumber: row.order_number ?? null,
  }))
}

export async function saveRestaurantOrder(input: {
  orderId: string | null
  location: RestaurantLocation
  items: Array<{
    productId: string
    quantity: number
  }>
  discount: number
}): Promise<{
  orderId: string | null
  orderNumber: string | null
}> {
  // The database RPC reads p_items with snake_case keys (product_id).
  // The React cart uses camelCase (productId), so normalize before sending.
  const rpcItems = input.items.map((item) => ({
    product_id: item.productId,
    quantity: item.quantity,
  }))

  const { data, error } = await supabase.rpc('save_restaurant_order', {
    p_order_id: input.orderId,
    p_location_type: input.location.type,
    p_table_number: input.location.tableNumber,
    p_items: rpcItems,
    p_discount: input.discount,
  })

  if (error) throw error
  if (!data?.length) {
    return {
      orderId: null,
      orderNumber: null,
    }
  }

  return {
    orderId: data[0].order_id,
    orderNumber: data[0].order_number,
  }
}

export async function recordRestaurantOrderPrint(
  orderId: string,
  printType: 'order_slip' | 'sales_receipt',
): Promise<void> {
  const { error } = await supabase.rpc(
    'record_restaurant_order_print',
    {
      p_order_id: orderId,
      p_print_type: printType,
    },
  )

  if (error) throw error
}

export async function clearRestaurantOrder(
  orderId: string,
  reason: string,
): Promise<void> {
  const trimmedReason = reason.trim()

  if (!trimmedReason) {
    throw new Error('A reason is required when clearing an order.')
  }

  const { error } = await supabase.rpc(
    'clear_restaurant_order',
    {
      p_order_id: orderId,
      p_reason: trimmedReason,
    },
  )

  if (error) throw error
}

export async function completeRestaurantOrder(input: {
  orderId: string
  paymentMethod: 'cash' | 'mpesa' | 'card'
  paymentAmount: number
  paymentReference?: string
}): Promise<import('./saleService').CompletedSale> {
  const { data, error } = await supabase.rpc(
    'complete_restaurant_order',
    {
      p_order_id: input.orderId,
      p_payment_method: input.paymentMethod,
      p_payment_amount: input.paymentAmount,
      p_payment_reference:
        input.paymentReference?.trim() || null,
    },
  )

  if (error) throw error

  if (!data) {
    throw new Error(
      'Restaurant sale completed but no result was returned.',
    )
  }

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

export async function closeRestaurantOrder(
  orderId: string,
  saleId: string,
): Promise<void> {
  const { error } = await supabase.rpc(
    'close_restaurant_order',
    {
      p_order_id: orderId,
      p_sale_id: saleId,
    },
  )

  if (error) throw error
}