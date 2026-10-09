param([string]$Exe = "release\DesktopPet.exe")

$root = Split-Path $PSScriptRoot -Parent
Set-Location $root
$env:PET_USER_DATA = Join-Path $root ".user-data"

Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public class WinEnum {
  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc cb, IntPtr lParam);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int max);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
}
"@

$log = Join-Path $root "smoke-portable.log"
$proc = Start-Process -FilePath $Exe -ArgumentList "--enable-logging" -WorkingDirectory $root -RedirectStandardError $log -RedirectStandardOutput "$log.out" -PassThru

Start-Sleep -Seconds 20

$found = @()
$cb = {
  param($hWnd, $lParam)
  if ([WinEnum]::IsWindowVisible($hWnd)) {
    $sb = New-Object System.Text.StringBuilder 256
    [WinEnum]::GetWindowText($hWnd, $sb, 256) | Out-Null
    $title = $sb.ToString()
    if ($title -match "桌宠|DesktopPet|Pet") {
      $r = New-Object WinEnum+RECT
      [WinEnum]::GetWindowRect($hWnd, [ref]$r) | Out-Null
      $script:found += ("title=[{0}] rect=({1},{2})-({3},{4})" -f $title, $r.Left, $r.Top, $r.Right, $r.Bottom)
    }
  }
  return $true
}
[WinEnum]::EnumWindows($cb, [IntPtr]::Zero) | Out-Null
if ($found.Count -eq 0) { Write-Host "pet_window=NOT_FOUND" } else { $found | ForEach-Object { Write-Host "pet_window=$_" } }

$apps = Get-Process -Name "DesktopPet" -ErrorAction SilentlyContinue
Write-Host "app_processes=$($apps.Count)"
foreach ($p in $apps) { Write-Host ("  pid={0} title=[{1}]" -f $p.Id, $p.MainWindowTitle) }

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$b = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
$bmp = New-Object System.Drawing.Bitmap $b.Width, $b.Height
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($b.Location, [System.Drawing.Point]::Empty, $b.Size)
$bmp.Save((Join-Path $root "smoke-shot.png"))
$g.Dispose(); $bmp.Dispose()

if (-not $proc.HasExited) { Stop-Process -Id $proc.Id -Force }
Get-Process -Name "DesktopPet" -ErrorAction SilentlyContinue | Stop-Process -Force
Write-Host "done"
