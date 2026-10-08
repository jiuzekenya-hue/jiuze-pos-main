import { supabase } from '../lib/supabase'

export type RestaurantLocation = { type: 'table'; tableNumber: number } | { type: 'takeaway'; tableNumber: null }

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
  updatedAt: string
  items: RestaurantOrderItem[]
}

export async function listOpenRestaurantOrders(): Promise<RestaurantOpenOrder[]> {
  const { data, error } = await supabase
    .from('restaurant_orders')
    .select('id, order_number, location_type, table_number, status, discount, created_by, updated_at, restaurant_order_items(id, product_id, product_name, quantity, unit_price, subtotal)')
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

export async function saveRestaurantOrder(input: {
  orderId: string | null
  location: RestaurantLocation
  items: Array<{ productId: string; quantity: number }>
  discount: number
}): Promise<{ orderId: string | null; orderNumber: string | null }> {
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
  if (!data?.length) return { orderId: null, orderNumber: null }

  return {
    orderId: data[0].order_id,
    orderNumber: data[0].order_number,
  }
}

export async function closeRestaurantOrder(orderId: string, saleId: string): Promise<void> {
  const { error } = await supabase.rpc('close_restaurant_order', {
    p_order_id: orderId,
    p_sale_id: saleId,
  })
  if (error) throw error
}
