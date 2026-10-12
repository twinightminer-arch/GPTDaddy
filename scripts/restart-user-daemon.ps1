param([switch]$Restart)

$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path -LiteralPath (Split-Path -Parent $PSScriptRoot)).Path
$cli = Join-Path $projectRoot 'src\cli.mjs'
$runner = Join-Path $PSScriptRoot 'run-user-daemon.ps1'
$healthUri = 'http://127.0.0.1:34873/health'
if (-not (Test-Path -LiteralPath $cli) -or -not (Test-Path -LiteralPath $runner)) {
  throw 'GPTDaddy daemon files are missing.'
}

function Test-DaemonHealth {
  try { return [bool](Invoke-RestMethod -Uri $healthUri -TimeoutSec 2).ok }
  catch { return $false }
}

try {
  $candidates = @(Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object {
    $_.CommandLine -and $_.CommandLine.IndexOf($cli, [StringComparison]::OrdinalIgnoreCase) -ge 0 -and
    $_.CommandLine -match '(?:^|\s)daemon(?:\s|$)'
  })
} catch {
  throw 'Cannot inspect the GPTDaddy process. Run this script from a normal desktop PowerShell session, not the Codex sandbox.'
}
if ($candidates.Count -gt 1) { throw 'More than one exact GPTDaddy daemon was found. Refusing to stop any process.' }

[pscustomobject]@{
  Action = if ($Restart) { 'Restart exact GPTDaddy daemon' } else { 'Validation only; no changes' }
  DaemonPids = @($candidates | ForEach-Object { $_.ProcessId }) -join ','
  Health = Test-DaemonHealth
  Cli = $cli
  Runner = $runner
} | Format-List
if (-not $Restart) { exit 0 }

if ($candidates.Count -eq 1) {
  $targetPid = [int]$candidates[0].ProcessId
  Stop-Process -Id $targetPid -ErrorAction Stop
  for ($index = 0; $index -lt 20; $index++) {
    if (-not (Get-Process -Id $targetPid -ErrorAction SilentlyContinue)) { break }
    Start-Sleep -Milliseconds 500
  }
  if (Get-Process -Id $targetPid -ErrorAction SilentlyContinue) { throw 'The exact GPTDaddy daemon did not exit.' }
  Write-Host "Stopped only GPTDaddy daemon PID $targetPid."
} elseif (Test-DaemonHealth) {
  throw 'A control service is healthy, but its process was not verified as GPTDaddy. Refusing to restart it.'
}

for ($index = 0; $index -lt 20; $index++) {
  if (Test-DaemonHealth) { Write-Host 'GPTDaddy daemon is healthy after restart.'; exit 0 }
  Start-Sleep -Seconds 1
}

$powershell = (Get-Command powershell.exe -ErrorAction Stop).Source
$arguments = "-NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File `"$runner`""
Start-Process -FilePath $powershell -ArgumentList $arguments -WindowStyle Hidden
for ($index = 0; $index -lt 15; $index++) {
  if (Test-DaemonHealth) { Write-Host 'GPTDaddy daemon was started and is healthy.'; exit 0 }
  Start-Sleep -Seconds 1
}
throw 'GPTDaddy did not become healthy. Inspect the daemon log or run the project doctor command.'
