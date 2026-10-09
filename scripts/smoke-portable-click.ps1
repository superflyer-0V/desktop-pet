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
public class PClick {
  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc cb, IntPtr lParam);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int max);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
  [DllImport("user32.dll")] public static extern void mouse_event(uint flags, uint dx, uint dy, uint data, UIntPtr extra);
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
}
"@

function MoveTo($x, $y) {
  [PClick]::SetCursorPos($x, $y) | Out-Null
  Start-Sleep -Milliseconds 500
}

function ClickNow() {
  [PClick]::mouse_event(0x0002, 0, 0, 0, [UIntPtr]::Zero)
  Start-Sleep -Milliseconds 60
  [PClick]::mouse_event(0x0004, 0, 0, 0, [UIntPtr]::Zero)
}

function Screenshot($path) {
  $b = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
  $bmp = New-Object System.Drawing.Bitmap($b.Width, $b.Height)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.CopyFromScreen($b.Location, [System.Drawing.Point]::Empty, $b.Size)
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
}

function Get-PetWindow {
  $pids = @(Get-Process -Name "DesktopPet" -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Id)
  $found = $null
  $cb = {
    param($hWnd, $lParam)
    if (-not [PClick]::IsWindowVisible($hWnd)) { return $true }
    [uint32]$owner = 0
    [PClick]::GetWindowThreadProcessId($hWnd, [ref]$owner) | Out-Null
    if ($pids -contains [int]$owner) {
      $script:found = $hWnd
      return $false
    }
    return $true
  }
  [PClick]::EnumWindows($cb, [IntPtr]::Zero) | Out-Null
  $script:found
}

Get-Process -Name "DesktopPet" -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 2

$log = Join-Path $root "portable-click-log.txt"
Remove-Item $log, (Join-Path $root "portable-click1.png"), (Join-Path $root "portable-click2.png") -Force -ErrorAction SilentlyContinue

$exePath = (Resolve-Path $Exe).Path
$proc = Start-Process -FilePath $exePath -ArgumentList "--enable-logging" -WorkingDirectory $root -RedirectStandardError $log -PassThru
Write-Host "launched stub pid=$($proc.Id), waiting window (stub unpacks 20-40s)..."

$hwnd = $null
for ($i = 0; $i -lt 60; $i++) {
  Start-Sleep -Seconds 2
  $hwnd = Get-PetWindow
  if ($hwnd) { break }
}
if (-not $hwnd) {
  Write-Host "FAIL: no DesktopPet window found after 120s"
  if (Test-Path $log) { Get-Content $log -Tail 40 }
  Get-Process -Name "DesktopPet" -ErrorAction SilentlyContinue | Stop-Process -Force
  exit 1
}
Write-Host "window hwnd=$hwnd"

$rect = New-Object PClick+RECT
[PClick]::GetWindowRect($hwnd, [ref]$rect) | Out-Null
$winX = $rect.Left; $winY = $rect.Top
$headX = $winX + 240; $headY = $winY + 150
Write-Host "window=($winX,$winY,$($rect.Right-$rect.Left)x$($rect.Bottom-$rect.Top)), head=($headX,$headY)"

# 多次单击尝试（模拟点击偶发漂移会被当成拖拽，重试提高命中率）
MoveTo $headX $headY
for ($i = 1; $i -le 5; $i++) {
  ClickNow
  Write-Host "single click attempt $i"
  Start-Sleep -Milliseconds 800
}
Start-Sleep -Seconds 1
Screenshot (Join-Path $root "portable-click1.png")
Write-Host "saved portable-click1.png"

# 双击尝试打开聊天
MoveTo $headX $headY
ClickNow
Start-Sleep -Milliseconds 120
ClickNow
Write-Host "double click sent"
Start-Sleep -Seconds 1
Screenshot (Join-Path $root "portable-click2.png")
Write-Host "saved portable-click2.png"

# 结束，输出渲染日志
Get-Process -Name "DesktopPet" -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 1
Write-Host "=== renderer log ==="
if (Test-Path $log) {
  $sz = (Get-Item $log).Length
  Write-Host "log_bytes=$sz"
  if ($sz -gt 0) {
    Select-String -Path $log -Pattern "playReaction|pointerdown|pointerup|click=|handleClick" | ForEach-Object { $_.Line }
  }
} else { Write-Host "(no stderr log file)" }
Write-Host "done"
