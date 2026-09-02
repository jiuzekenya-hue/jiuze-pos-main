import { beforeEach, describe, expect, it, vi } from 'vitest'

import { supabase } from '../lib/supabase'

import { completeSale } from './saleService'

vi.mock('../lib/supabase', () => ({ supabase: { rpc: vi.fn() } }))

const result = {
  sale_id: 'sale-1',
  receipt_number: 'R-20260901-0001',
  business_id: 'business-1',
  subtotal: 140,
  discount: 0,
  total: 140,
  payment_method: 'cash',
  amount_paid: 200,
  change: 60,
  status: 'completed',
}

describe('saleService', () => {
  beforeEach(() => vi.clearAllMocks())

  it('completes a cash sale and maps the result', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: result, error: null } as never)

    await expect(
      completeSale({
        items: [{ productId: 'prod-1', quantity: 2 }],
        paymentMethod: 'cash',
        paymentAmount: 200,
      }),
    ).resolves.toEqual({
      saleId: 'sale-1',
      receiptNumber: 'R-20260901-0001',
      businessId: 'business-1',
      subtotal: 140,
      discount: 0,
      total: 140,
      paymentMethod: 'cash',
      amountPaid: 200,
      change: 60,
      status: 'completed',
    })

    expect(supabase.rpc).toHaveBeenCalledWith('complete_sale', {
      p_items: [{ product_id: 'prod-1', quantity: 2 }],
      p_payment_method: 'cash',
      p_payment_amount: 200,
      p_payment_reference: null,
      p_discount: 0,
    })
  })

  it('passes item and sale discounts and payment reference', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: { ...result, payment_method: 'mpesa', total: 120 },
      error: null,
    } as never)

    await completeSale({
      items: [{ productId: 'prod-1', quantity: 2, discount: 10 }],
      paymentMethod: 'mpesa',
      paymentAmount: 120,
      paymentReference: '  MPESA123  ',
      discount: 10,
    })

    expect(supabase.rpc).toHaveBeenCalledWith(
      'complete_sale',
      expect.objectContaining({
        p_payment_method: 'mpesa',
        p_payment_reference: 'MPESA123',
        p_discount: 10,
      }),
    )
  })

  it('rejects an empty cart', async () => {
    await expect(
      completeSale({
        items: [],
        paymentMethod: 'cash',
        paymentAmount: 0,
      }),
    ).rejects.toThrow('Cart cannot be empty')
  })

  it('rejects invalid payment method', async () => {
    await expect(
      completeSale({
        items: [{ productId: 'prod-1', quantity: 1 }],
        paymentMethod: 'cashless' as never,
        paymentAmount: 70,
      }),
    ).rejects.toThrow('Invalid payment method')
  })

  it('rejects invalid quantity', async () => {
    await expect(
      completeSale({
        items: [{ productId: 'prod-1', quantity: 0 }],
        paymentMethod: 'cash',
        paymentAmount: 70,
      }),
    ).rejects.toThrow('positive number')
  })

  it('accepts fractional quantity at the service layer', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: result,
      error: null,
    } as never)

    await expect(
      completeSale({
        items: [{ productId: 'prod-1', quantity: 1.5 }],
        paymentMethod: 'cash',
        paymentAmount: 200,
      }),
    ).resolves.toBeDefined()
  })

  it('rejects negative discount', async () => {
    await expect(
      completeSale({
        items: [{ productId: 'prod-1', quantity: 1 }],
        paymentMethod: 'cash',
        paymentAmount: 70,
        discount: -1,
      }),
    ).rejects.toThrow('Discount cannot be negative')
  })

  it('rejects invalid payment amount', async () => {
    await expect(
      completeSale({
        items: [{ productId: 'prod-1', quantity: 1 }],
        paymentMethod: 'cash',
        paymentAmount: -1,
      }),
    ).rejects.toThrow('Payment amount')
  })

  it('propagates Supabase errors', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: null,
      error: new Error('database failure'),
    } as never)

    await expect(
      completeSale({
        items: [{ productId: 'prod-1', quantity: 1 }],
        paymentMethod: 'cash',
        paymentAmount: 70,
      }),
    ).rejects.toThrow('database failure')
  })
})