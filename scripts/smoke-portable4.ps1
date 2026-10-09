param([string]$Exe = "release\DesktopPet.exe")

$root = Split-Path $PSScriptRoot -Parent
Set-Location $root
$env:PET_USER_DATA = Join-Path $root ".user-data"

Get-Process -Name "DesktopPet" -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 2

$log = Join-Path $root "smoke-p4.log"
$logOut = Join-Path $root "smoke-p4.out.log"
Remove-Item $log, $logOut, (Join-Path $root "smoke-p4.png") -Force -ErrorAction SilentlyContinue

$exePath = (Resolve-Path $Exe).Path
$proc = Start-Process -FilePath $exePath -ArgumentList "--enable-logging" -WorkingDirectory $root -RedirectStandardError $log -RedirectStandardOutput $logOut -PassThru
Write-Host "launched pid=$($proc.Id)"

Start-Sleep -Seconds 15

Write-Host "=== processes ==="
$apps = Get-Process -Name "DesktopPet" -ErrorAction SilentlyContinue
Write-Host "app_processes=$($apps.Count)"
$apps | ForEach-Object {
  Write-Host ("  pid={0} hwnd={1} title='{2}' respond={3}" -f $_.Id, $_.MainWindowHandle, $_.MainWindowTitle, $_.Responding)
}

Write-Host "=== all visible windows (with owner pid) ==="
Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public class WinEnum4 {
  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc cb, IntPtr lParam);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int max);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
}
"@ -ErrorAction SilentlyContinue

$all = @()
$cb = {
  param($hWnd, $lParam)
  if ([WinEnum4]::IsWindowVisible($hWnd)) {
    $sb = New-Object System.Text.StringBuilder 512
    [WinEnum4]::GetWindowText($hWnd, $sb, 512) | Out-Null
    $t = $sb.ToString().Trim()
    [uint32]$owner = 0
    [WinEnum4]::GetWindowThreadProcessId($hWnd, [ref]$owner) | Out-Null
    if ($t) { $script:all += ("[pid {0}] {1}" -f $owner, $t) }
  }
  return $true
}
[WinEnum4]::EnumWindows($cb, [IntPtr]::Zero) | Out-Null
Write-Host "visible_count=$($all.Count)"
$all | Select-Object -First 40 | ForEach-Object { Write-Host "  $_" }

Write-Host "=== stderr tail ==="
if (Test-Path $log) {
  $sz = (Get-Item $log).Length
  Write-Host "stderr_bytes=$sz"
  if ($sz -gt 0) { Get-Content $log -Tail 80 }
} else { Write-Host "  (no stderr file)" }

Write-Host "=== stdout tail ==="
if (Test-Path $logOut) {
  $sz = (Get-Item $logOut).Length
  Write-Host "stdout_bytes=$sz"
  if ($sz -gt 0) { Get-Content $logOut -Tail 40 }
} else { Write-Host "  (no stdout file)" }

Write-Host "=== screenshot ==="
try {
  Add-Type -AssemblyName System.Windows.Forms
  Add-Type -AssemblyName System.Drawing
  $b = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
  $bmp = New-Object System.Drawing.Bitmap($b.Width, $b.Height)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.CopyFromScreen($b.Location, [System.Drawing.Point]::Empty, $b.Size)
  $bmp.Save((Join-Path $root "smoke-p4.png"), [System.Drawing.Imaging.ImageFormat]::Png)
  Write-Host "  saved smoke-p4.png"
} catch { Write-Host "  screenshot failed: $_" }

if (-not $proc.HasExited) { Stop-Process -Id $proc.Id -Force }
Get-Process -Name "DesktopPet" -ErrorAction SilentlyContinue | Stop-Process -Force
Write-Host "done"
