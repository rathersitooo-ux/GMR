$ErrorActionPreference = "Stop"

$pluginDst = Join-Path $HOME ".codex\plugins\gameroad-operator"
$marketplacePath = Join-Path $HOME ".agents\plugins\marketplace.json"

if (Test-Path $pluginDst) {
  Remove-Item -Recurse -Force $pluginDst
  Write-Host "Removed $pluginDst"
}

if (Test-Path $marketplacePath) {
  $market = Get-Content -Raw $marketplacePath | ConvertFrom-Json
  $market.plugins = @($market.plugins | Where-Object { $_.name -ne "gameroad-operator" })
  $market | ConvertTo-Json -Depth 20 | Set-Content -Encoding UTF8 $marketplacePath
  Write-Host "Removed GAMEROAD Operator from $marketplacePath"
}

Write-Host "Restart ChatGPT Desktop to unload the plugin."
