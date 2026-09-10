import { useEffect, useMemo, useState } from 'react'
import type { SaleDetail } from '../services/salesHistoryService'
import {
  getReturnableSaleItems,
  processSaleReturn,
  type ProcessedSaleReturn,
  type RefundMethod,
  type ReturnableSaleItem,
} from '../services/returnService'

const money = (value: number) => `KES ${value.toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const quantity = (value: number) => Number.isInteger(value) ? String(value) : value.toFixed(3).replace(/0+$/, '').replace(/\.$/, '')
const unitLabel = (unit: ReturnableSaleItem['unitType']) => unit === 'litre' ? 'litre' : unit
const quantityStep = (unit: ReturnableSaleItem['unitType']) => unit === 'piece' || unit === 'pack' ? '1' : '0.001'

export default function SaleReturnModal({
  businessId,
  businessName,
  sale,
  onClose,
}: {
  businessId: string
  businessName: string
  sale: SaleDetail
  onClose: () => void
}) {
  const [items, setItems] = useState<ReturnableSaleItem[]>([])
  const [quantities, setQuantities] = useState<Record<string, number>>({})
  const [refundMethod, setRefundMethod] = useState<RefundMethod>('cash')
  const [refundReference, setRefundReference] = useState('')
  const [reason, setReason] = useState('Customer return')
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<ProcessedSaleReturn | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const data = await getReturnableSaleItems(businessId, sale.id)
        if (cancelled) return
        setItems(data)
        setQuantities(Object.fromEntries(data.map((item) => [item.id, 0])))
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Unable to load returnable items.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [businessId, sale.id])

  const selectedItems = useMemo(
    () => items.filter((item) => (quantities[item.id] ?? 0) > 0),
    [items, quantities],
  )

  const estimatedRefund = useMemo(() => {
    if (!selectedItems.length) return 0
    return selectedItems.reduce((total, item) => {
      const selectedQuantity = quantities[item.id] ?? 0
      const allocatedSaleDiscount = sale.subtotal > 0 ? (item.subtotal / sale.subtotal) * sale.discount : 0
      const lineNetTotal = Math.max(0, item.subtotal - allocatedSaleDiscount)
      return total + (lineNetTotal / item.soldQuantity) * selectedQuantity
    }, 0)
  }, [items, quantities, sale.discount, sale.subtotal, selectedItems])

  const printReturn = () => {
    if (!result) return
    const selected = selectedItems.map((item) => {
      const selectedQuantity = quantities[item.id] ?? 0
      return `<div style="display:flex;justify-content:space-between;margin:10px 0"><span>${quantity(selectedQuantity)} ${unitLabel(item.unitType)} × ${item.productName}<br><small>${money(item.unitPrice)} each</small></span><strong>${money((item.subtotal / item.soldQuantity) * selectedQuantity)}</strong></div>`
    }).join('')
    const win = window.open('', '_blank', 'width=420,height=720')
    if (!win) return
    win.document.write(`<!doctype html><html><head><title>${result.returnReceiptNumber}</title><style>body{font-family:Arial,sans-serif;width:72mm;margin:0 auto;padding:12px;font-size:12px;color:#111}h1{text-align:center;font-size:18px;margin:0 0 4px}p{text-align:center;margin:4px 0;color:#555}.line{border-top:1px dashed #999;margin:12px 0}.row{display:flex;justify-content:space-between;margin:6px 0}.total{font-size:15px;font-weight:bold}.meta{text-align:center;color:#555;font-size:11px;line-height:1.5}</style></head><body><h1>${businessName || 'Shop'}</h1><p>Return receipt</p><p><strong>${result.returnReceiptNumber}</strong></p><p class="meta">${new Date().toLocaleString()}<br>Original sale: ${result.originalReceiptNumber}</p><div class="line"></div>${selected}<div class="line"></div><div class="row total"><span>Refund</span><span>${money(result.refundAmount)}</span></div><div class="row"><span>Method</span><span>${result.refundMethod === 'mpesa' ? 'M-Pesa' : result.refundMethod.charAt(0).toUpperCase() + result.refundMethod.slice(1)}</span></div><div class="line"></div><p>${result.reason}</p><p>Return processed successfully.</p><script>window.onload=()=>window.print()</script></body></html>`)
    win.document.close()
  }

  const submit = async () => {
    setError(null)
    if (!selectedItems.length) {
      setError('Select at least one item to return.')
      return
    }
    for (const item of selectedItems) {
      const selectedQuantity = quantities[item.id] ?? 0
      if (selectedQuantity > item.remainingQuantity) {
        setError(`Return quantity for ${item.productName} cannot exceed ${quantity(item.remainingQuantity)} ${unitLabel(item.unitType)}.`)
        return
      }
      if ((item.unitType === 'piece' || item.unitType === 'pack') && !Number.isInteger(selectedQuantity)) {
        setError(`${item.productName} requires a whole-number return quantity.`)
        return
      }
    }
    if ((refundMethod === 'mpesa' || refundMethod === 'card') && !refundReference.trim()) {
      setError(`Refund reference is required for ${refundMethod === 'mpesa' ? 'M-Pesa' : 'card'} refunds.`)
      return
    }

    setProcessing(true)
    try {
      const processed = await processSaleReturn({
        saleId: sale.id,
        items: selectedItems.map((item) => ({ saleItemId: item.id, quantity: quantities[item.id] ?? 0 })),
        refundMethod,
        refundReference,
        reason,
      })
      setResult(processed)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to process return.')
    } finally {
      setProcessing(false)
    }
  }

  return <div className="fixed inset-0 z-[60] bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-5" role="dialog" aria-modal="true" aria-labelledby="return-title">
    <div className="w-full sm:max-w-2xl max-h-[94vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl border border-line bg-paper-raised shadow-xl">
      <div className="sticky top-0 z-10 bg-paper-raised/95 backdrop-blur px-5 py-5 border-b border-line flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-market-600">Returns & refunds</p>
          <h2 id="return-title" className="font-display text-xl sm:text-2xl font-semibold text-ink mt-1">Return items</h2>
          <p className="text-xs text-ink-muted mt-1">Original sale: <span className="font-mono text-ink">{sale.receiptNumber}</span></p>
        </div>
        {!result && <button type="button" onClick={onClose} className="h-9 w-9 rounded-lg border border-line flex items-center justify-center text-ink-muted hover:text-ink hover:bg-paper" aria-label="Close return dialog">×</button>}
      </div>

      {result ? <div className="p-5 sm:p-6">
        <div className="rounded-2xl border border-market-200 bg-market-50 p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-market-700">Return completed</p>
          <p className="font-display text-2xl font-semibold text-ink mt-2">{money(result.refundAmount)} refunded</p>
          <p className="text-sm text-ink-muted mt-1">Return receipt <span className="font-mono text-ink">{result.returnReceiptNumber}</span></p>
          <p className="text-sm text-ink-muted mt-1">Stock has been restored and the original sale remains unchanged.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 mt-5">
          <button type="button" onClick={printReturn} className="rounded-xl bg-ink px-4 py-3.5 text-sm font-semibold text-paper">Print return receipt</button>
          <button type="button" onClick={onClose} className="rounded-xl border border-line bg-paper px-4 py-3.5 text-sm font-semibold text-ink">Close</button>
        </div>
      </div> : <>
        {error && <div role="alert" className="mx-5 mt-5 rounded-xl border border-brick-200 bg-brick-50 px-4 py-3 text-sm text-brick-700">{error}</div>}
        {loading ? <div className="px-5 py-16 text-center text-sm text-ink-muted">Loading returnable items…</div> : <div className="p-5 sm:p-6 space-y-6">
          <div className="rounded-xl border border-line bg-paper p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">Original transaction</p>
            <div className="flex items-end justify-between gap-4 mt-2"><div><p className="font-medium text-ink">{businessName || 'Shop'}</p><p className="text-xs text-ink-muted mt-1">{new Date(sale.createdAt).toLocaleString()} · Cashier: {sale.cashierName}</p></div><p className="font-display font-semibold text-lg text-ink">{money(sale.total)}</p></div>
          </div>

          <div>
            <div className="flex items-end justify-between mb-3"><div><h3 className="font-medium text-ink">Select items</h3><p className="text-xs text-ink-muted mt-1">Choose how much of each item the customer is returning.</p></div></div>
            <div className="divide-y divide-line rounded-xl border border-line bg-paper">
              {items.map((item) => <div key={item.id} className="p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0"><p className="font-medium text-sm text-ink truncate">{item.productName}</p><p className="text-xs text-ink-muted mt-1">Sold {quantity(item.soldQuantity)} {unitLabel(item.unitType)} · {quantity(item.remainingQuantity)} remaining · {money(item.unitPrice)} each</p></div>
                <div className="flex items-center gap-3 sm:w-48"><label className="text-xs text-ink-muted flex-1">Return<input type="number" min="0" max={item.remainingQuantity} step={quantityStep(item.unitType)} value={quantities[item.id] ?? 0} onChange={(event) => setQuantities((current) => ({ ...current, [item.id]: Number(event.target.value) }))} disabled={item.remainingQuantity <= 0} className="field mt-1 h-10 w-full" /></label><span className="text-sm font-semibold text-ink w-24 text-right">{money(((item.subtotal / item.soldQuantity) * (quantities[item.id] ?? 0)))}</span></div>
              </div>)}
              {items.length === 0 && <div className="p-8 text-center text-sm text-ink-muted">This sale has no items.</div>}
              {items.length > 0 && items.every((item) => item.remainingQuantity <= 0) && <div className="p-8 text-center text-sm text-ink-muted">All items from this sale have already been returned.</div>}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-xs font-medium uppercase tracking-wide text-ink-muted">Refund method<select value={refundMethod} onChange={(event) => setRefundMethod(event.target.value as RefundMethod)} className="field mt-2 h-11 w-full normal-case tracking-normal"><option value="cash">Cash</option><option value="mpesa">M-Pesa</option><option value="card">Card</option></select></label>
            <label className="text-xs font-medium uppercase tracking-wide text-ink-muted">Refund reference{(refundMethod === 'mpesa' || refundMethod === 'card') ? <span className="text-brick-600"> *</span> : null}<input value={refundReference} onChange={(event) => setRefundReference(event.target.value)} placeholder={refundMethod === 'mpesa' ? 'M-Pesa transaction code' : refundMethod === 'card' ? 'Card refund reference' : 'Optional'} className="field mt-2 h-11 w-full normal-case tracking-normal" /></label>
          </div>

          <label className="block text-xs font-medium uppercase tracking-wide text-ink-muted">Reason<input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Reason for return" className="field mt-2 h-11 w-full normal-case tracking-normal" /></label>

          <div className="rounded-2xl bg-ink p-5 text-paper flex items-end justify-between gap-4"><div><p className="text-xs uppercase tracking-wide opacity-70">Estimated refund</p><p className="font-display text-2xl font-semibold mt-1">{money(estimatedRefund)}</p></div><p className="text-xs opacity-70 text-right max-w-48">The final refund is calculated transactionally from the original sale.</p></div>

          <button type="button" onClick={() => void submit()} disabled={processing || loading || !selectedItems.length} className="w-full rounded-xl bg-ink px-4 py-3.5 text-sm font-semibold text-paper disabled:opacity-50">{processing ? 'Processing return…' : 'Process return & refund'}</button>
        </div>}
      </>}
    </div>
  </div>
}
