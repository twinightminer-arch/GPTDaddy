param([switch]$Uninstall)

$ErrorActionPreference = 'Stop'
$taskName = 'GPTDaddy-Daemon-Startup'
$runner = Join-Path $PSScriptRoot 'runtime-daemon.ps1'
$powershell = Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe'
$existing = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($existing) {
  $actions = @($existing.Actions)
  if ($actions.Count -ne 1 -or
      -not [string]::Equals($actions[0].Execute, $powershell, [StringComparison]::OrdinalIgnoreCase) -or
      $actions[0].Arguments.IndexOf($runner, [StringComparison]::OrdinalIgnoreCase) -lt 0) {
    throw 'The startup task does not belong to this GPTDaddy installation.'
  }
  if ($Uninstall) { Unregister-ScheduledTask -TaskName $taskName -Confirm:$false }
  exit 0
}
if ($Uninstall) { exit 0 }
if (-not (Test-Path -LiteralPath $runner -PathType Leaf)) { throw 'GPTDaddy runtime runner is missing.' }
$user = [Security.Principal.WindowsIdentity]::GetCurrent().Name
$action = New-ScheduledTaskAction -Execute $powershell -Argument ('-NoLogo -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy RemoteSigned -File "' + $runner + '"')
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $user
$principal = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -Hidden -ExecutionTimeLimit ([TimeSpan]::Zero)
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description 'Start GPTDaddy once per user logon without a console window' | Out-Null
