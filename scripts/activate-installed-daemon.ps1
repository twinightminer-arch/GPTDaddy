param([switch]$ValidateOnly)

$ErrorActionPreference = 'Stop'
$runtime = Split-Path -Parent $PSScriptRoot
$node = Join-Path $runtime 'node.exe'
$main = Join-Path $runtime 'main.mjs'
$runner = Join-Path $PSScriptRoot 'runtime-daemon.ps1'
if (-not (Test-Path -LiteralPath $node) -or -not (Test-Path -LiteralPath $main) -or
    -not (Test-Path -LiteralPath $runner)) { throw 'Installed GPTDaddy runtime is incomplete.' }

# Only the process that owns GPTDaddy's loopback listener may be replaced.
$listeners = @(Get-NetTCPConnection -LocalAddress '127.0.0.1' -LocalPort 34873 -State Listen -ErrorAction SilentlyContinue)
$owners = @($listeners | Select-Object -ExpandProperty OwningProcess -Unique)
if ($owners.Count -gt 1) { throw 'Multiple processes own the GPTDaddy control listener; refusing takeover.' }
if ($owners.Count -eq 0) {
  try {
    $health = Invoke-RestMethod -Uri 'http://127.0.0.1:34873/health' -TimeoutSec 1
    if ($health.ok) { throw 'GPTDaddy is healthy but its listener owner could not be verified; refusing takeover.' }
  } catch [System.Net.WebException] { }
}
$daemonPid = if ($owners.Count -eq 1) { [int]$owners[0] } else { 0 }
$daemon = if ($daemonPid) { Get-CimInstance Win32_Process -Filter "ProcessId=$daemonPid" } else { $null }
if ($daemonPid -and (-not $daemon -or $daemon.Name -ne 'node.exe' -or
    $daemon.CommandLine -notmatch '(?i)(?:[\\/]src[\\/]cli\.mjs|[\\/]main\.mjs)"?\s+daemon(?:\s|$)' -or
    $daemon.CommandLine -notmatch '(?i)[\\/](?:GPTDaddy|wallpaper-engine-codex)[\\/]')) {
  throw 'The control listener is not an exact GPTDaddy daemon; no process was stopped.'
}

$runners = @(Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" | Where-Object {
  $_.ProcessId -ne $PID -and $_.CommandLine -match '(?i)-File\s+"?[^"\r\n]+[\\/](?:run-user-daemon|runtime-daemon)\.ps1"?(?:\s|$)' -and
  $_.CommandLine -match '(?i)[\\/](?:GPTDaddy|wallpaper-engine-codex)[\\/]scripts[\\/]'
})
if ($runners.Count -gt 2) { throw 'Unexpected number of GPTDaddy runners; refusing takeover.' }

if ($ValidateOnly) {
  [pscustomobject]@{ Action = 'Validation only'; DaemonPid = $daemonPid; RunnerPids = @($runners | ForEach-Object ProcessId); Runtime = $runtime }
  exit 0
}

foreach ($process in $runners) {
  Stop-Process -Id $process.ProcessId -ErrorAction Stop
  for ($attempt = 0; $attempt -lt 20; $attempt++) {
    if (-not (Get-Process -Id $process.ProcessId -ErrorAction SilentlyContinue)) { break }
    Start-Sleep -Milliseconds 100
  }
  if (Get-Process -Id $process.ProcessId -ErrorAction SilentlyContinue) { throw 'An exact old GPTDaddy runner did not exit.' }
}
if ($daemonPid) {
  Stop-Process -Id $daemonPid -ErrorAction Stop
  for ($attempt = 0; $attempt -lt 30; $attempt++) {
    if (-not (Get-Process -Id $daemonPid -ErrorAction SilentlyContinue)) { break }
    Start-Sleep -Milliseconds 200
  }
  if (Get-Process -Id $daemonPid -ErrorAction SilentlyContinue) { throw 'The exact old GPTDaddy daemon did not exit.' }
}

$powershell = (Get-Command powershell.exe -ErrorAction Stop).Source
Start-Process -FilePath $powershell -ArgumentList @(
  '-NoLogo', '-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden',
  '-ExecutionPolicy', 'RemoteSigned', '-File', ('"' + $runner + '"')
) -WindowStyle Hidden | Out-Null

$ready = $false
for ($attempt = 0; $attempt -lt 40; $attempt++) {
  Start-Sleep -Milliseconds 250
  try { $ready = [bool](Invoke-RestMethod -Uri 'http://127.0.0.1:34873/health' -TimeoutSec 1).ok } catch { }
  if ($ready) { break }
}
if (-not $ready) { throw 'Installed GPTDaddy daemon did not become healthy.' }
$newOwners = @(Get-NetTCPConnection -LocalAddress '127.0.0.1' -LocalPort 34873 -State Listen -ErrorAction Stop |
  Select-Object -ExpandProperty OwningProcess -Unique)
if ($newOwners.Count -ne 1) { throw 'The new GPTDaddy listener owner could not be verified.' }
$newDaemon = Get-CimInstance Win32_Process -Filter "ProcessId=$($newOwners[0])"
if (-not $newDaemon -or
    -not [string]::Equals($newDaemon.ExecutablePath, $node, [StringComparison]::OrdinalIgnoreCase) -or
    -not $newDaemon.CommandLine.Contains($main)) {
  throw 'The installed GPTDaddy runtime did not take ownership of the listener.'
}
Write-Output 'Installed GPTDaddy daemon took over the loopback listener.'
