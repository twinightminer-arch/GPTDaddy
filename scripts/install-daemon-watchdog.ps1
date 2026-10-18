param([switch]$Uninstall)

$ErrorActionPreference = 'Stop'
$taskName = 'GPTDaddy-Daemon-Watchdog'
$existing = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if (-not $existing) { exit 0 }
$action = @($existing.Actions)
$installedScript = Join-Path $PSScriptRoot 'ensure-installed-daemon.ps1'
if ($action.Count -ne 1 -or
    $action[0].Execute -notmatch '(?i)[\\/]powershell\.exe$' -or
    $action[0].Arguments.IndexOf($installedScript, [StringComparison]::OrdinalIgnoreCase) -lt 0) {
  throw 'Existing watchdog does not belong to this GPTDaddy installation; refusing to remove it.'
}
Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
