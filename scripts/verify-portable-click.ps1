param([string]$Exe = "release\DesktopPet.exe")

$root = Split-Path $PSScriptRoot -Parent
Set-Location $root
$env:PET_USER_DATA = Join-Path $root ".user-data"

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public class VClick {
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
  [VClick]::SendMessage($hwnd, 0x0201, [IntPtr]1, $lp) | Out-Null  # WM_LBUTTONDOWN, MK_LBUTTON
  Start-Sleep -Milliseconds 80
  [VClick]::SendMessage($hwnd, 0x0202, [IntPtr]0, $lp) | Out-Null  # WM_LBUTTONUP
}

function Get-PetWindow {
  $pids = @(Get-Process -Name "DesktopPet" -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Id)
  $found = $null
  $cb = {
    param($hWnd, $lParam)
    if (-not [VClick]::IsWindowVisible($hWnd)) { return $true }
    [uint32]$owner = 0
    [VClick]::GetWindowThreadProcessId($hWnd, [ref]$owner) | Out-Null
    if ($pids -contains [int]$owner) { $script:found = $hWnd; return $false }
    return $true
  }
  [VClick]::EnumWindows($cb, [IntPtr]::Zero) | Out-Null
  $script:found
}

Get-Process -Name "DesktopPet" -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 2

$exePath = (Resolve-Path $Exe).Path
$proc = Start-Process -FilePath $exePath -ArgumentList "--enable-logging" -WorkingDirectory $root -PassThru
Write-Host "launched stub pid=$($proc.Id), waiting window..."

$hwnd = $null
for ($i = 0; $i -lt 60; $i++) {
  Start-Sleep -Seconds 2
  $hwnd = Get-PetWindow
  if ($hwnd) { break }
}
if (-not $hwnd) { Write-Host "FAIL: no window"; exit 1 }
Write-Host "window hwnd=$hwnd"

# 校验绿色版内部 bundle 是否与修复后一致
$apps = Get-Process -Name "DesktopPet" -ErrorAction SilentlyContinue
$innerBundle = $null
foreach ($a in $apps) {
  $p = $a.Path
  if ($p -and (Test-Path $p)) {
    $cand = Join-Path (Split-Path $p -Parent) "resources\app\renderer\bundle.js"
    if (Test-Path $cand) { $innerBundle = $cand; break }
  }
}
if ($innerBundle) {
  $h1 = (Get-FileHash $innerBundle -Algorithm SHA256).Hash
  $h2 = (Get-FileHash (Join-Path $root "renderer\bundle.js") -Algorithm SHA256).Hash
  Write-Host "inner_bundle=$(Split-Path (Split-Path (Split-Path (Split-Path $innerBundle -Parent) -Parent) -Parent) -Parent)"
  Write-Host "bundle_hash_match=$($h1 -eq $h2)"
} else {
  Write-Host "inner_bundle=NOT_FOUND"
}

$rect = New-Object VClick+RECT
[VClick]::GetWindowRect($hwnd, [ref]$rect) | Out-Null
$winX = $rect.Left; $winY = $rect.Top
Write-Host "window=($winX,$winY)"

# 光标移到头部使窗口解除鼠标穿透，再用 SendMessage 定点点击（无漂移）
[VClick]::SetCursorPos($winX + 240, $winY + 150) | Out-Null
Start-Sleep -Milliseconds 800

SendClick $hwnd 240 150
Start-Sleep -Milliseconds 600
SendClick $hwnd 240 150
Write-Host "2 single clicks sent at (240,150) via SendMessage"
Start-Sleep -Seconds 1

$b = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
$bmp = New-Object System.Drawing.Bitmap($b.Width, $b.Height)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($b.Location, [System.Drawing.Point]::Empty, $b.Size)
$bmp.Save((Join-Path $root "verify-click.png"), [System.Drawing.Imaging.ImageFormat]::Png)
Write-Host "saved verify-click.png"

# 双击打开聊天
SendClick $hwnd 240 150
Start-Sleep -Milliseconds 100
SendClick $hwnd 240 150
Write-Host "double click sent"
Start-Sleep -Seconds 1
$bmp2 = New-Object System.Drawing.Bitmap($b.Width, $b.Height)
$g2 = [System.Drawing.Graphics]::FromImage($bmp2)
$g2.CopyFromScreen($b.Location, [System.Drawing.Point]::Empty, $b.Size)
$bmp2.Save((Join-Path $root "verify-double.png"), [System.Drawing.Imaging.ImageFormat]::Png)
Write-Host "saved verify-double.png"

Get-Process -Name "DesktopPet" -ErrorAction SilentlyContinue | Stop-Process -Force
Write-Host "done"
