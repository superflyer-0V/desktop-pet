param([string]$Exe = "release\win-unpacked\DesktopPet.exe")

$root = Split-Path $PSScriptRoot -Parent
Set-Location $root

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

Add-Type @"
using System;
using System.Runtime.InteropServices;
public class MouseSim3 {
  [DllImport("user32.dll")] public static extern void mouse_event(uint flags, uint dx, uint dy, uint data, UIntPtr extra);
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
}
"@

function MoveTo($x, $y) { [MouseSim3]::SetCursorPos($x, $y) | Out-Null; Start-Sleep -Milliseconds 120 }

function PressDown() { [MouseSim3]::mouse_event(0x0002, 0, 0, 0, [UIntPtr]::Zero) }
function ReleaseUp() { [MouseSim3]::mouse_event(0x0004, 0, 0, 0, [UIntPtr]::Zero) }

function Screenshot($path) {
  $b = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
  $bmp = New-Object System.Drawing.Bitmap($b.Width, $b.Height)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.CopyFromScreen($b.Location, [System.Drawing.Point]::Empty, $b.Size)
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
}

# 1. 启动目录版（带日志）
Get-Process -Name "DesktopPet" -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep 2
$log = Join-Path $root "drag-log.txt"
Remove-Item $log -Force -ErrorAction SilentlyContinue
$exePath = (Resolve-Path $Exe).Path
$p = Start-Process -FilePath $exePath -ArgumentList "--enable-logging" -RedirectStandardError $log -PassThru
Write-Host "launched pid=$($p.Id), waiting render..."
Start-Sleep 12

$wa = [System.Windows.Forms.Screen]::PrimaryScreen.WorkingArea
$winX = $wa.X + $wa.Width - 520
$winY = $wa.Y + $wa.Height - 600
Write-Host "window=($winX,$winY)"

# 2. 在模型身体中部按下并向右下拖拽，每步截图
$sx = $winX + 240
$sy = $winY + 300
MoveTo $sx $sy
Start-Sleep 400
PressDown
Start-Sleep 150

$steps = 10
for ($i = 1; $i -le $steps; $i++) {
  $dx = [Math]::Round(30 * $i)
  $dy = [Math]::Round(20 * $i)
  MoveTo ($sx + $dx) ($sy + $dy)
  Screenshot (Join-Path $root ("drag-{0:d2}.png" -f $i))
}
ReleaseUp
Start-Sleep 500
Screenshot (Join-Path $root "drag-11-end.png")

# 3. 结束并输出日志
Get-Process -Name "DesktopPet" -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep 1
Write-Host "=== renderer log ==="
if (Test-Path $log) { Get-Content $log }
Write-Host "done"
