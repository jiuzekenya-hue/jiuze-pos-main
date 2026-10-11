export type DirectPrintItem = {
  name: string
  quantity: number
  unitPrice: number
  lineTotal: number
}

export type DirectPrintPayload = {
  businessName: string
  serviceType?: 'retail' | 'restaurant'
  location?: string
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

const escapeHtml = (value: unknown): string =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

const money = (value: number): string =>
  'KES ' + Number(value || 0).toFixed(2)

/**
 * Opens the browser's standard print dialog using a temporary print-only
 * iframe. This does not require the local Print Bridge or a printer service.
 */
export async function browserPrint(
  payload: DirectPrintPayload,
): Promise<boolean> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return false
  }

  const rows = payload.items
    .map(
      (item) => `
        <tr>
          <td>${escapeHtml(item.name)}</td>
          <td class="number">${escapeHtml(item.quantity)}</td>
          <td class="number">${escapeHtml(money(item.lineTotal))}</td>
        </tr>`,
    )
    .join('')

  const paymentDetails =
    payload.status === 'paid'
      ? `
        <div class="row"><span>Payment method</span><strong>${escapeHtml(payload.paymentMethod || '—')}</strong></div>
        ${payload.paymentReference ? `<div class="row"><span>Reference</span><strong>${escapeHtml(payload.paymentReference)}</strong></div>` : ''}
        <div class="row"><span>Amount paid</span><strong>${escapeHtml(money(payload.amountPaid ?? payload.total))}</strong></div>
        ${payload.change !== undefined ? `<div class="row"><span>Change</span><strong>${escapeHtml(money(payload.change))}</strong></div>` : ''}
      `
      : ''

  const html = `<!doctype html>
    <html>
      <head>
        <meta charset="utf-8">
        <title>${escapeHtml(payload.title)}</title>
        <style>
          @page { size: 80mm auto; margin: 3mm; }
          * { box-sizing: border-box; }
          html, body { width: 74mm; margin: 0; padding: 0; }
          body { font: 13px/1.35 Arial, Helvetica, sans-serif; color: #111; }
          .receipt { width: 100%; margin: 0 auto; overflow-wrap: anywhere; }
          h1 { font-size: 19px; line-height: 1.2; text-align: center; margin: 0 0 5px; }
          .center { text-align: center; }
          .muted { color: #333; }
          .rule { border-top: 1px dashed #333; margin: 7px 0; }
          .row { display: flex; justify-content: space-between; align-items: flex-start; gap: 7px; margin: 4px 0; }
          .row span { flex: 1 1 auto; }
          .row strong { flex: 0 1 auto; text-align: right; overflow-wrap: anywhere; }
          table { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 11px; }
          th, td { padding: 4px 1px; border-bottom: 1px solid #ddd; text-align: left; vertical-align: top; overflow-wrap: anywhere; }
          th { border-bottom: 1px solid #111; }
          th:first-child, td:first-child { width: 70%; }
          th:nth-child(2), td:nth-child(2) { width: 12%; }
          th:nth-child(3), td:nth-child(3) { width: 18%; }
          .number { text-align: right; white-space: normal; }
          .total { font-size: 16px; font-weight: bold; margin-top: 6px; }
          .status { text-align: center; font-weight: bold; margin-top: 9px; }
          .footer { text-align: center; margin-top: 10px; font-size: 11px; }
          @media print {
            html, body { width: 74mm; }
            body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          }
        </style>
      </head>
      <body>
        <main class="receipt">
          <h1>${escapeHtml(payload.businessName || 'Restaurant')}</h1>
          <div class="center">${escapeHtml(payload.title)}</div>
          <div class="center muted">${escapeHtml(payload.location || '')}</div>
          ${payload.receiptNumber ? `<div class="center">Receipt: ${escapeHtml(payload.receiptNumber)}</div>` : ''}
          <div class="row"><span>Cashier</span><strong>${escapeHtml(payload.cashier || 'Cashier')}</strong></div>
          <div class="row"><span>Date</span><strong>${escapeHtml(new Date().toLocaleString())}</strong></div>
          <div class="rule"></div>
          <table>
            <thead><tr><th>Item</th><th class="number">Qty</th><th class="number">Amount</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
          <div class="rule"></div>
          <div class="row"><span>Subtotal</span><strong>${escapeHtml(money(payload.subtotal))}</strong></div>
          <div class="row"><span>Discount</span><strong>${escapeHtml(money(payload.discount))}</strong></div>
          <div class="row total"><span>Total</span><strong>${escapeHtml(money(payload.total))}</strong></div>
          ${paymentDetails}
          <div class="status">${payload.status === 'paid' ? 'PAID' : 'UNPAID — ORDER SLIP'}</div>
          <div class="footer">Thank you</div>
        </main>
      </body>
    </html>`

  const iframe = document.createElement('iframe')
  iframe.setAttribute('aria-hidden', 'true')
  iframe.title = 'Print document'
  iframe.style.position = 'fixed'
  iframe.style.right = '0'
  iframe.style.bottom = '0'
  iframe.style.width = '0'
  iframe.style.height = '0'
  iframe.style.border = '0'
  document.body.appendChild(iframe)

  try {
    const printDocument = iframe.contentWindow?.document
    const printWindow = iframe.contentWindow
    if (!printDocument || !printWindow) {
      iframe.remove()
      return false
    }

    printDocument.open()
    printDocument.write(html)
    printDocument.close()

    await new Promise<void>((resolve) => {
      if (printDocument.readyState === 'complete') {
        resolve()
      } else {
        iframe.onload = () => resolve()
      }
    })

    printWindow.focus()
    printWindow.print()

    // Keep the iframe alive while the print dialog is open.
    printWindow.onafterprint = () => iframe.remove()
    window.setTimeout(() => iframe.remove(), 60000)
    return true
  } catch {
    iframe.remove()
    return false
  }
}


/**
 * Legacy Print Bridge entry point retained for retail checkout compatibility.
 * Restaurant checkout uses browserPrint directly.
 */
export async function directPrint(payload: DirectPrintPayload): Promise<boolean> {
  const bridgeUrl =
    import.meta.env.VITE_PRINT_BRIDGE_URL || 'http://127.0.0.1:38100'

  try {
    const response = await fetch(`${bridgeUrl}/print`, {
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
