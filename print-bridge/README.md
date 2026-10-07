# JIUZE Windows Thermal Print Bridge

Local Windows service for direct ESC/POS printing to the XP-80C/POS-80C through the Windows print spooler.

## Requirements

- Windows computer
- XP-80C already installed and working
- Node.js 20+ installed
- The Windows printer name (default: `POS-80C`)

## Run

From the project root:

```powershell
cd print-bridge
$env:JIUZE_PRINTER_NAME="POS-80C"
$env:JIUZE_ALLOWED_ORIGIN="http://localhost:5173"
node server.js
```

For the deployed POS, set `JIUZE_ALLOWED_ORIGIN` to the exact POS origin, for example:

```powershell
$env:JIUZE_ALLOWED_ORIGIN="https://your-pos-domain.example"
node server.js
```

Check:

```
http://127.0.0.1:38100/health
```

The bridge listens only on 127.0.0.1, so it is not exposed to the local network.

## What it does

The POS sends structured receipt data to `POST /print`. The bridge converts it to ESC/POS, then sends RAW bytes through Windows Print Spooler to the selected printer.

The printer can cut the receipt because the bridge sends the ESC/POS full-cut command.

If the bridge is unavailable, JIUZE POS can continue using browser printing as a fallback.

## Windows printer name

If `POS-80C` is not the exact installed printer name, run:

```powershell
Get-Printer | Select-Object Name
```

Then use the exact name in `JIUZE_PRINTER_NAME`.
