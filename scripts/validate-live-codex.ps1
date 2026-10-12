param(
  [ValidateRange(30, 14400)][int]$DurationSeconds = 600,
  [ValidateRange(1024, 65535)][int]$CdpPort = 9335
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$cli = [System.IO.Path]::GetFullPath((Join-Path $projectRoot 'src\cli.mjs'))
$runner = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot 'run-user-daemon.ps1'))
$stateFile = Join-Path $env:LOCALAPPDATA 'GPTDaddy\state.json'
$package = Get-AppxPackage -Name 'OpenAI.Codex' | Select-Object -First 1
if (-not $package) { throw 'The official OpenAI.Codex package was not found.' }
$codexExe = Join-Path $package.InstallLocation 'app\ChatGPT.exe'
if (-not (Test-Path -LiteralPath $codexExe)) { throw "Codex executable was not found: $codexExe" }

function Get-CodexMainProcess {
  @(Get-CimInstance Win32_Process -Filter "Name='ChatGPT.exe'" | Where-Object {
    $_.ExecutablePath -ieq $codexExe -and $_.CommandLine -notmatch '--type='
  })
}

$anyCodex = @(Get-CimInstance Win32_Process -Filter "Name='ChatGPT.exe'" | Where-Object {
  $_.ExecutablePath -like '*\WindowsApps\OpenAI.Codex_*\app\ChatGPT.exe' -and
  $_.CommandLine -notmatch '--type='
})
if ($anyCodex.Count -gt 0) {
  throw 'Codex is already open. Close it normally, then run this one-time validation script again.'
}

$portProbe = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $CdpPort)
try { $portProbe.Start() } catch { throw "Port $CdpPort is occupied. Select an unused port." }
finally { $portProbe.Stop() }

$daemonProcesses = @(Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object {
  $_.CommandLine -and $_.CommandLine.Contains($cli) -and $_.CommandLine -match '(?:^|\s)daemon(?:\s|$)'
})
try { $health = Invoke-RestMethod -Uri 'http://127.0.0.1:34873/health' -TimeoutSec 2 } catch { $health = $null }
if ($health -and $daemonProcesses.Count -eq 0) {
  throw 'Port 34873 has a control service, but its process could not be verified as GPTDaddy. No process was stopped.'
}

foreach ($process in $daemonProcesses) {
  Stop-Process -Id $process.ProcessId -Force
}
$existingRunners = @(Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" | Where-Object {
  $_.CommandLine -and $_.CommandLine.Contains($runner)
})
if ($existingRunners.Count -eq 0) {
  Start-Process -FilePath 'powershell.exe' -ArgumentList @(
    '-NoLogo', '-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden',
    '-ExecutionPolicy', 'Bypass', '-File', ('"' + $runner + '"')
  ) -WindowStyle Hidden
}

$ready = $false
for ($i = 0; $i -lt 30; $i++) {
  Start-Sleep -Milliseconds 500
  try {
    $health = Invoke-RestMethod -Uri 'http://127.0.0.1:34873/health' -TimeoutSec 1
    if ($health.ok) { $ready = $true; break }
  } catch { }
}
if (-not $ready) { throw 'GPTDaddy did not become healthy after restart.' }
$startupCommand = (Get-ItemProperty -Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run' -Name GPTDaddy -ErrorAction SilentlyContinue).GPTDaddy
if (-not $startupCommand) { Write-Warning 'The GPTDaddy Windows login startup entry is missing for this user.' }
if (-not (Test-Path -LiteralPath $stateFile)) { throw "Saved wallpaper state was not found: $stateFile" }
$saved = Get-Content -LiteralPath $stateFile -Raw | ConvertFrom-Json
$headers = @{ Authorization = "Bearer $($saved.apiToken)" }

Start-Process -FilePath $codexExe -ArgumentList @(
  '--remote-debugging-address=127.0.0.1', "--remote-debugging-port=$CdpPort"
) | Out-Null

$attached = $false
for ($i = 0; $i -lt 60; $i++) {
  Start-Sleep -Milliseconds 500
  $main = @(Get-CodexMainProcess | Where-Object { $_.CommandLine -match [regex]::Escape("--remote-debugging-port=$CdpPort") })
  if ($main.Count -eq 0) { continue }
  try {
    $targets = @(Invoke-RestMethod -Uri "http://127.0.0.1:$CdpPort/json/list" -TimeoutSec 1)
    $attached = @($targets | Where-Object { $_.type -eq 'page' -and $_.url -eq 'app://-/index.html' }).Count -gt 0
    if ($attached) { break }
  } catch { }
}
if (-not $attached) {
  throw "Codex did not expose a verified main-page CDP target on port $CdpPort. Codex was left open for inspection."
}

$logDir = Join-Path $projectRoot 'work\live-validation'
New-Item -ItemType Directory -Path $logDir -Force | Out-Null
$logPath = Join-Path $logDir ("codex-wallpaper-{0}.jsonl" -f (Get-Date -Format 'yyyyMMdd-HHmmss'))
$sampleCount = 0
$healthyCount = 0
$activeCount = 0
$deadline = (Get-Date).AddSeconds($DurationSeconds)
Write-Host "Codex is open. Switch chats and workspaces during the next $DurationSeconds seconds."
Write-Host "Frame telemetry: $logPath"
while ((Get-Date) -lt $deadline) {
  try {
    $status = Invoke-RestMethod -Uri 'http://127.0.0.1:34873/api/status' -Headers $headers -TimeoutSec 8
    $metric = @($status.lifecycle.metrics | Where-Object { $_.installed }) | Select-Object -First 1
    $sample = [pscustomobject]@{
      at = (Get-Date).ToString('o')
      codexPid = $status.codex.processId
      cdpPort = $status.lifecycle.cdpPort
      active = [bool]$status.lifecycle.active
      playbackHealthy = [bool]$status.lifecycle.playbackHealthy
      currentTime = $metric.currentTime
      presentedFrames = $metric.presentedFrames
      presentedCallbacks = $metric.presentedCallbacks
      droppedFrames = $metric.droppedFrames
      lastFrameAgeMs = $metric.lastFrameAgeMs
      sourceChanges = $metric.sourceChanges
      freezes = $metric.freezes
      recoveryAttempts = $metric.recoveryAttempts
      error = $status.lifecycle.lastError
    }
    $sample | ConvertTo-Json -Compress | Add-Content -LiteralPath $logPath -Encoding utf8
    $sampleCount++
    if ($sample.active) { $activeCount++ }
    if ($sample.playbackHealthy) { $healthyCount++ }
  } catch {
    [pscustomobject]@{ at = (Get-Date).ToString('o'); error = $_.Exception.Message } |
      ConvertTo-Json -Compress | Add-Content -LiteralPath $logPath -Encoding utf8
  }
  Start-Sleep -Seconds 2
}
Write-Host "Samples: $sampleCount; active: $activeCount; healthy: $healthyCount."
Write-Host "Validation log: $logPath"
