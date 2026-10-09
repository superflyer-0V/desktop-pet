param([string]$Exe = "release\DesktopPet.exe")

$root = Split-Path $PSScriptRoot -Parent
Set-Location $root
$env:PET_USER_DATA = Join-Path $root ".user-data"

$log = Join-Path $root "smoke-portable.log"
$proc = Start-Process -FilePath $Exe -ArgumentList "--enable-logging" -WorkingDirectory $root -RedirectStandardError $log -RedirectStandardOutput "$log.out" -PassThru

Start-Sleep -Seconds 16

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$b = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
$bmp = New-Object System.Drawing.Bitmap $b.Width, $b.Height
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($b.Location, [System.Drawing.Point]::Empty, $b.Size)
$bmp.Save((Join-Path $root "smoke-shot.png"))
$g.Dispose(); $bmp.Dispose()

Write-Host "alive=$(-not $proc.HasExited)"
if (-not $proc.HasExited) { Stop-Process -Id $proc.Id -Force }
Write-Host "done"
