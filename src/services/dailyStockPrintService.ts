export type StockListPrintItem = {
  name: string
  quantity: string
}

const escapeHtml = (value: string) =>
  value.replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')


export function browserPrintStockList80mm(
  businessName: string,
  items: StockListPrintItem[],
): boolean {
  const popup = window.open('', '_blank')
  if (!popup) return false

  const escapeHtml = (value: string) =>
    value.replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')

  const rows = items.map((item, index) =>
    '<div class="item">' +
      '<div class="name">' + (index + 1) + '. ' +
      escapeHtml(item.name) + '</div>' +
      '<div class="qty">' + escapeHtml(item.quantity) + '</div>' +
    '</div>'
  ).join('')

  popup.document.open()
  popup.document.write(
    '<!doctype html><html><head><meta charset="utf-8">' +
    '<title>Daily Stock - Thermal</title><style>' +
    '@page{size:80mm auto;margin:3mm}' +
    '*{box-sizing:border-box}' +
    'html,body{width:74mm;margin:0;padding:0}' +
    'body{font:12px/1.35 Arial,Helvetica,sans-serif;color:#000}' +
    '.header{text-align:center;border-bottom:1px dashed #000;' +
    'padding-bottom:8px;margin-bottom:8px}' +
    'h1{font-size:16px;margin:0 0 5px;overflow-wrap:anywhere}' +
    'h2{font-size:13px;margin:0 0 5px}' +
    '.date{font-size:10px}' +
    '.item{padding:5px 0;border-bottom:1px dashed #aaa;' +
    'break-inside:avoid}' +
    '.name{font-weight:600;overflow-wrap:anywhere}' +
    '.qty{text-align:right;font-size:11px;margin-top:2px}' +
    '.footer{text-align:center;font-size:10px;margin-top:10px}' +
    '</style></head><body>' +
    '<header class="header"><h1>' +
    escapeHtml(businessName || 'Shop') +
    '</h1><h2>DAILY STOCK LIST</h2><div class="date">Printed: ' +
    escapeHtml(new Date().toLocaleString()) +
    '</div><div class="date">Products: ' + items.length +
    '</div></header>' + rows +
    '<footer class="footer">End of stock list</footer>' +
    '<script>window.onload=function(){window.focus();window.print()}</script>' +
    '</body></html>'
  )
  popup.document.close()

  return true
}

export function browserPrintStockList(
  businessName: string,
  items: StockListPrintItem[],
): boolean {
  const popup = window.open('', '_blank')
  if (!popup) return false

  const rows = items.map((item, index) =>
    '<tr><td class="number">' + (index + 1) + '</td><td>' +
    escapeHtml(item.name) + '</td><td class="quantity">' +
    escapeHtml(item.quantity) + '</td></tr>'
  ).join('')

  popup.document.open()
  popup.document.write(
    '<!doctype html><html><head><meta charset="utf-8">' +
    '<title>Daily Stock List</title><style>' +
    '@page{size:A4;margin:12mm}' +
    '*{box-sizing:border-box}' +
    'body{font:12px/1.45 Arial,Helvetica,sans-serif;color:#111}' +
    '.heading{text-align:center;border-bottom:2px solid #111;padding-bottom:12px;margin-bottom:18px}' +
    'h1{font-size:22px;margin:0 0 5px;overflow-wrap:anywhere}' +
    'h2{font-size:14px;letter-spacing:1px;margin:0 0 7px}' +
    '.date{font-size:11px;color:#444}' +
    'table{width:100%;border-collapse:collapse;table-layout:fixed}' +
    'th,td{border:1px solid #aaa;padding:9px 8px;text-align:left;overflow-wrap:anywhere}' +
    'th{background:#eee;font-size:11px;text-transform:uppercase}' +
    'th:first-child,td:first-child{width:9%;text-align:center}' +
    'th:nth-child(2),td:nth-child(2){width:66%}' +
    'th:last-child,td:last-child{width:25%;text-align:right}' +
    'tbody tr:nth-child(even){background:#f7f7f7}' +
    'thead{display:table-header-group}' +
    'tr{break-inside:avoid}' +
    '@media print{body{print-color-adjust:exact;-webkit-print-color-adjust:exact}}' +
    '</style></head><body><header class="heading">' +
    '<h1>' + escapeHtml(businessName || 'Shop') + '</h1>' +
    '<h2>DAILY STOCK LIST</h2><div class="date">Printed: ' +
    escapeHtml(new Date().toLocaleString()) +
    '</div></header><table><thead><tr><th>No.</th>' +
    '<th>Product name</th><th>Current quantity</th></tr></thead><tbody>' +
    rows + '</tbody></table></body></html>'
  )
  popup.document.close()

  popup.onload = () => {
    popup.focus()
    popup.print()
  }

  return true
}