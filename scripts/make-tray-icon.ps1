param([int]$Size = 32, [string]$OutFile = "")

Add-Type -AssemblyName System.Drawing

$root = Split-Path $PSScriptRoot -Parent
if (-not $OutFile) { $OutFile = Join-Path $root "assets\tray.png" }
$dir = Split-Path $OutFile -Parent
New-Item -ItemType Directory -Force -Path $dir | Out-Null

$f = $Size / 32.0

$bmp = New-Object System.Drawing.Bitmap $Size, $Size
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.Clear([System.Drawing.Color]::Transparent)

$fur = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 240, 168, 184))
$inkWidth = [Math]::Max(1.0, 1.2 * $f)
$ink = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(255, 91, 58, 63)), $inkWidth
$blush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(150, 250, 190, 205))

function Pt($x, $y) { New-Object System.Drawing.Point ([int]($x * $f)), ([int]($y * $f)) }
function Rect($x, $y, $w, $h) { New-Object System.Drawing.Rectangle ([int]($x * $f)), ([int]($y * $f)), ([int]($w * $f)), ([int]($h * $f)) }

$g.FillPolygon($fur, [System.Drawing.Point[]]@((Pt 5 10), (Pt 11 0), (Pt 13 9)))
$g.FillPolygon($fur, [System.Drawing.Point[]]@((Pt 19 9), (Pt 21 0), (Pt 27 10)))
$g.FillEllipse($fur, (Rect 5 7 22 22))
$g.DrawArc($ink, (Rect 10 16 5 4), 180, 180)
$g.DrawArc($ink, (Rect 17 16 5 4), 180, 180)
$g.DrawArc($ink, (Rect 13 20 6 4), 180, 180)
$g.FillEllipse($blush, (Rect 6 19 4 3))
$g.FillEllipse($blush, (Rect 22 19 4 3))

$g.Dispose()
$bmp.Save($OutFile, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()
Write-Host "saved: $OutFile"
