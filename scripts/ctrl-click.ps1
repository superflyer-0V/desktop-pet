param([string]$Exe = "release\win-unpacked\DesktopPet.exe", [string]$Tag = "dir")

$root = Split-Path $PSScriptRoot -Parent
Set-Location $root
$env:PET_USER_DATA = Join-Path $root ".user-data"

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

Add-Type @"
using System;
using System.Runtime.InteropServices;
public class CClick {
  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc cb, IntPtr lParam);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
  [DllImport("user32.dll")] public static extern IntPtr SendMessage(IntPtr hWnd, uint msg, IntPtr wParam, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
}
"@

function SendClick($hwnd, $clientX, $clientY) {
  $lp = [IntPtr]((($clientY -band 0xFFFF) -shl 16) -bor ($clientX -band 0xFFFF))
  [CClick]::SendMessage($hwnd, 0x0201, [IntPtr]1, $lp) | Out-Null
  Start-Sleep -Milliseconds 80
  [CClick]::SendMessage($hwnd, 0x0202, [IntPtr]0, $lp) | Out-Null
}

function Get-PetWindow {
  $pids = @(Get-Process -Name "DesktopPet" -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Id)
  $found = $null
  $cb = {
    param($hWnd, $lParam)
    if (-not [CClick]::IsWindowVisible($hWnd)) { return $true }
    [uint32]$owner = 0
    [CClick]::GetWindowThreadProcessId($hWnd, [ref]$owner) | Out-Null
    if ($pids -contains [int]$owner) { $script:found = $hWnd; return $false }
    return $true
  }
  [CClick]::EnumWindows($cb, [IntPtr]::Zero) | Out-Null
  $script:found
}

Get-Process -Name "DesktopPet" -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 2

$exePath = (Resolve-Path $Exe).Path
Start-Process -FilePath $exePath -ArgumentList "--enable-logging" -WorkingDirectory $root | Out-Null

$hwnd = $null
for ($i = 0; $i -lt 30; $i++) {
  Start-Sleep -Seconds 2
  $hwnd = Get-PetWindow
  if ($hwnd) { break }
}
if (-not $hwnd) { Write-Host "FAIL: no window"; exit 1 }
Write-Host "window hwnd=$hwnd"

# 打印所有 DesktopPet 进程路径，用于定位绿色版解压目录 / 校验 bundle
Get-Process -Name "DesktopPet" -ErrorAction SilentlyContinue | ForEach-Object {
  Write-Host "proc pid=$($_.Id) path=$($_.Path)"
  if ($_.Path) {
    $cand = Join-Path (Split-Path $_.Path -Parent) "resources\app\renderer\bundle.js"
    if (Test-Path $cand) {
      $h1 = (Get-FileHash $cand -Algorithm SHA256).Hash
      $h2 = (Get-FileHash (Join-Path $root "renderer\bundle.js") -Algorithm SHA256).Hash
      Write-Host "  inner_bundle=$cand hash_match=$($h1 -eq $h2)"
    }
  }
}

$rect = New-Object CClick+RECT
[CClick]::GetWindowRect($hwnd, [ref]$rect) | Out-Null
$winX = $rect.Left; $winY = $rect.Top
Write-Host "window=($winX,$winY)"

[CClick]::SetCursorPos($winX + 240, $winY + 150) | Out-Null
Start-Sleep -Milliseconds 800

SendClick $hwnd 240 150
Start-Sleep -Milliseconds 600
SendClick $hwnd 240 150
Start-Sleep -Seconds 1
$b = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
$bmp = New-Object System.Drawing.Bitmap($b.Width, $b.Height)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($b.Location, [System.Drawing.Point]::Empty, $b.Size)
$bmp.Save((Join-Path $root "ctrl-$Tag-click.png"), [System.Drawing.Imaging.ImageFormat]::Png)
Write-Host "saved ctrl-$Tag-click.png"

Get-Process -Name "DesktopPet" -ErrorAction SilentlyContinue | Stop-Process -Force
Write-Host "done"
