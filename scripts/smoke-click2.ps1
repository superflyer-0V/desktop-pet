param([string]$Exe = "release\win-unpacked\DesktopPet.exe")

$root = Split-Path $PSScriptRoot -Parent
Set-Location $root

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

Add-Type @"
using System;
using System.Runtime.InteropServices;
public class MouseSim2 {
  [DllImport("user32.dll")] public static extern void mouse_event(uint flags, uint dx, uint dy, uint data, UIntPtr extra);
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
}
"@

function MoveTo($x, $y) {
  [MouseSim2]::SetCursorPos($x, $y) | Out-Null
  Start-Sleep -Milliseconds 600
}

function ClickNow() {
  [MouseSim2]::mouse_event(0x0002, 0, 0, 0, [UIntPtr]::Zero)  # left down
  Start-Sleep -Milliseconds 80
  [MouseSim2]::mouse_event(0x0004, 0, 0, 0, [UIntPtr]::Zero)  # left up
}

function Screenshot($path) {
  $b = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
  $bmp = New-Object System.Drawing.Bitmap($b.Width, $b.Height)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.CopyFromScreen($b.Location, [System.Drawing.Point]::Empty, $b.Size)
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
}

# 1. 构建新 bundle
Push-Location $root
& npm run build 2>&1 | Out-Null
Pop-Location
Write-Host "bundle rebuilt"

# 2. 复制到目录版
Copy-Item "$root\renderer\bundle.js" "$root\release\win-unpacked\resources\app\renderer\bundle.js" -Force
Write-Host "bundle copied to win-unpacked"

# 3. 启动目录版（带日志）
Get-Process -Name "DesktopPet" -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep 2
$log = Join-Path $root "click-log.txt"
Remove-Item $log -Force -ErrorAction SilentlyContinue
$exePath = (Resolve-Path $Exe).Path
$p = Start-Process -FilePath $exePath -ArgumentList "--enable-logging" -RedirectStandardError $log -PassThru
Write-Host "launched pid=$($p.Id), waiting render..."
Start-Sleep 12

$wa = [System.Windows.Forms.Screen]::PrimaryScreen.WorkingArea
$winX = $wa.X + $wa.Width - 520
$winY = $wa.Y + $wa.Height - 600
$cx = $winX + 240
$headY = $winY + 150
Write-Host "window=($winX,$winY), click head=($cx,$headY)"

# 4. 模拟：鼠标从远处移入模型区域，单击
MoveTo 400 200
ClickNow            # 空点击（验证不会误触发）
MoveTo $cx $headY   # 移入模型 -> pointermove -> grab
ClickNow            # 单击
Start-Sleep 1
Screenshot "$root\click2-single.png"

# 5. 双击打开聊天
MoveTo $cx $headY
ClickNow
Start-Sleep -Milliseconds 120
ClickNow
Start-Sleep 1
Screenshot "$root\click2-double.png"

# 6. 结束并输出日志
Get-Process -Name "DesktopPet" -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep 1
Write-Host "=== renderer log ==="
if (Test-Path $log) { Get-Content $log }
Write-Host "done"
