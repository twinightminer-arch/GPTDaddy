param(
  [Parameter(Mandatory = $true)][int]$ExpectedProcessId,
  [Parameter(Mandatory = $true)][string]$DesktopShortcut,
  [Parameter(Mandatory = $true)][string]$ReportPath
)

$ErrorActionPreference = 'Stop'
$report = [ordered]@{
  startedAt = (Get-Date).ToString('o')
  entry = 'existing desktop shortcut'
  expectedProcessId = $ExpectedProcessId
  closeRequested = $false
  originalProcessExited = $false
  launchRequested = $false
  newProcessId = $null
  newProcessHasCdp = $null
  wallpaperEnabled = $null
  lifecycleActive = $null
  playbackHealthy = $null
  result = 'not-run'
  error = $null
}

function Save-Report {
  $report.finishedAt = (Get-Date).ToString('o')
  $report | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $ReportPath -Encoding UTF8
}

try {
  # Give the invoking Codex tool call time to return before closing its window.
  Start-Sleep -Seconds 5
  $package = Get-AppxPackage -Name OpenAI.Codex | Select-Object -First 1
  if (-not $package) { throw 'The official OpenAI.Codex package is not installed.' }
  $expectedExe = Join-Path $package.InstallLocation 'app\ChatGPT.exe'
  $current = Get-CimInstance Win32_Process -Filter "ProcessId=$ExpectedProcessId"
  if (-not $current -or $current.ExecutablePath -ne $expectedExe -or $current.CommandLine -match '--type=') {
    throw 'The requested PID is not the verified official Codex main process.'
  }
  $mainProcesses = @(Get-CimInstance Win32_Process -Filter "Name='ChatGPT.exe'" | Where-Object {
    $_.ExecutablePath -eq $expectedExe -and $_.CommandLine -notmatch '--type='
  })
  if ($mainProcesses.Count -ne 1) { throw 'Expected exactly one official Codex main process.' }

  $wscript = New-Object -ComObject WScript.Shell
  $shortcut = $wscript.CreateShortcut($DesktopShortcut)
  $shell = New-Object -ComObject Shell.Application
  $item = $shell.NameSpace((Split-Path -Parent $DesktopShortcut)).ParseName((Split-Path -Leaf $DesktopShortcut))
  $target = [string]$item.ExtendedProperty('System.Link.TargetParsingPath')
  if ($target -ne ($package.PackageFamilyName + '!App') -or $shortcut.Arguments) {
    throw 'The existing desktop shortcut is not the verified unmodified Codex package entry.'
  }
  $report.package = $package.PackageFullName
  $report.shortcutTarget = $target

  # Closing a window leaves the Codex main process running on this build.
  # Use the app's own File > Quit command, scoped to the verified process.
  $quitScript = Join-Path $PSScriptRoot 'quit-verified-codex.mjs'
  $node = (Get-Command node.exe -ErrorAction Stop).Source
  $quitOutput = & $node $quitScript $ExpectedProcessId 2>&1
  if ($LASTEXITCODE -ne 0) { throw "Codex File > Quit failed: $quitOutput" }
  $report.appQuitRequested = $true
  for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Seconds 1
    if (-not (Get-Process -Id $ExpectedProcessId -ErrorAction SilentlyContinue)) { break }
  }
  $report.originalProcessExited = -not [bool](Get-Process -Id $ExpectedProcessId -ErrorAction SilentlyContinue)
  if (-not $report.originalProcessExited) { throw 'Codex did not fully exit after its own Quit command; no force-stop was used.' }

  Start-Process -FilePath $DesktopShortcut
  $report.launchRequested = $true
  $newMain = $null
  for ($i = 0; $i -lt 45; $i++) {
    Start-Sleep -Seconds 1
    $newMain = Get-CimInstance Win32_Process -Filter "Name='ChatGPT.exe'" | Where-Object {
      $_.ExecutablePath -eq $expectedExe -and $_.CommandLine -notmatch '--type=' -and $_.ProcessId -ne $ExpectedProcessId
    } | Select-Object -First 1
    if ($newMain) { break }
  }
  if (-not $newMain) { throw 'No new official Codex main process appeared after package shortcut launch.' }
  $report.newProcessId = $newMain.ProcessId
  $report.newProcessHasCdp = [bool]($newMain.CommandLine -match '--remote-debugging-port(?:=|\s+)\d+')
  Start-Sleep -Seconds 12

  $statePath = Join-Path $env:LOCALAPPDATA 'GPTDaddy\state.json'
  if (Test-Path -LiteralPath $statePath) {
    $state = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
    $report.wallpaperEnabled = [bool]$state.wallpaper.enabled
    if ($state.apiToken) {
      try {
        $headers = @{ Authorization = "Bearer $($state.apiToken)" }
        $status = Invoke-RestMethod -Uri 'http://127.0.0.1:34873/api/status' -Headers $headers -TimeoutSec 5
        $report.lifecycleActive = [bool]$status.lifecycle.active
        $report.playbackHealthy = [bool]$status.lifecycle.playbackHealthy
      } catch {
        $report.statusError = $_.Exception.Message
      }
    }
  }
  $report.result = if ($report.wallpaperEnabled -and $report.lifecycleActive -and $report.newProcessHasCdp) { 'passed' } else { 'failed' }
} catch {
  $report.result = 'incomplete'
  $report.error = $_.Exception.Message
} finally {
  Save-Report
}
