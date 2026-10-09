$ErrorActionPreference = "Stop"
$headers = @{ "User-Agent" = "desktop-pet-setup" }
$base = "https://raw.githubusercontent.com/guansss/pixi-live2d-display/master/test/assets"
$dest = Join-Path (Split-Path $PSScriptRoot -Parent) "renderer/models"

New-Item -ItemType Directory -Force -Path "$dest/shizuku/sounds" | Out-Null
Invoke-WebRequest -Uri "$base/shizuku/sounds/flickHead_00.mp3" -Headers $headers -OutFile "$dest/shizuku/sounds/flickHead_00.mp3"
Invoke-WebRequest -Uri "$base/shizuku/sounds/flickHead_01.mp3" -Headers $headers -OutFile "$dest/shizuku/sounds/flickHead_01.mp3"
Write-Host "extra files done"
