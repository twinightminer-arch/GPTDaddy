param(
  [switch]$Install,
  [switch]$Uninstall,
  [switch]$ValidateOnly
)

$ErrorActionPreference = 'Stop'
$runKey = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'
$valueName = 'GPTDaddy'
$projectRoot = Split-Path -Parent $PSScriptRoot
$node = (Get-Command node.exe -ErrorAction Stop).Source
$cli = Join-Path $projectRoot 'src\cli.mjs'
$runner = Join-Path $PSScriptRoot 'run-user-daemon.ps1'
$powershell = (Get-Command powershell.exe -ErrorAction Stop).Source
$command = "`"$powershell`" -NoLogo -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$runner`""
$current = (Get-ItemProperty -Path $runKey -Name $valueName -ErrorAction SilentlyContinue).$valueName

if ($ValidateOnly -or (-not $Install -and -not $Uninstall)) {
  [pscustomobject]@{
    Action = 'No changes made'
    RegistryPath = $runKey
    ValueName = $valueName
    Command = $command
    CurrentCommand = $current
    NodeExists = Test-Path -LiteralPath $node
    CliExists = Test-Path -LiteralPath $cli
    RunnerExists = Test-Path -LiteralPath $runner
  } | Format-List
  exit 0
}

if ($Install -and $Uninstall) { throw 'Choose either -Install or -Uninstall.' }

if ($Install) {
  if (-not (Test-Path -LiteralPath $cli) -or -not (Test-Path -LiteralPath $runner)) { throw 'GPTDaddy source files are missing.' }
  if ($current -and $current -ne $command) { throw 'A different GPTDaddy startup command already exists. Inspect it before replacing it.' }
  try {
    New-Item -Path $runKey -Force | Out-Null
    New-ItemProperty -Path $runKey -Name $valueName -Value $command -PropertyType String -Force | Out-Null
  } catch [System.Security.SecurityException] {
    throw 'Windows denied the registry write. Run scripts\install-user-startup.cmd once from a normal desktop session, outside the Codex sandbox.'
  }
  Write-Host 'GPTDaddy user startup registration installed. It starts at next user logon; optional package activation handles verified newly launched Codex instances without CDP.' -ForegroundColor Green
} else {
  if ($current -and $current -ne $command) { throw 'The existing GPTDaddy startup command is different; refusing to remove it.' }
  Remove-ItemProperty -Path $runKey -Name $valueName -ErrorAction SilentlyContinue
  Write-Host 'GPTDaddy user startup registration removed.' -ForegroundColor Green
}
