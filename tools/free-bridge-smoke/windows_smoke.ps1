$ErrorActionPreference = "Stop"

$repo = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$builder = Join-Path $PSScriptRoot "build_installer.py"
$testSecret = ("ab" * 32)
$relayRoot = Join-Path $env:RUNNER_TEMP "GAMEROAD Relay Root With Spaces"
$isolated = Join-Path $env:RUNNER_TEMP "Downloaded Single File Only"
$otherCwd = Join-Path $env:RUNNER_TEMP "Different Working Directory"
$evidenceDir = Join-Path $repo "artifacts\free-bridge-smoke"
$installRoot = Join-Path $env:LOCALAPPDATA "GAMEROAD-FreeBridge"
$startup = [Environment]::GetFolderPath("Startup")
$startupLauncher = Join-Path $startup "GAMEROAD-FreeBridge.cmd"

Remove-Item $relayRoot,$isolated,$otherCwd,$installRoot,$evidenceDir -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item $startupLauncher -Force -ErrorAction SilentlyContinue
foreach($p in @($relayRoot,$isolated,$otherCwd,$evidenceDir)){ New-Item -ItemType Directory -Force -Path $p | Out-Null }
foreach($n in @("inbox","outbox","archive","files")){ New-Item -ItemType Directory -Force -Path (Join-Path $relayRoot $n) | Out-Null }

$installer = Join-Path $isolated "START_GAMEROAD_FREE_BRIDGE_v0.6.cmd"
& python $builder --secret $testSecret --out $installer
if($LASTEXITCODE -ne 0){ throw "builder failed" }

$files = @(Get-ChildItem $isolated -File)
if($files.Count -ne 1 -or $files[0].Name -ne "START_GAMEROAD_FREE_BRIDGE_v0.6.cmd"){
  throw "installer is not a true single-file payload"
}

function Sign-Command([string]$id,[string]$op,$args,[int]$ttl=600,[string]$secret=$testSecret){
  $now=[DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
  $payload=[ordered]@{id=$id;op=$op;args=$args;created_at_epoch=$now;expires_at_epoch=($now+$ttl)}
  $payloadJson=$payload | ConvertTo-Json -Depth 20 -Compress
  $pb64=[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($payloadJson))
  $key=New-Object byte[] ($secret.Length/2)
  for($i=0;$i -lt $key.Length;$i++){ $key[$i]=[Convert]::ToByte($secret.Substring($i*2,2),16) }
  $h=New-Object System.Security.Cryptography.HMACSHA256
  $h.Key=$key
  try{$sig=-join ($h.ComputeHash([Text.Encoding]::UTF8.GetBytes($pb64)) | ForEach-Object {$_.ToString("x2")})} finally {$h.Dispose()}
  @{payload_b64=$pb64;sig=$sig} | ConvertTo-Json -Depth 10 | Set-Content -Encoding UTF8 (Join-Path (Join-Path $relayRoot "inbox") "$id.command.json")
}

function Wait-Result([string]$id,[int]$seconds=30){
  $p=Join-Path (Join-Path $relayRoot "outbox") "$id.result.json"
  $deadline=(Get-Date).AddSeconds($seconds)
  while((Get-Date) -lt $deadline){
    if(Test-Path $p){ return (Get-Content $p -Raw | ConvertFrom-Json) }
    Start-Sleep -Milliseconds 250
  }
  throw "timeout waiting for $id"
}

Sign-Command "ci-ping-001" "ping" @{}
$env:GAMEROAD_FREE_RELAY_ROOT=$relayRoot

Push-Location $otherCwd
try{
  $proc=Start-Process cmd.exe -ArgumentList @("/d","/c","call `"$installer`"") -PassThru -WindowStyle Hidden
  if(-not $proc.WaitForExit(20000)){
    try{$proc.Kill()}catch{}
    throw "single-file installer command hung for more than 20 seconds"
  }
  if($proc.ExitCode -ne 0){ throw "single-file installer exited $($proc.ExitCode)" }
} finally { Pop-Location }

$ping=Wait-Result "ci-ping-001"
if($ping.bridge_version -ne "0.6.0"){ throw "wrong bridge version in ping result" }
if($ping.result.status -ne "ok"){ throw "ping failed: $($ping.result | ConvertTo-Json -Compress)" }
if(-not (Test-Path (Join-Path $installRoot "bridge.ps1"))){ throw "bridge.ps1 was not installed" }
if(-not (Test-Path (Join-Path $installRoot "config.json"))){ throw "config.json was not installed" }
if(-not (Test-Path $startupLauncher)){ throw "startup launcher was not installed" }
if(Test-Path (Join-Path (Join-Path $relayRoot "inbox") "ci-ping-001.command.json")){ throw "processed ping stayed in inbox" }
if(-not (Test-Path (Join-Path (Join-Path $relayRoot "archive") "ci-ping-001.command.json"))){ throw "processed ping not archived" }

# Held-out write side effect through the installed bridge.
$sentinel=Join-Path $env:RUNNER_TEMP "grfb-write-executed.txt"
Sign-Command "ci-write-001" "write_file" @{path=$sentinel;content="bridge-write-executed"}
$write=Wait-Result "ci-write-001"
$write | ConvertTo-Json -Depth 20 | Set-Content -Encoding UTF8 (Join-Path $evidenceDir "ci-write-result.json")
if($write.result.status -ne "ok"){ throw "write_file command failed" }
if(-not (Test-Path $sentinel)){ throw "write_file side effect missing" }
if((Get-Content $sentinel -Raw).Trim() -ne "bridge-write-executed"){ throw "write_file side effect content mismatch" }

# Held-out process launch through the installed bridge.
$procSentinel=Join-Path $env:RUNNER_TEMP "grfb-process-executed.txt"
$procArgs="-NoProfile -Command `"Set-Content -LiteralPath '$($procSentinel.Replace("'","''"))' -Value 'bridge-process-executed'`""
Sign-Command "ci-process-001" "start_process" @{file="powershell.exe";arguments=$procArgs}
$procResult=Wait-Result "ci-process-001"
$procResult | ConvertTo-Json -Depth 20 | Set-Content -Encoding UTF8 (Join-Path $evidenceDir "ci-process-result.json")
if($procResult.result.status -ne "ok"){ throw "start_process command failed" }
$deadline=(Get-Date).AddSeconds(10)
while((Get-Date) -lt $deadline -and -not (Test-Path $procSentinel)){ Start-Sleep -Milliseconds 250 }
if(-not (Test-Path $procSentinel)){ throw "start_process side effect missing" }
if((Get-Content $procSentinel -Raw).Trim() -ne "bridge-process-executed"){ throw "start_process side effect content mismatch" }

# Bad signature must fail closed.
$badId="ci-bad-signature-001"
$now=[DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
$payload=@{id=$badId;op="ping";args=@{};created_at_epoch=$now;expires_at_epoch=$now+600} | ConvertTo-Json -Compress
$pb64=[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($payload))
@{payload_b64=$pb64;sig=("00"*32)} | ConvertTo-Json | Set-Content -Encoding UTF8 (Join-Path (Join-Path $relayRoot "inbox") "$badId.command.json")
$bad=Wait-Result $badId
if($bad.result.status -ne "error" -or $bad.result.error -notmatch "invalid signature"){ throw "bad signature did not fail closed" }

# Duplicate command id must not re-execute after a result already exists.
$resultPath=Join-Path (Join-Path $relayRoot "outbox") "ci-write-001.result.json"
$before=(Get-Item $resultPath).LastWriteTimeUtc
Copy-Item (Join-Path (Join-Path $relayRoot "archive") "ci-write-001.command.json") (Join-Path (Join-Path $relayRoot "inbox") "ci-write-001.command.json") -Force
Start-Sleep -Seconds 2
$after=(Get-Item $resultPath).LastWriteTimeUtc
if($after -ne $before){ throw "duplicate command rewrote result / may have re-executed" }
if(Test-Path (Join-Path (Join-Path $relayRoot "inbox") "ci-write-001.command.json")){ throw "duplicate command was not drained" }

$config=Get-Content (Join-Path $installRoot "config.json") -Raw | ConvertFrom-Json
if([string]$config.relay_root -ne $relayRoot){ throw "relay root was not persisted exactly" }

# Stop cleanly.
New-Item -ItemType File -Force -Path (Join-Path $installRoot "state\stop.flag") | Out-Null
$deadline=(Get-Date).AddSeconds(15)
while((Get-Date) -lt $deadline -and (Test-Path (Join-Path $installRoot "state\bridge.pid"))){ Start-Sleep -Milliseconds 250 }
if(Test-Path (Join-Path $installRoot "state\bridge.pid")){ throw "bridge did not stop cleanly" }

$evidence=[ordered]@{
  tested_at_utc=(Get-Date).ToUniversalTime().ToString("o")
  runner_os=[Environment]::OSVersion.VersionString
  powershell=$PSVersionTable.PSVersion.ToString()
  installer_sha256=(Get-FileHash $installer -Algorithm SHA256).Hash.ToLowerInvariant()
  installer_bytes=(Get-Item $installer).Length
  single_file_only=$true
  launched_from_different_working_directory=$true
  installed_bridge=$true
  startup_launcher=$true
  signed_ping=$ping.result.status
  write_side_effect=(Get-Content $sentinel -Raw).Trim()
  process_side_effect=(Get-Content $procSentinel -Raw).Trim()
  invalid_signature_fail_closed=$true
  duplicate_id_no_reexecution=$true
  clean_stop=$true
}
$evidence | ConvertTo-Json -Depth 10 | Set-Content -Encoding UTF8 (Join-Path $evidenceDir "windows-smoke-evidence.json")
Copy-Item $installer (Join-Path $evidenceDir "START_GAMEROAD_FREE_BRIDGE_v0.6.CI-TESTED.cmd") -Force
Write-Host ($evidence | ConvertTo-Json -Depth 10)
