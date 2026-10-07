import { supabase } from '../lib/supabase'

export type OpenRestaurantOrder = {
  id: string
  tableNumber: number | null
  customerName: string | null
  serverId: string
  status: 'open'
  updatedAt: string
  items: Array<{ productId: string | null; productName: string; quantity: number; unitPrice: number }>
}

export async function listOpenRestaurantOrders(businessId: string): Promise<OpenRestaurantOrder[]> {
  const { data, error } = await supabase
    .from('restaurant_orders')
    .select('id, table_number, customer_name, server_id, status, updated_at, restaurant_order_items(product_id, product_name, quantity, unit_price)')
    .eq('business_id', businessId)
    .eq('status', 'open')
    .order('updated_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map((row: any) => ({
    id: row.id,
    tableNumber: row.table_number,
    customerName: row.customer_name,
    serverId: row.server_id,
    status: 'open',
    updatedAt: row.updated_at,
    items: (row.restaurant_order_items ?? []).map((item: any) => ({
      productId: item.product_id,
      productName: item.product_name,
      quantity: Number(item.quantity),
      unitPrice: Number(item.unit_price),
    })),
  }))
}

export async function saveRestaurantOrder(input: {
  tableNumber: number | null
  customerName?: string
  items: Array<{ productId: string; quantity: number }>
}): Promise<string> {
  const { data, error } = await supabase.rpc('save_restaurant_order', {
    p_table_number: input.tableNumber,
    p_customer_name: input.customerName?.trim() || null,
    p_items: input.items,
  })
  if (error) throw error
  return data as string
}
