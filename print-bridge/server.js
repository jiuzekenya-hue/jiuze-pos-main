import http from 'node:http'
import { execFile } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const PORT = Number(process.env.JIUZE_PRINT_PORT || 38100)
const PRINTER_NAME = process.env.JIUZE_PRINTER_NAME || 'POS-80C'
const ALLOWED_ORIGIN = process.env.JIUZE_ALLOWED_ORIGIN || ''

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const powershellScript = path.join(__dirname, 'print.ps1')

const send = (res, status, body) => {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': ALLOWED_ORIGIN || 'http://localhost:5173',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'no-store',
  })
  res.end(JSON.stringify(body))
}

const cleanText = (value, fallback = '') =>
  String(value ?? fallback).replace(/[^\\x20-\\x7E]/g, '').trim()

const money = (value) => `KES ${Number(value || 0).toFixed(2)}`
const qty = (value) => Number.isInteger(Number(value))
  ? String(value)
  : Number(value).toFixed(3).replace(/0+$/, '').replace(/\\.$/, '')

const line = (left, right, width = 48) => {
  const l = cleanText(left)
  const r = cleanText(right)
  if (l.length + r.length + 1 <= width) return l + ' '.repeat(width - l.length - r.length) + r
  const available = Math.max(1, width - r.length - 1)
  return l.slice(0, available) + ' '.repeat(width - Math.min(r.length, width - available - 1)) + r.slice(0, width - available - 1)
}

function buildEscPos(payload) {
  const out = []
  const push = (value) => out.push(Buffer.from(value, 'ascii'))
  const raw = (bytes) => out.push(Buffer.from(bytes))

  raw([0x1b, 0x40])
  raw([0x1b, 0x61, 0x01])
  raw([0x1b, 0x45, 0x01])
  push(cleanText(payload.businessName, 'JIUZE POS') + '\n')
  raw([0x1b, 0x45, 0x00])
  push(cleanText(payload.title, 'ORDER SLIP') + '\n')
  push(payload.status === 'unpaid' ? 'NOT PAID\n' : 'PAID\n')
  if (payload.receiptNumber) push(cleanText(payload.receiptNumber) + '\n')
  if (payload.cashier) push('Cashier: ' + cleanText(payload.cashier) + '\n')
  push('\n')
  raw([0x1b, 0x61, 0x00])

  for (const item of payload.items || []) {
    push(cleanText(item.name) + '\n')
    push(line(`${qty(item.quantity)} x ${money(item.unitPrice)}`, money(item.lineTotal)) + '\n')
  }

  push('-----------------------------------------------\n')
  push(line('Subtotal', money(payload.subtotal)) + '\n')
  if (Number(payload.discount || 0) > 0) push(line('Discount', money(payload.discount)) + '\n')
  raw([0x1b, 0x45, 0x01])
  push(line(payload.status === 'unpaid' ? 'AMOUNT DUE' : 'TOTAL', money(payload.total)) + '\n')
  raw([0x1b, 0x45, 0x00])

  if (payload.status === 'paid') {
    push(line('Payment', cleanText(payload.paymentMethod).toUpperCase()) + '\n')
    if (payload.paymentReference) push('Reference: ' + cleanText(payload.paymentReference) + '\n')
    push(line('Paid', money(payload.amountPaid)) + '\n')
    push(line('Change', money(payload.change)) + '\n')
  } else {
    push('\nPresent this slip when making payment.\n')
  }

  raw([0x1b, 0x61, 0x01])
  push('\nThank you.\n\n')
  raw([0x1d, 0x56, 0x00])
  return Buffer.concat(out)
}

const handlePrint = (payload, res) => {
  if (!payload || !Array.isArray(payload.items) || payload.items.length === 0) {
    return send(res, 400, { ok: false, error: 'Receipt items are required.' })
  }

  const data = buildEscPos(payload)
  const encoded = data.toString('base64')

  execFile('powershell.exe', [
    '-NoProfile',
    '-ExecutionPolicy', 'Bypass',
    '-File', powershellScript,
    '-PrinterName', PRINTER_NAME,
    '-DataBase64', encoded,
  ], { windowsHide: true, timeout: 15000 }, (error, stdout, stderr) => {
    if (error) {
      console.error(stderr || error.message)
      return send(res, 500, { ok: false, error: stderr?.trim() || error.message })
    }
    console.log(stdout.trim() || `Printed to ${PRINTER_NAME}`)
    return send(res, 200, { ok: true, printer: PRINTER_NAME })
  })
}

const server = http.createServer((req, res) => {
  const origin = req.headers.origin || ''
  const allowed = ALLOWED_ORIGIN
    ? origin === ALLOWED_ORIGIN
    : origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')

  if (req.method === 'OPTIONS') {
    if (!allowed) return send(res, 403, { ok: false, error: 'Origin not allowed.' })
    res.writeHead(204, {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    })
    return res.end()
  }

  if (!allowed) return send(res, 403, { ok: false, error: 'Origin not allowed.' })

  if (req.method === 'GET' && req.url === '/health') {
    return send(res, 200, { ok: true, printer: PRINTER_NAME })
  }

  if (req.method === 'POST' && req.url === '/print') {
    let body = ''
    req.on('data', chunk => {
      body += chunk
      if (body.length > 200000) req.destroy()
    })
    req.on('end', () => {
      try {
        handlePrint(JSON.parse(body), res)
      } catch {
        send(res, 400, { ok: false, error: 'Invalid JSON payload.' })
      }
    })
    return
  }

  return send(res, 404, { ok: false, error: 'Not found.' })
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`JIUZE Print Bridge listening on http://127.0.0.1:${PORT}`)
  console.log(`Printer: ${PRINTER_NAME}`)
})
