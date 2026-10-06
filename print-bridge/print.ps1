param(
  [Parameter(Mandatory=$true)][string]$PrinterName,
  [Parameter(Mandatory=$true)][string]$DataBase64
)

Add-Type @"
using System;
using System.Runtime.InteropServices;

public static class RawPrinter {
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
  public class DOCINFO {
    [MarshalAs(UnmanagedType.LPWStr)] public string pDocName;
    [MarshalAs(UnmanagedType.LPWStr)] public string pOutputFile;
    [MarshalAs(UnmanagedType.LPWStr)] public string pDataType;
  }

  [DllImport("winspool.drv", EntryPoint="OpenPrinterW", SetLastError=true, CharSet=CharSet.Unicode)]
  public static extern bool OpenPrinter(string pPrinterName, out IntPtr phPrinter, IntPtr pDefault);

  [DllImport("winspool.drv", SetLastError=true)]
  public static extern bool ClosePrinter(IntPtr hPrinter);

  [DllImport("winspool.drv", SetLastError=true, CharSet=CharSet.Unicode)]
  public static extern int StartDocPrinter(IntPtr hPrinter, int level, [In] DOCINFO di);

  [DllImport("winspool.drv", SetLastError=true)]
  public static extern bool EndDocPrinter(IntPtr hPrinter);

  [DllImport("winspool.drv", SetLastError=true)]
  public static extern int StartPagePrinter(IntPtr hPrinter);

  [DllImport("winspool.drv", SetLastError=true)]
  public static extern bool EndPagePrinter(IntPtr hPrinter);

  [DllImport("winspool.drv", SetLastError=true)]
  public static extern bool WritePrinter(IntPtr hPrinter, byte[] pBytes, int dwCount, out int dwWritten);
}
"@

$data = [Convert]::FromBase64String($DataBase64)
$handle = [IntPtr]::Zero

if (-not [RawPrinter]::OpenPrinter($PrinterName, [ref]$handle, [IntPtr]::Zero)) {
  throw "Unable to open printer '$PrinterName'. Windows error: $([Runtime.InteropServices.Marshal]::GetLastWin32Error())"
}

try {
  $doc = New-Object RawPrinter+DOCINFO
  $doc.pDocName = "JIUZE POS Receipt"
  $doc.pOutputFile = $null
  $doc.pDataType = "RAW"

  if ([RawPrinter]::StartDocPrinter($handle, 1, $doc) -eq 0) {
    throw "Unable to start printer document."
  }

  try {
    if (-not [RawPrinter]::StartPagePrinter($handle)) {
      throw "Unable to start printer page."
    }

    try {
      $written = 0
      if (-not [RawPrinter]::WritePrinter($handle, $data, $data.Length, [ref]$written)) {
        throw "Unable to write to printer."
      }
    }
    finally {
      [RawPrinter]::EndPagePrinter($handle) | Out-Null
    }
  }
  finally {
    [RawPrinter]::EndDocPrinter($handle) | Out-Null
  }
}
finally {
  [RawPrinter]::ClosePrinter($handle) | Out-Null
}

Write-Output "Printed $($data.Length) bytes to $PrinterName."
