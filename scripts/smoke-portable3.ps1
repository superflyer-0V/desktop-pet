param([string]$Exe = "release\DesktopPet.exe")

$root = Split-Path $PSScriptRoot -Parent
Set-Location $root
$env:PET_USER_DATA = Join-Path $root ".user-data"

Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public class WinEnum2 {
  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc cb, IntPtr lParam);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int max);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
}
"@

$log = Join-Path $root "smoke-portable.log"
$proc = Start-Process -FilePath $Exe -ArgumentList "--enable-logging" -WorkingDirectory $root -RedirectStandardError $log -RedirectStandardOutput "$log.out" -PassThru

Start-Sleep -Seconds 20

$all = @()
$cb = {
  param($hWnd, $lParam)
  if ([WinEnum2]::IsWindowVisible($hWnd)) {
    $sb = New-Object System.Text.StringBuilder 512
    [WinEnum2]::GetWindowText($hWnd, $sb, 512) | Out-Null
    $t = $sb.ToString()
    if ($t.Trim()) { $script:all += $t }
  }
  return $true
}
[WinEnum2]::EnumWindows($cb, [IntPtr]::Zero) | Out-Null
Write-Host "--- visible windows ($($all.Count)) ---"
$all | Select-Object -First 60 | ForEach-Object { Write-Host "  $_" }

$apps = Get-Process -Name "DesktopPet" -ErrorAction SilentlyContinue
Write-Host "app_processes=$($apps.Count)"
$apps | ForEach-Object { Write-Host ("  pid={0} handle={1}" -f $_.Id, $_.MainWindowHandle) }

if (-not $proc.HasExited) { Stop-Process -Id $proc.Id -Force }
Get-Process -Name "DesktopPet" -ErrorAction SilentlyContinue | Stop-Process -Force
Write-Host "done"
