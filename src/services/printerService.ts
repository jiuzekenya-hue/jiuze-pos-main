export type DirectPrintItem = {
  name: string
  quantity: number
  unitPrice: number
  lineTotal: number
}

export type DirectPrintPayload = {
  businessName: string
  title: 'ORDER SLIP' | 'SALES RECEIPT'
  status: 'unpaid' | 'paid'
  receiptNumber?: string
  cashier?: string
  items: DirectPrintItem[]
  subtotal: number
  discount: number
  total: number
  paymentMethod?: string
  paymentReference?: string
  amountPaid?: number
  change?: number
}

const BRIDGE_URL = import.meta.env.VITE_PRINT_BRIDGE_URL || 'http://127.0.0.1:38100'

export async function directPrint(payload: DirectPrintPayload): Promise<boolean> {
  try {
    const response = await fetch(`${BRIDGE_URL}/print`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5000),
    })

    if (!response.ok) return false
    const result = await response.json().catch(() => null)
    return result?.ok === true
  } catch {
    return false
  }
}
