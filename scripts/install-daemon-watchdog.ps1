param([switch]$Uninstall)

$ErrorActionPreference = 'Stop'
$taskName = 'GPTDaddy-Daemon-Watchdog'
$script = Join-Path $PSScriptRoot 'ensure-installed-daemon.ps1'
$identity = [Security.Principal.WindowsIdentity]::GetCurrent().Name

if ($Uninstall) {
  $existing = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
  if ($existing) { Unregister-ScheduledTask -TaskName $taskName -Confirm:$false }
  exit 0
}
if (-not (Test-Path -LiteralPath $script -PathType Leaf)) { throw 'GPTDaddy watchdog script is missing.' }
$powershell = (Get-Command powershell.exe -ErrorAction Stop).Source
$action = New-ScheduledTaskAction -Execute $powershell -Argument (
  '-NoLogo -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy RemoteSigned -File "' + $script + '"'
)
$periodic = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) `
  -RepetitionInterval (New-TimeSpan -Minutes 1) -RepetitionDuration (New-TimeSpan -Days 3650)
$logon = New-ScheduledTaskTrigger -AtLogOn -User $identity
$principal = New-ScheduledTaskPrincipal -UserId $identity -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 2) -StartWhenAvailable
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger @($periodic, $logon) `
  -Principal $principal -Settings $settings -Force | Out-Null
$registered = Get-ScheduledTask -TaskName $taskName -ErrorAction Stop
if ($registered.Actions.Execute -ne $powershell -or
    $registered.Actions.Arguments.IndexOf($script, [StringComparison]::OrdinalIgnoreCase) -lt 0) {
  throw 'GPTDaddy watchdog task verification failed.'
}
