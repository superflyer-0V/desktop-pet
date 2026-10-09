param(
  [string]$Repo = "guansss/pixi-live2d-display",
  [string]$Path = "test/assets/haru",
  [string]$OutDir = "renderer/models"
)

$ErrorActionPreference = "Stop"
$headers = @{ "User-Agent" = "desktop-pet-setup" }
$dest = Join-Path (Split-Path $PSScriptRoot -Parent) $OutDir

function Get-DirRecursive($apiUrl, $rel) {
  $items = Invoke-RestMethod -Uri $apiUrl -Headers $headers
  foreach ($item in $items) {
    $childRel = if ($rel) { Join-Path $rel $item.name } else { $item.name }
    if ($item.type -eq "dir") {
      Get-DirRecursive $item.url $childRel
    } else {
      $out = Join-Path $dest $childRel
      New-Item -ItemType Directory -Force -Path (Split-Path $out) | Out-Null
      Invoke-WebRequest -Uri $item.download_url -Headers $headers -OutFile $out
      Write-Host "saved: $out"
    }
  }
}

Get-DirRecursive "https://api.github.com/repos/$Repo/contents/$Path" ""
Write-Host "done -> $dest"
