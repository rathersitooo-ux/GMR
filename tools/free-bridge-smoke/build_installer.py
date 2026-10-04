import argparse
import base64
from pathlib import Path

BRIDGE_PS1 = r'''
$ErrorActionPreference = "Stop"
$InstallRoot = Join-Path $env:LOCALAPPDATA "GAMEROAD-FreeBridge"
$ConfigPath = Join-Path $InstallRoot "config.json"
$StateDir = Join-Path $InstallRoot "state"
$LogPath = Join-Path $StateDir "bridge.log"
$PidPath = Join-Path $StateDir "bridge.pid"
$StopPath = Join-Path $StateDir "stop.flag"
New-Item -ItemType Directory -Force -Path $InstallRoot,$StateDir | Out-Null

function Log([string]$msg) { Add-Content -Encoding UTF8 $LogPath "$(Get-Date -Format o) $msg" }
function Write-AtomicJson([string]$path, $obj) {
  $tmp = "$path.tmp.$PID"
  $obj | ConvertTo-Json -Depth 30 | Set-Content -Encoding UTF8 $tmp
  Move-Item $tmp $path -Force
}
function Find-RelayRoot {
  if ($env:GAMEROAD_FREE_RELAY_ROOT -and (Test-Path $env:GAMEROAD_FREE_RELAY_ROOT)) {
    return (Resolve-Path $env:GAMEROAD_FREE_RELAY_ROOT).Path
  }
  $tail = "GAMEROAD_MASTER_ACTIVE\02_EXECUTION_INBOX\GAMEROAD_FREE_RELAY"
  $prefixes = @("", "My Drive", "マイドライブ", "Google Drive\My Drive", "Google ドライブ\マイドライブ")
  $candidates = New-Object System.Collections.Generic.List[string]
  foreach ($d in Get-PSDrive -PSProvider FileSystem -ErrorAction SilentlyContinue) {
    if (-not $d.Root) { continue }
    foreach ($p in $prefixes) {
      $base = if ($p) { Join-Path $d.Root $p } else { $d.Root }
      $candidates.Add((Join-Path $base $tail))
    }
  }
  foreach ($p in $prefixes) {
    $base = if ($p) { Join-Path $env:USERPROFILE $p } else { $env:USERPROFILE }
    $candidates.Add((Join-Path $base $tail))
  }
  foreach ($c in ($candidates | Select-Object -Unique)) {
    if (Test-Path $c) { return (Resolve-Path $c).Path }
  }
  return $null
}
function Hex-Hmac([string]$keyHex, [string]$text) {
  $key = New-Object byte[] ($keyHex.Length / 2)
  for ($i=0; $i -lt $key.Length; $i++) { $key[$i] = [Convert]::ToByte($keyHex.Substring($i*2,2),16) }
  $h = New-Object System.Security.Cryptography.HMACSHA256
  $h.Key = $key
  try {
    $bytes = [Text.Encoding]::UTF8.GetBytes($text)
    $hash = $h.ComputeHash($bytes)
    return -join ($hash | ForEach-Object { $_.ToString("x2") })
  } finally { $h.Dispose() }
}
function Constant-Time-Equals([string]$a,[string]$b) {
  if ($null -eq $a -or $null -eq $b -or $a.Length -ne $b.Length) { return $false }
  $diff = 0
  for ($i=0; $i -lt $a.Length; $i++) { $diff = $diff -bor ([int][char]$a[$i] -bxor [int][char]$b[$i]) }
  return $diff -eq 0
}
function Inventory {
  $cmds=@{}
  foreach($name in @("git","gh","node","npm","python","py","docker","pwsh","powershell","code","msedge","chrome")) {
    $c=Get-Command $name -ErrorAction SilentlyContinue
    if($c){$cmds[$name]=$c.Source}
  }
  return @{
    computer=$env:COMPUTERNAME
    user=$env:USERNAME
    powershell=$PSVersionTable.PSVersion.ToString()
    os=(Get-CimInstance Win32_OperatingSystem | Select-Object Caption,Version,BuildNumber,OSArchitecture)
    commands=$cmds
    bridge_version="0.6.0"
  }
}
function Run-PowerShell([string]$script,[int]$timeoutSec) {
  if($timeoutSec -lt 1){$timeoutSec=60}
  if($timeoutSec -gt 1800){$timeoutSec=1800}
  $outFile=Join-Path $env:TEMP "grfb-$PID-stdout.txt"
  $errFile=Join-Path $env:TEMP "grfb-$PID-stderr.txt"
  Remove-Item $outFile,$errFile -Force -ErrorAction SilentlyContinue
  $enc=[Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($script))
  $p=Start-Process powershell.exe -ArgumentList @("-NoProfile","-NonInteractive","-ExecutionPolicy","Bypass","-EncodedCommand",$enc) -RedirectStandardOutput $outFile -RedirectStandardError $errFile -WindowStyle Hidden -PassThru
  if(-not $p.WaitForExit($timeoutSec*1000)){
    try{$p.Kill()}catch{}
    return @{status="timeout";stdout=(Get-Content $outFile -Raw -ErrorAction SilentlyContinue);stderr=(Get-Content $errFile -Raw -ErrorAction SilentlyContinue)}
  }
  return @{status="completed";exit_code=$p.ExitCode;stdout=(Get-Content $outFile -Raw -ErrorAction SilentlyContinue);stderr=(Get-Content $errFile -Raw -ErrorAction SilentlyContinue)}
}
function Execute-Command($payload,[string]$relayRoot) {
  $a=$payload.args
  switch([string]$payload.op){
    "ping" { return @{status="ok";inventory=(Inventory)} }
    "inventory" { return @{status="ok";inventory=(Inventory)} }
    "powershell" { return Run-PowerShell ([string]$a.script) ([int]$a.timeout_sec) }
    "list_dir" { return @{status="ok";items=@(Get-ChildItem -Force ([string]$a.path) -ErrorAction Stop | Select-Object Name,FullName,Length,Mode,LastWriteTime)} }
    "read_file" {
      $p=[string]$a.path; $max=[int]$a.max_chars; if($max -le 0){$max=200000}
      $txt=Get-Content $p -Raw -ErrorAction Stop; if($txt.Length -gt $max){$txt=$txt.Substring(0,$max)}
      return @{status="ok";path=$p;content=$txt}
    }
    "write_file" {
      $p=[string]$a.path; $parent=Split-Path $p -Parent
      if($parent){New-Item -ItemType Directory -Force -Path $parent | Out-Null}
      [string]$a.content | Set-Content -Encoding UTF8 $p
      return @{status="ok";path=$p;bytes=(Get-Item $p).Length}
    }
    "start_process" {
      $p=Start-Process -FilePath ([string]$a.file) -ArgumentList ([string]$a.arguments) -PassThru
      return @{status="ok";pid=$p.Id;file=[string]$a.file}
    }
    default { throw "Unsupported op: $($payload.op)" }
  }
}
try {
  $cfg=Get-Content $ConfigPath -Raw | ConvertFrom-Json
  $secretHex=[string]$cfg.secret_hex
  $relayRoot=[string]$cfg.relay_root
  if(-not $relayRoot -or -not (Test-Path $relayRoot)){
    $relayRoot=Find-RelayRoot
    if(-not $relayRoot){throw "GAMEROAD_FREE_RELAY was not found in a local Google Drive sync location."}
    $cfg.relay_root=$relayRoot
    Write-AtomicJson $ConfigPath $cfg
  }
  foreach($n in @("inbox","outbox","archive","files")){New-Item -ItemType Directory -Force -Path (Join-Path $relayRoot $n) | Out-Null}
  Remove-Item $StopPath -Force -ErrorAction SilentlyContinue
  $PID | Set-Content -Encoding ASCII $PidPath
  Log "bridge v0.6 started relay=$relayRoot"
  while(-not (Test-Path $StopPath)){
    $queue=Get-ChildItem (Join-Path $relayRoot "inbox") -Filter "*.command.json" -File -ErrorAction SilentlyContinue | Sort-Object CreationTime,Name
    foreach($file in $queue){
      $id=$file.Name -replace '\.command\.json$',''
      $resultPath=Join-Path (Join-Path $relayRoot "outbox") "$id.result.json"
      $archivePath=Join-Path (Join-Path $relayRoot "archive") $file.Name
      if(Test-Path $resultPath){Move-Item $file.FullName $archivePath -Force; continue}
      try{
        $envl=Get-Content $file.FullName -Raw | ConvertFrom-Json
        $pb64=[string]$envl.payload_b64
        $sig=[string]$envl.sig
        $expected=Hex-Hmac $secretHex $pb64
        if(-not (Constant-Time-Equals $expected $sig)){throw "invalid signature"}
        $payloadJson=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($pb64))
        $payload=$payloadJson | ConvertFrom-Json
        if([string]$payload.id -ne $id){throw "filename/id mismatch"}
        if($id -notmatch '^[A-Za-z0-9._-]{1,120}$'){throw "invalid command id"}
        $now=[DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
        if([int64]$payload.expires_at_epoch -lt $now){throw "expired command"}
        if([int64]$payload.created_at_epoch -gt ($now+300)){throw "future-dated command"}
        $result=Execute-Command $payload $relayRoot
        Write-AtomicJson $resultPath @{command_id=$id;completed_at=(Get-Date).ToUniversalTime().ToString("o");bridge_version="0.6.0";result=$result}
      } catch {
        Write-AtomicJson $resultPath @{command_id=$id;completed_at=(Get-Date).ToUniversalTime().ToString("o");bridge_version="0.6.0";result=@{status="error";error=$_.Exception.Message}}
      } finally {
        if(Test-Path $file.FullName){Move-Item $file.FullName $archivePath -Force}
      }
    }
    Start-Sleep -Milliseconds 500
  }
} catch {
  Log "fatal: $($_.Exception.Message)"
  exit 1
} finally {
  Remove-Item $PidPath -Force -ErrorAction SilentlyContinue
}
'''

INSTALL_PS1 = r'''
$ErrorActionPreference = "Stop"
$InstallRoot=Join-Path $env:LOCALAPPDATA "GAMEROAD-FreeBridge"
$StateDir=Join-Path $InstallRoot "state"
New-Item -ItemType Directory -Force -Path $InstallRoot,$StateDir | Out-Null
$bridgeBytes=[Convert]::FromBase64String("__BRIDGE_B64__")
[IO.File]::WriteAllBytes((Join-Path $InstallRoot "bridge.ps1"),$bridgeBytes)
$config=@{version="0.6.0";secret_hex="__SECRET__";relay_root=$env:GAMEROAD_FREE_RELAY_ROOT}
$config | ConvertTo-Json -Depth 5 | Set-Content -Encoding UTF8 (Join-Path $InstallRoot "config.json")
Remove-Item (Join-Path $StateDir "stop.flag") -Force -ErrorAction SilentlyContinue
$startup=[Environment]::GetFolderPath("Startup")
$launcher=Join-Path $startup "GAMEROAD-FreeBridge.cmd"
'@echo off' + [Environment]::NewLine + 'start "" /min powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "%LOCALAPPDATA%\GAMEROAD-FreeBridge\bridge.ps1"' | Set-Content -Encoding ASCII $launcher
$p=Start-Process powershell.exe -ArgumentList @("-NoProfile","-WindowStyle","Hidden","-ExecutionPolicy","Bypass","-File",(Join-Path $InstallRoot "bridge.ps1")) -WindowStyle Hidden -PassThru
Start-Sleep -Milliseconds 500
if($p.HasExited -and $p.ExitCode -ne 0){throw "bridge process exited immediately with code $($p.ExitCode)"}
Write-Output "GAMEROAD Free Bridge v0.6 installation started successfully."
'''

CMD_HEAD = r'''@echo off
setlocal
set "GRFB_SELF=%~f0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$t=[IO.File]::ReadAllText($env:GRFB_SELF);$m=[regex]::Match($t,'(?s)###GRFB_POWERSHELL###\r?\n(.*)\z');if(-not $m.Success){throw 'payload marker missing'};$tmp=Join-Path $env:TEMP ('grfb-install-'+[guid]::NewGuid().ToString('N')+'.ps1');[IO.File]::WriteAllText($tmp,$m.Groups[1].Value,[Text.UTF8Encoding]::new($false));try{& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $tmp;exit $LASTEXITCODE}finally{Remove-Item $tmp -Force -ErrorAction SilentlyContinue}"
set "RC=%ERRORLEVEL%"
if not "%RC%"=="0" (
  echo.
  echo GAMEROAD Free Bridge installation failed with exit code %RC%.
  pause
)
exit /b %RC%
###GRFB_POWERSHELL###
'''

def build(secret: str) -> str:
    if len(secret) != 64 or any(c not in "0123456789abcdefABCDEF" for c in secret):
        raise ValueError("secret must be 64 hex characters")
    bridge_b64 = base64.b64encode(BRIDGE_PS1.encode("utf-8-sig")).decode("ascii")
    ps = INSTALL_PS1.replace("__BRIDGE_B64__", bridge_b64).replace("__SECRET__", secret.lower())
    return CMD_HEAD + ps

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--secret",required=True)
    ap.add_argument("--out",required=True)
    ns=ap.parse_args()
    data=build(ns.secret)
    Path(ns.out).write_text(data,encoding="utf-8",newline="\r\n")

if __name__=="__main__":
    main()
