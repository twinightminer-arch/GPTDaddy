import { execFileSync } from 'node:child_process';

const DISCOVERY_SCRIPT = `
$ErrorActionPreference='Stop'
$pkg=Get-AppxPackage -Name 'OpenAI.Codex' | Select-Object -First 1
$install=if($pkg){$pkg.InstallLocation}else{$null}
$main=@(Get-CimInstance Win32_Process | Where-Object {
  $_.Name -eq 'ChatGPT.exe' -and $_.CommandLine -notmatch '--type=' -and
  (($_.ExecutablePath -like '*\\WindowsApps\\OpenAI.Codex_*') -or ($_.ExecutablePath -like '*\\AppData\\Local\\OpenAI\\Codex\\*'))
} | Select-Object -First 1)
$p=if($main.Count){$main[0]}else{$null}
$cdpPort=if($p -and $p.CommandLine -match '--remote-debugging-port(?:=|\\s+)(\\d{1,5})(?:\\s|$)'){
  [int]$Matches[1]
}else{$null}
[pscustomobject]@{
  installed=[bool]$pkg
  packageVersion=if($pkg){$pkg.Version.ToString()}else{$null}
  installLocation=$install
  running=[bool]$p
  processId=if($p){$p.ProcessId}else{$null}
  executablePath=if($p){$p.ExecutablePath}else{$null}
  cdpPort=if($cdpPort -ge 1 -and $cdpPort -le 65535){$cdpPort}else{$null}
  cdpEnabled=[bool]($cdpPort -ge 1 -and $cdpPort -le 65535)
  cdpLoopbackOnly=if($p){[bool]($p.CommandLine -match '--remote-debugging-address(?:=|\\s)127\\.0\\.0\\.1')}else{$false}
} | ConvertTo-Json -Compress
`;

export function detectCodexWindows() {
  if (process.platform !== 'win32') return { installed: false, running: false, unsupportedPlatform: true };
  try {
    const output = execFileSync('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', DISCOVERY_SCRIPT], {
      encoding: 'utf8', windowsHide: true, timeout: 8000,
    });
    return JSON.parse(output.trim());
  } catch (error) {
    return { installed: false, running: false, discoveryError: error instanceof Error ? error.message : String(error) };
  }
}
