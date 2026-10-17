param([switch]$ValidateOnly)

$ErrorActionPreference = 'Stop'
$runtime = Split-Path -Parent $PSScriptRoot
$runner = Join-Path $PSScriptRoot 'runtime-daemon.ps1'
$node = Join-Path $runtime 'node.exe'
$main = Join-Path $runtime 'main.mjs'
foreach ($path in @($runner, $node, $main)) {
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "Incomplete GPTDaddy installation: $path" }
}

function Test-GPTDaddyHealth {
  try { return [bool](Invoke-RestMethod -Uri 'http://127.0.0.1:34873/health' -TimeoutSec 2).ok }
  catch { return $false }
}

if (Test-GPTDaddyHealth) { exit 0 }

# A healthy runner retries the Node daemon itself. Do not spawn a duplicate runner.
$existing = @(Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" | Where-Object {
  $_.ProcessId -ne $PID -and $_.CommandLine -and
  $_.CommandLine.IndexOf($runner, [StringComparison]::OrdinalIgnoreCase) -ge 0
})
if ($existing.Count -gt 1) { throw 'Multiple GPTDaddy runners exist; refusing to add another.' }
if ($ValidateOnly) { [pscustomobject]@{ Healthy = $false; RunnerCount = $existing.Count; Runtime = $runtime }; exit 0 }

if ($existing.Count -eq 0) {
  $powershell = (Get-Command powershell.exe -ErrorAction Stop).Source
  Start-Process -FilePath $powershell -ArgumentList @(
    '-NoLogo', '-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden',
    '-ExecutionPolicy', 'RemoteSigned', '-File', ('"' + $runner + '"')
  ) -WindowStyle Hidden | Out-Null
}
for ($attempt = 0; $attempt -lt 20; $attempt++) {
  if (Test-GPTDaddyHealth) { exit 0 }
  Start-Sleep -Milliseconds 500
}
throw 'GPTDaddy daemon did not become healthy after watchdog check.'
