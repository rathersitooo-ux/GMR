$ErrorActionPreference = "Stop"

function Fail([string]$Message) {
  Write-Error $Message
  exit 1
}

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$pluginSrc = Join-Path $root "plugins\gameroad-operator"
$pluginDst = Join-Path $HOME ".codex\plugins\gameroad-operator"
$marketplaceDir = Join-Path $HOME ".agents\plugins"
$marketplacePath = Join-Path $marketplaceDir "marketplace.json"

if (-not (Test-Path $pluginSrc)) { Fail "Plugin source not found: $pluginSrc" }

$node = Get-Command node -ErrorAction SilentlyContinue
$npx = Get-Command npx -ErrorAction SilentlyContinue
if (-not $node -or -not $npx) {
  Fail "Node.js 20+ with npm/npx is required. Install a current Node.js LTS release, then run this script again."
}

$nodeVersionText = (& node --version).TrimStart("v")
$nodeMajor = [int]($nodeVersionText.Split(".")[0])
if ($nodeMajor -lt 20) {
  Fail "Node.js 20+ is required; found $nodeVersionText."
}

New-Item -ItemType Directory -Force -Path (Split-Path -Parent $pluginDst) | Out-Null
if (Test-Path $pluginDst) { Remove-Item -Recurse -Force $pluginDst }
Copy-Item -Recurse -Force $pluginSrc $pluginDst

New-Item -ItemType Directory -Force -Path $marketplaceDir | Out-Null

$entry = [ordered]@{
  name = "gameroad-operator"
  source = [ordered]@{
    source = "local"
    path = "./.codex/plugins/gameroad-operator"
  }
  policy = [ordered]@{
    installation = "AVAILABLE"
    authentication = "ON_INSTALL"
  }
  category = "Developer Tools"
}

if (Test-Path $marketplacePath) {
  $market = Get-Content -Raw $marketplacePath | ConvertFrom-Json
  if (-not $market.name) { $market | Add-Member -NotePropertyName name -NotePropertyValue "personal-local-tools" }
  if (-not $market.interface) {
    $market | Add-Member -NotePropertyName interface -NotePropertyValue ([pscustomobject]@{ displayName = "Personal Local Tools" })
  }
  $plugins = @($market.plugins | Where-Object { $_.name -ne "gameroad-operator" })
  $plugins += [pscustomobject]$entry
  $market.plugins = $plugins
} else {
  $market = [ordered]@{
    name = "personal-local-tools"
    interface = [ordered]@{ displayName = "Personal Local Tools" }
    plugins = @($entry)
  }
}

$market | ConvertTo-Json -Depth 20 | Set-Content -Encoding UTF8 $marketplacePath

Write-Host "Installed GAMEROAD Operator plugin to: $pluginDst"
Write-Host "Updated personal plugin marketplace: $marketplacePath"
Write-Host "Node.js: $nodeVersionText"
Write-Host ""
Write-Host "Next:"
Write-Host "  1. Restart the ChatGPT desktop app."
Write-Host "  2. Open Plugins Directory -> Personal Local Tools."
Write-Host "  3. Install/enable GAMEROAD Operator."
Write-Host "  4. In the first browser use, sign in inside the Playwright browser profile if a site requires authentication."
Write-Host "  5. Ask: 'GAMEROAD OperatorでPC診断して'."
