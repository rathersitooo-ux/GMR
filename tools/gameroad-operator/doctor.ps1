$ErrorActionPreference = "Continue"

$results = @()
function Add-Result($Name, $Ok, $Detail) {
  $script:results += [pscustomobject]@{ Check=$Name; OK=$Ok; Detail=$Detail }
}

$node = Get-Command node -ErrorAction SilentlyContinue
$npx = Get-Command npx -ErrorAction SilentlyContinue
Add-Result "node" ([bool]$node) $(if ($node) { (& node --version) } else { "missing" })
Add-Result "npx" ([bool]$npx) $(if ($npx) { $npx.Source } else { "missing" })

if ($node) {
  $v = ((& node --version).TrimStart("v").Split(".")[0])
  Add-Result "node>=20" ([int]$v -ge 20) "major=$v"
}

$plugin = Join-Path $HOME ".codex\plugins\gameroad-operator"
$manifest = Join-Path $plugin ".codex-plugin\plugin.json"
$mcp = Join-Path $plugin ".mcp.json"
$market = Join-Path $HOME ".agents\plugins\marketplace.json"

Add-Result "plugin directory" (Test-Path $plugin) $plugin
Add-Result "plugin manifest" (Test-Path $manifest) $manifest
Add-Result "MCP config" (Test-Path $mcp) $mcp
Add-Result "personal marketplace" (Test-Path $market) $market

if (Test-Path $manifest) {
  try {
    $j = Get-Content -Raw $manifest | ConvertFrom-Json
    Add-Result "manifest parse" ($j.name -eq "gameroad-operator" -and $j.mcpServers -eq "./.mcp.json") "name=$($j.name)"
  } catch { Add-Result "manifest parse" $false $_.Exception.Message }
}

if (Test-Path $mcp) {
  try {
    $j = Get-Content -Raw $mcp | ConvertFrom-Json
    $ok = $null -ne $j.mcp_servers.'gameroad-desktop' -and $null -ne $j.mcp_servers.'gameroad-browser'
    Add-Result "MCP servers" $ok "desktop + browser"
  } catch { Add-Result "MCP servers" $false $_.Exception.Message }
}

if ($npx) {
  try {
    $dc = (& npm view @wonderwhy-er/desktop-commander version 2>$null).Trim()
    Add-Result "Desktop Commander registry" ([bool]$dc) $dc
  } catch { Add-Result "Desktop Commander registry" $false $_.Exception.Message }
  try {
    $pw = (& npm view @playwright/mcp version 2>$null).Trim()
    Add-Result "Playwright MCP registry" ([bool]$pw) $pw
  } catch { Add-Result "Playwright MCP registry" $false $_.Exception.Message }
}

$results | Format-Table -AutoSize
if (($results | Where-Object { -not $_.OK }).Count -gt 0) { exit 1 }
exit 0
