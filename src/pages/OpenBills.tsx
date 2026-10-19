
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  listRestaurantOpenBills,
  type RestaurantOpenBill,
} from '../services/restaurantOrderService'
import { completeRestaurantOrder } from '../services/restaurantOrderService'
import { useAuth } from '../contexts/auth-context'
import { can } from '../lib/permissions'

const money = (value: number) =>
  new Intl.NumberFormat('en-KE', {
    style: 'currency',
    currency: 'KES',
    minimumFractionDigits: 2,
  }).format(value)

export default function OpenBills() {
    const { role, customPermissions } = useAuth()
  const isOwner = role === 'owner'
  const canRecordPayments = can(
    role,
    'recordOpenBillPayments',
    customPermissions,
  )
  const [bills, setBills] = useState<RestaurantOpenBill[]>([])
  const [cashierId, setCashierId] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [payingId, setPayingId] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<
    'cash' | 'mpesa' | 'card'
  >('cash')
  const [amountReceived, setAmountReceived] = useState('')
  const [reference, setReference] = useState('')

  const loadBills = useCallback(async () => {
    setLoading(true)
    setError('')

    try {
      const result = await listRestaurantOpenBills(isOwner ? (cashierId || null) : null)
      setBills(result)
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Unable to load open bills.',
      )
    } finally {
      setLoading(false)
    }
  }, [cashierId, isOwner])

  useEffect(() => {
    void loadBills()
  }, [loadBills])

  const cashiers = useMemo(() => {
    const unique = new Map<string, string>()
    bills.forEach((bill) => unique.set(bill.createdBy, bill.createdByName))
    return [...unique.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  }, [bills])

  const selectedBill = bills.find((bill) => bill.id === payingId)

  async function recordPayment() {
    if (!selectedBill) return

    const amount = Number(amountReceived)
    if (!Number.isFinite(amount) || amount <= 0) {
      setError('Enter a valid payment amount.')
      return
    }

    if (paymentMethod !== 'cash' && amount !== selectedBill.total) {
      setError('For M-Pesa and card, enter the exact bill total.')
      return
    }

    if (paymentMethod === 'cash' && amount < selectedBill.total) {
      setError('The amount received is less than the bill total.')
      return
    }

    const confirmed = window.confirm(
      `Confirm that payment has been received for ${selectedBill.orderNumber}?\n\n` +
        `Bill total: ${money(selectedBill.total)}\n` +
        `Amount received: ${money(amount)}\n` +
        `Method: ${paymentMethod.toUpperCase()}`,
    )

    if (!confirmed) return

    setError('')
    setNotice('')

    try {
      await completeRestaurantOrder({
        orderId: selectedBill.id,
        paymentMethod,
        paymentAmount: amount,
        paymentReference: reference.trim() || undefined,
      })

      setNotice(`Payment recorded for ${selectedBill.orderNumber}.`)
      setPayingId('')
      setAmountReceived('')
      setReference('')
      await loadBills()
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Unable to record payment.',
      )
    }
  }

    if (!can(role, 'openBills', customPermissions)) {
    return (
      <main className="grid min-h-screen place-items-center bg-paper p-6">
        <section className="rounded-xl border border-ink/10 bg-white p-8 text-center">
          <h1 className="text-xl font-semibold">Access restricted</h1>
          <p className="mt-2 text-sm text-ink-muted">
            Ask the business owner to grant Open Bills access.
          </p>
        </section>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-paper p-4 text-ink sm:p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-semibold">Open Bills</h1>
            <p className="mt-2 text-sm text-ink-muted">
              Open restaurant orders awaiting confirmed payment.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadBills()}
            disabled={loading}
            className="rounded-lg border border-ink/15 px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </header>

        {isOwner &&         <section className="rounded-xl border border-ink/10 bg-white p-4">
          <label
            htmlFor="cashier-filter"
            className="mb-2 block text-sm font-medium"
          >
            Filter by cashier
          </label>
          <select
            id="cashier-filter"
            value={cashierId}
            onChange={(event) => setCashierId(event.target.value)}
            className="w-full max-w-sm rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm"
          >
            <option value="">All cashiers</option>
            {cashiers.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </section>}

        {error && (
          <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            {error}
          </div>
        )}
        {notice && (
          <div role="status" className="rounded-lg border border-ink/10 p-3 text-sm">
            {notice}
          </div>
        )}

        {loading ? (
          <p className="text-sm text-ink-muted">Loading open bills…</p>
        ) : bills.length === 0 ? (
          <section className="rounded-xl border border-dashed border-ink/20 p-10 text-center">
            <h2 className="font-medium">No open bills</h2>
            <p className="mt-2 text-sm text-ink-muted">
              Open restaurant orders with items will appear here.
            </p>
          </section>
        ) : (
          <div className="space-y-4">
            {bills.map((bill) => (
              <article
                key={bill.id}
                className="rounded-xl border border-ink/10 bg-white p-4 sm:p-5"
              >
                <div className="flex flex-wrap justify-between gap-3">
                  <div>
                    <h2 className="font-semibold">{bill.orderNumber}</h2>
                    <p className="mt-1 text-sm text-ink-muted">
                      {bill.locationType === 'table'
                        ? `Table ${bill.tableNumber}`
                        : 'Takeaway'}{' '}
                      · Cashier: {bill.createdByName}
                    </p>
                    <p className="mt-1 text-xs text-ink-muted">
  {bill.printedAt
    ? `Printed ${new Date(bill.printedAt).toLocaleString()}`
    : 'Not printed yet'}
</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-ink-muted">Amount due</p>
                    <p className="text-xl font-semibold">{money(bill.total)}</p>
                  </div>
                </div>

                <div className="mt-4 overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-ink/10 text-ink-muted">
                        <th className="py-2 pr-3 font-medium">Item</th>
                        <th className="px-3 py-2 text-right font-medium">Qty</th>
                        <th className="px-3 py-2 text-right font-medium">Price</th>
                        <th className="py-2 pl-3 text-right font-medium">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bill.items.map((item) => (
                        <tr key={item.id} className="border-b border-ink/5">
                          <td className="py-2 pr-3">{item.productName}</td>
                          <td className="px-3 py-2 text-right">{item.quantity}</td>
                          <td className="px-3 py-2 text-right">{money(item.unitPrice)}</td>
                          <td className="py-2 pl-3 text-right">{money(item.subtotal)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {bill.discount > 0 && (
                  <p className="mt-3 text-right text-sm text-ink-muted">
                    Discount: {money(bill.discount)}
                  </p>
                )}

                {canRecordPayments && (                <div className="mt-4 flex justify-end">
                  <button
  type="button"
  disabled={!bill.printedAt}
  onClick={() => {
    setPayingId(bill.id)
    setAmountReceived(String(bill.total))
    setPaymentMethod('cash')
    setReference('')
    setError('')
  }}
  className="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"
>
  Record payment
</button>
                </div>)}

                {payingId === bill.id && canRecordPayments && (
                  <div className="mt-4 space-y-4 rounded-lg border border-ink/10 p-4">
                    <h3 className="font-medium">Confirm payment received</h3>
                    <p className="text-sm text-ink-muted">
                      Verify collection before submitting. This action completes
                      the sale and updates stock.
                    </p>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <label className="block text-sm">
                        Payment method
                        <select
                          value={paymentMethod}
                          onChange={(event) =>
                            setPaymentMethod(
                              event.target.value as 'cash' | 'mpesa' | 'card',
                            )
                          }
                          className="mt-1 w-full rounded-lg border border-ink/15 bg-white px-3 py-2"
                        >
                          <option value="cash">Cash</option>
                          <option value="mpesa">M-Pesa</option>
                          <option value="card">Card</option>
                        </select>
                      </label>

                      <label className="block text-sm">
                        Amount received (KES)
                        <input
                          type="number"
                          min="0.01"
                          step="0.01"
                          value={amountReceived}
                          onChange={(event) => setAmountReceived(event.target.value)}
                          className="mt-1 w-full rounded-lg border border-ink/15 px-3 py-2"
                        />
                      </label>

                      <label className="block text-sm sm:col-span-2">
                        Payment reference (optional)
                        <input
                          value={reference}
                          onChange={(event) => setReference(event.target.value)}
                          placeholder="M-Pesa transaction code or card reference"
                          className="mt-1 w-full rounded-lg border border-ink/15 px-3 py-2"
                        />
                      </label>
                    </div>

                    {paymentMethod === 'cash' && Number(amountReceived) > bill.total && (
                      <p className="text-sm text-ink-muted">
                        Change due: {money(Number(amountReceived) - bill.total)}
                      </p>
                    )}

                    <div className="flex flex-wrap justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setPayingId('')}
                        className="rounded-lg border border-ink/15 px-4 py-2 text-sm"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => void recordPayment()}
                        className="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-white"
                      >
                        Confirm payment
                      </button>
                    </div>
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}
