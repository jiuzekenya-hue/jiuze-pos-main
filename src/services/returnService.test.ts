import { beforeEach, describe, expect, it, vi } from 'vitest'
import { supabase } from '../lib/supabase'
import { processSaleReturn } from './returnService'

vi.mock('../lib/supabase', () => ({
  supabase: {
    rpc: vi.fn(),
  },
}))

describe('returnService', () => {
  beforeEach(() => vi.clearAllMocks())

  it('processes a cash return through the database transaction', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: {
        return_id: 'return-1',
        return_receipt_number: 'RR-20260910-0001',
        original_sale_id: 'sale-1',
        original_receipt_number: 'R-20260910-0001',
        business_id: 'business-1',
        refund_method: 'cash',
        refund_amount: 210,
        refund_reference: null,
        reason: 'Customer return',
        status: 'completed',
      },
      error: null,
    } as never)

    await expect(processSaleReturn({
      saleId: 'sale-1',
      items: [{ saleItemId: 'item-1', quantity: 3 }],
      refundMethod: 'cash',
      reason: '  Customer return  ',
    })).resolves.toMatchObject({
      returnId: 'return-1',
      returnReceiptNumber: 'RR-20260910-0001',
      refundAmount: 210,
      reason: 'Customer return',
      status: 'completed',
    })

    expect(supabase.rpc).toHaveBeenCalledWith('process_sale_return', {
      p_sale_id: 'sale-1',
      p_items: [{ sale_item_id: 'item-1', quantity: 3 }],
      p_refund_method: 'cash',
      p_refund_reference: null,
      p_reason: 'Customer return',
    })
  })

  it('requires a reference for M-Pesa refunds', async () => {
    await expect(processSaleReturn({
      saleId: 'sale-1',
      items: [{ saleItemId: 'item-1', quantity: 1 }],
      refundMethod: 'mpesa',
      reason: 'Customer return',
    })).rejects.toThrow('Refund reference is required for M-Pesa refunds.')

    expect(supabase.rpc).not.toHaveBeenCalled()
  })

  it('requires at least one returned item', async () => {
    await expect(processSaleReturn({
      saleId: 'sale-1',
      items: [],
      refundMethod: 'cash',
      reason: 'Customer return',
    })).rejects.toThrow('Select at least one item to return.')
  })

  it('requires a reason', async () => {
    await expect(processSaleReturn({
      saleId: 'sale-1',
      items: [{ saleItemId: 'item-1', quantity: 1 }],
      refundMethod: 'cash',
      reason: '   ',
    })).rejects.toThrow('A return reason is required.')
  })
})
