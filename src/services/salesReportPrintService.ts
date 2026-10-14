
export type SalesReportPrintData = {
  businessName: string
  title: string
  period: string
  transactions: Array<{
    date: string
    receiptNumber: string
    cashierName: string
    total: number
    paymentMethod: string
    status: string
  }>
  totalSales: number
cashTotal: number
cashSalesTotal: number
potentialCashChange: number
mpesaTotal: number
otherPaymentTotal: number
}

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

const money = (value: number) =>
  `KES ${value.toLocaleString('en-KE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`

const openPrintWindow = (
  data: SalesReportPrintData,
  format: 'a4' | '80mm',
): boolean => {
  const popup = window.open('', '_blank')
  if (!popup) return false

  const thermal = format === '80mm'

  const rows = data.transactions
    .map((sale, index) =>
      thermal
        ? `<div class="item">
            <strong>${index + 1}. ${escapeHtml(sale.receiptNumber)}</strong>
            <div>${escapeHtml(sale.date)}</div>
            <div>${escapeHtml(sale.cashierName)}</div>
            <div>Payment: ${escapeHtml(sale.paymentMethod)}</div>
            <div>Status: ${escapeHtml(sale.status)}</div>
            <div class="amount">${money(sale.total)}</div>
          </div>`
        : `<tr>
            <td>${index + 1}</td>
            <td>${escapeHtml(sale.date)}</td>
            <td>${escapeHtml(sale.receiptNumber)}</td>
            <td>${escapeHtml(sale.cashierName)}</td>
            <td>${escapeHtml(sale.paymentMethod)}</td>
            <td>${escapeHtml(sale.status)}</td>
            <td class="amount">${money(sale.total)}</td>
          </tr>`,
    )
    .join('')

  const content = thermal
    ? `<div class="summary">
        <div>Total sales</div><strong>${money(data.totalSales)}</strong>
        <div>Cash sales</div><strong>${money(data.cashSalesTotal)}</strong>
<div>Cash received</div><strong>${money(data.cashTotal)}</strong>
<div>Potential change</div><strong>${money(data.potentialCashChange)}</strong>
        <div>M-Pesa</div><strong>${money(data.mpesaTotal)}</strong>
        <div>Other payments</div><strong>${money(data.otherPaymentTotal)}</strong>
      </div>${rows}`
    : `<div class="summary">
        <div>Total sales</div><strong>${money(data.totalSales)}</strong>
        <div>Cash sales</div><strong>${money(data.cashSalesTotal)}</strong>
        <div>Cash received</div><strong>${money(data.cashTotal)}</strong>
        <div>Potential change</div><strong>${money(data.potentialCashChange)}</strong>
        <div>M-Pesa received</div><strong>${money(data.mpesaTotal)}</strong>
        <div>Other payments</div><strong>${money(data.otherPaymentTotal)}</strong>
      </div>
      <table>
        <thead><tr>
          <th>No.</th><th>Date</th><th>Receipt</th><th>Cashier</th>
          <th>Payment</th><th>Status</th><th>Total</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>`

  popup.document.open()
  popup.document.write(
    `<!doctype html><html><head><meta charset="utf-8">
    <title>${escapeHtml(data.title)}</title>
    <style>
     @page {
        size: ${thermal ? '80mm auto' : 'A4'};
        margin: ${thermal ? '2mm' : '12mm'};
      }

      * { box-sizing: border-box }

      html, body {
        margin: 0;
        padding: 0;
      }

      body {
        font: ${thermal ? '10px' : '10px'}/1.3 Arial, sans-serif;
        color: #111;
        width: ${thermal ? '74mm' : '100%'};
        margin: 0 auto;
      }

      header {
        text-align: center;
        border-bottom: 1px dashed #777;
        padding-bottom: ${thermal ? '5px' : '10px'};
        margin-bottom: ${thermal ? '6px' : '12px'};
        overflow-wrap: anywhere;
      }

      h1 {
        font-size: ${thermal ? '14px' : '22px'};
        margin: 0 0 4px;
      }

      h2 {
        font-size: ${thermal ? '11px' : '15px'};
        margin: 0 0 4px;
      }

      p { margin: 2px 0 }

      .summary {
        display: grid;
        grid-template-columns: 1fr auto;
        gap: ${thermal ? '3px' : '6px'};
        padding: ${thermal ? '5px 0' : '10px 0'};
        border-bottom: 1px dashed #777;
        margin-bottom: ${thermal ? '6px' : '10px'};
      }

      .item {
        border-bottom: 1px dashed #777;
        padding: ${thermal ? '3px 0' : '3px 0'};
        line-height: 1.2;
        break-inside: avoid;
        page-break-inside: avoid;
      }

      .amount { text-align: right; font-weight: bold }

      table {
        width: 100%;
        border-collapse: collapse;
        table-layout: auto;
      }

      th, td {
        border: 1px solid #bbb;
        padding: 6px 4px;
        text-align: left;
        overflow-wrap: anywhere;
      }

      th { background: #eee }
      td:last-child, th:last-child { text-align: right }

      footer {
        text-align: center;
        margin-top: ${thermal ? '6px' : '12px'};
        font-size: ${thermal ? '9px' : '10px'};
      }

      thead { display: table-header-group }
      tr { break-inside: avoid; page-break-inside: avoid }

      @media print {
        body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      }
    </style></head><body>
      <header>
        <h1>${escapeHtml(data.businessName || 'Shop')}</h1>
        <h2>${escapeHtml(data.title)}</h2>
        <p>${escapeHtml(data.period)}</p>
        <p>Printed: ${escapeHtml(new Date().toLocaleString())}</p>
        <p>Transactions: ${data.transactions.length}</p>
      </header>
      ${content}
      <footer>End of sales report</footer>
      <script>window.onload = () => { window.focus(); window.print() }</script>
    </body></html>`,
  )
  popup.document.close()

  return true
}

export const browserPrintSalesReportA4 = (
  data: SalesReportPrintData,
) => openPrintWindow(data, 'a4')

export const browserPrintSalesReport80mm = (
  data: SalesReportPrintData,
) => openPrintWindow(data, '80mm')
