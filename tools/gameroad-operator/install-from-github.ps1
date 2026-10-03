$ErrorActionPreference = "Stop"

$temp = Join-Path $env:TEMP ("gameroad-operator-" + [guid]::NewGuid().ToString("N"))
$zip = Join-Path $temp "gmr.zip"
New-Item -ItemType Directory -Force -Path $temp | Out-Null

try {
  $uri = "https://github.com/rathersitooo-ux/GMR/archive/refs/heads/main.zip"
  Write-Host "Downloading current GMR main..."
  Invoke-WebRequest -Uri $uri -OutFile $zip
  Expand-Archive -Path $zip -DestinationPath $temp -Force
  $repo = Get-ChildItem -Path $temp -Directory | Where-Object { $_.Name -like "GMR-*" } | Select-Object -First 1
  if (-not $repo) { throw "Expanded repository directory not found." }
  $installer = Join-Path $repo.FullName "tools\gameroad-operator\install.ps1"
  if (-not (Test-Path $installer)) { throw "GAMEROAD Operator installer is not present on current main." }
  & powershell -ExecutionPolicy Bypass -File $installer
} finally {
  if (Test-Path $temp) { Remove-Item -Recurse -Force $temp }
}
