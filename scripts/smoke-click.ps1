param([string]$Exe = "release\win-unpacked\DesktopPet.exe")

$root = Split-Path $PSScriptRoot -Parent
Set-Location $root

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

Add-Type @"
using System;
using System.Runtime.InteropServices;
public class MouseSim {
  [DllImport("user32.dll")] public static extern void mouse_event(uint flags, uint dx, uint dy, uint data, UIntPtr extra);
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
}
"@

function ClickAt($x, $y) {
  [MouseSim]::SetCursorPos($x, $y) | Out-Null
  Start-Sleep -Milliseconds 500   # 让 pointermove 触发 grab
  [MouseSim]::mouse_event(0x0002, 0, 0, 0, [UIntPtr]::Zero)  # left down
  Start-Sleep -Milliseconds 80
  [MouseSim]::mouse_event(0x0004, 0, 0, 0, [UIntPtr]::Zero)  # left up
}

function Screenshot($path) {
  $b = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
  $bmp = New-Object System.Drawing.Bitmap($b.Width, $b.Height)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.CopyFromScreen($b.Location, [System.Drawing.Point]::Empty, $b.Size)
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
}

Get-Process -Name "DesktopPet" -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep 2

$exePath = (Resolve-Path $Exe).Path
$p = Start-Process -FilePath $exePath -PassThru
Start-Sleep 10

$wa = [System.Windows.Forms.Screen]::PrimaryScreen.WorkingArea
Write-Host "workarea=$($wa.Width)x$($wa.Height) @ ($($wa.X),$($wa.Y))"

# 窗口位置：workArea 右下角向内 520/600，窗口 480x560
$winX = $wa.X + $wa.Width - 520
$winY = $wa.Y + $wa.Height - 600
$cx = $winX + 240   # 窗口水平中心
Write-Host "window=($winX,$winY) 480x560"

# 点模型头部附近（窗口中心偏上）
$clickY = $winY + 150
Write-Host "click1 head=($cx,$clickY)"
Screenshot "$root\click-before.png"
ClickAt $cx $clickY
Start-Sleep 1
Screenshot "$root\click-after.png"

# 双击打开聊天框
ClickAt $cx $clickY
Start-Sleep -Milliseconds 120
ClickAt $cx $clickY
Start-Sleep 1
Screenshot "$root\click-double.png"

Get-Process -Name "DesktopPet" -ErrorAction SilentlyContinue | Stop-Process -Force
Write-Host "done"
