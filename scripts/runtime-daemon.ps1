$ErrorActionPreference = 'Stop'
$runtime = Split-Path -Parent $PSScriptRoot
$node = Join-Path $runtime 'node.exe'
$main = Join-Path $runtime 'main.mjs'
$env:GPTDADDY_PUBLIC_ROOT = Join-Path $runtime 'public'
$env:GPTDADDY_CATALOG_WORKER = Join-Path $runtime 'catalog-worker.mjs'
$env:GPTDADDY_ACTIVATION_SCRIPT = Join-Path $PSScriptRoot 'activate-packaged-codex.ps1'

while ($true) {
  if (-not (Test-Path -LiteralPath $node) -or -not (Test-Path -LiteralPath $main)) { exit 2 }
  $healthy = $false
  try { $healthy = [bool](Invoke-RestMethod -Uri 'http://127.0.0.1:34873/health' -TimeoutSec 1).ok }
  catch { }
  if (-not $healthy) { & $node $main daemon }
  Start-Sleep -Seconds 5
}
