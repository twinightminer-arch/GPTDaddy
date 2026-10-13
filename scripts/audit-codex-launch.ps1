$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Text;
using System.Runtime.InteropServices;
public static class GptDaddyAppModelAudit {
  [DllImport("kernel32.dll", SetLastError = true)] private static extern IntPtr OpenProcess(uint access, bool inherit, uint pid);
  [DllImport("kernel32.dll")] private static extern bool CloseHandle(IntPtr handle);
  [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] private static extern int GetApplicationUserModelId(IntPtr process, ref uint length, StringBuilder id);
  public static string Read(uint pid) {
    IntPtr process = OpenProcess(0x1000, false, pid);
    if (process == IntPtr.Zero) return "OpenProcess failed";
    try {
      uint length = 0;
      int first = GetApplicationUserModelId(process, ref length, null);
      if (length == 0) return "Win32 error " + first;
      var id = new StringBuilder((int)length);
      int result = GetApplicationUserModelId(process, ref length, id);
      return result == 0 ? id.ToString() : "Win32 error " + result;
    } finally { CloseHandle(process); }
  }
}
'@

$package = Get-AppxPackage -Name 'OpenAI.Codex' | Select-Object -First 1
$main = @(Get-CimInstance Win32_Process -Filter "Name='ChatGPT.exe'" | Where-Object {
  $_.CommandLine -notmatch '--type=' -and $package -and
  $_.ExecutablePath.StartsWith($package.InstallLocation + '\', [StringComparison]::OrdinalIgnoreCase)
})
$shell = New-Object -ComObject Shell.Application
$wscript = New-Object -ComObject WScript.Shell
$desktop = (Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\Shell Folders').Desktop
$directories = @($desktop, [Environment]::GetFolderPath('CommonDesktopDirectory'),
  [Environment]::GetFolderPath('StartMenu'), [Environment]::GetFolderPath('CommonStartMenu')) |
  Where-Object { $_ -and (Test-Path -LiteralPath $_) } | Select-Object -Unique

$shortcuts = @(foreach ($directory in $directories) {
  Get-ChildItem -LiteralPath $directory -Filter '*.lnk' -Recurse -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -match 'Codex|ChatGPT' } | ForEach-Object {
      $link = $wscript.CreateShortcut($_.FullName)
      $item = $shell.NameSpace($_.DirectoryName).ParseName($_.Name)
      $target = [string]$item.ExtendedProperty('System.Link.TargetParsingPath')
      $id = [string]$item.ExtendedProperty('System.AppUserModel.ID')
      if (($package -and $target.StartsWith($package.InstallLocation + '\', [StringComparison]::OrdinalIgnoreCase)) -or
          ($package -and $target -eq ($package.PackageFamilyName + '!App')) -or
          $id -eq 'com.openai.codex') {
        [pscustomobject]@{
          Path = $_.FullName
          Target = $target
          Arguments = $link.Arguments
          AppUserModelId = $id
        }
      }
    }
})

$taskband = Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\Taskband' -ErrorAction SilentlyContinue
$pinnedIds = @()
if ($taskband -and $taskband.Favorites) {
  $text = [Text.Encoding]::Unicode.GetString($taskband.Favorites)
  $pinnedIds = @([regex]::Matches($text, 'OpenAI\.Codex_[A-Za-z0-9]+!App') |
    ForEach-Object { $_.Value } | Select-Object -Unique)
}

[pscustomobject]@{
  PackageFullName = $package.PackageFullName
  PackageFamilyName = $package.PackageFamilyName
  MainProcesses = @($main | ForEach-Object {
    [pscustomobject]@{
      ProcessId = $_.ProcessId
      ExecutablePath = $_.ExecutablePath
      ApplicationIdentity = [GptDaddyAppModelAudit]::Read([uint32]$_.ProcessId)
      HasRemoteDebuggingPort = [bool]($_.CommandLine -match '--remote-debugging-port(?:=|\s+)\d+')
    }
  })
  OriginalShortcuts = $shortcuts
  PinnedPackageIdsFound = $pinnedIds
  Note = 'Taskband parsing is diagnostic only; an empty result does not prove there is no pinned icon.'
} | ConvertTo-Json -Depth 6
