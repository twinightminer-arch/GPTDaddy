$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$cli = Join-Path $projectRoot 'src\cli.mjs'
$node = (Get-Command node.exe -ErrorAction Stop).Source

while ($true) {
  if (-not (Test-Path -LiteralPath $cli)) { exit 2 }
  $alreadyRunning = $false
  try {
    $health = Invoke-RestMethod -Uri 'http://127.0.0.1:34873/health' -TimeoutSec 1
    $alreadyRunning = [bool]$health.ok
  } catch { }
  if (-not $alreadyRunning) { & $node $cli daemon }
  Start-Sleep -Seconds 5
}
