param(
  [int]$ExpectedProcessId = 0,
  [Parameter(Mandatory = $true)][string]$ReportPath,
  [int]$CdpPort = 9335,
  [switch]$Automatic
)

$ErrorActionPreference = 'Stop'
$report = [ordered]@{
  startedAt = (Get-Date).ToString('o')
  previousProcessId = $ExpectedProcessId
  closeMethod = 'Codex File > Quit via UI Automation'
  activationMethod = 'IApplicationActivationManager.ActivateApplication'
  port = $CdpPort
  result = 'incomplete'
  automatic = [bool]$Automatic
}

function Save-Report {
  $report.finishedAt = (Get-Date).ToString('o')
  New-Item -ItemType Directory -Path (Split-Path -Parent $ReportPath) -Force | Out-Null
  $json = $report | ConvertTo-Json -Depth 5
  [IO.File]::WriteAllText($ReportPath, $json, (New-Object Text.UTF8Encoding($false)))
}

try {
  if (-not $Automatic) { Start-Sleep -Seconds 5 }
  $package = Get-AppxPackage -Name OpenAI.Codex | Select-Object -First 1
  if (-not $package) { throw 'Official OpenAI.Codex package not found.' }
  $exe = Join-Path $package.InstallLocation 'app\ChatGPT.exe'
  $main = @(Get-CimInstance Win32_Process -Filter "Name='ChatGPT.exe'" | Where-Object {
    $_.ExecutablePath -eq $exe -and $_.CommandLine -notmatch '--type='
  })
  if ($ExpectedProcessId -eq 0 -and $main.Count -eq 1) {
    $ExpectedProcessId = [int]$main[0].ProcessId
    $report.previousProcessId = $ExpectedProcessId
  }
  if ($main.Count -ne 1 -or $main[0].ProcessId -ne $ExpectedProcessId) {
    throw 'Expected exactly one verified official Codex main process.'
  }
  if ($main[0].CommandLine -match '--remote-debugging-port') { throw 'Codex already has CDP; refusing a needless restart.' }
  if ($CdpPort -lt 1024 -or $CdpPort -gt 65535) { throw 'CDP port outside allowed user range.' }
  $listener = Get-NetTCPConnection -LocalPort $CdpPort -State Listen -ErrorAction SilentlyContinue
  if ($listener) { throw 'CDP port is already occupied.' }
  $report.package = $package.PackageFullName
  $report.appUserModelId = $package.PackageFamilyName + '!App'

  Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
public static class GptDaddyForeground {
  public delegate bool EnumCallback(IntPtr window, IntPtr data);
  [DllImport("user32.dll")] private static extern bool EnumWindows(EnumCallback callback, IntPtr data);
  [DllImport("user32.dll")] private static extern bool IsWindowVisible(IntPtr window);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr window, out uint processId);
  public static IntPtr[] VisibleWindows(uint pid) {
    var windows = new List<IntPtr>();
    EnumWindows((window, data) => {
      uint owner;
      GetWindowThreadProcessId(window, out owner);
      if (owner == pid && IsWindowVisible(window)) windows.Add(window);
      return true;
    }, IntPtr.Zero);
    return windows.ToArray();
  }
}
public static class GptDaddyActivation {
  [UnmanagedFunctionPointer(CallingConvention.StdCall)]
  private delegate int ActivateDelegate(IntPtr self,
    [MarshalAs(UnmanagedType.LPWStr)] string appUserModelId,
    [MarshalAs(UnmanagedType.LPWStr)] string arguments,
    uint options, out uint processId);

  private static IntPtr OpenInterface(out object manager, out IntPtr unknown) {
    manager = Activator.CreateInstance(Type.GetTypeFromCLSID(
      new Guid("45BA127D-10A8-46EA-8AB7-56EA9078943C")));
    unknown = Marshal.GetIUnknownForObject(manager);
    Guid iid = new Guid("2E941141-7F97-4756-BA1D-9DECDE894A3D");
    IntPtr requested;
    int hr = Marshal.QueryInterface(unknown, ref iid, out requested);
    if (hr < 0) {
      Marshal.Release(unknown);
      Marshal.ReleaseComObject(manager);
      throw new COMException("IApplicationActivationManager QueryInterface failed", hr);
    }
    return requested;
  }

  public static string Probe() {
    object manager;
    IntPtr unknown;
    IntPtr requested = OpenInterface(out manager, out unknown);
    try { return "IApplicationActivationManager available"; }
    finally {
      Marshal.Release(requested);
      Marshal.Release(unknown);
      Marshal.ReleaseComObject(manager);
    }
  }

  public static uint Activate(string appUserModelId, string arguments) {
    object manager;
    IntPtr unknown;
    IntPtr requested = OpenInterface(out manager, out unknown);
    try {
      IntPtr vtable = Marshal.ReadIntPtr(requested);
      IntPtr method = Marshal.ReadIntPtr(vtable, 3 * IntPtr.Size);
      var invoke = (ActivateDelegate)Marshal.GetDelegateForFunctionPointer(method, typeof(ActivateDelegate));
      uint processId;
      int hr = invoke(requested, appUserModelId, arguments, 0, out processId);
      if (hr < 0) Marshal.ThrowExceptionForHR(hr);
      return processId;
    } finally {
      Marshal.Release(requested);
      Marshal.Release(unknown);
      Marshal.ReleaseComObject(manager);
    }
  }
}
'@
  $report.activationInterfaceProbe = [GptDaddyActivation]::Probe()
  Add-Type -AssemblyName UIAutomationClient
  $process = Get-Process -Id $ExpectedProcessId -ErrorAction Stop
  $mainWindow = [IntPtr]::Zero
  $fileMenuCondition = New-Object System.Windows.Automation.PropertyCondition(
    [System.Windows.Automation.AutomationElement]::AutomationIdProperty,
    'application-menu-trigger-file-menu'
  )
  for ($scan = 0; $scan -lt 20 -and $mainWindow -eq [IntPtr]::Zero; $scan++) {
    foreach ($window in [GptDaddyForeground]::VisibleWindows([uint32]$ExpectedProcessId)) {
      try {
        $root = [System.Windows.Automation.AutomationElement]::FromHandle($window)
        if ($root.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $fileMenuCondition)) {
          $mainWindow = $window
          break
        }
      } catch { # Window was replaced while scanning.
      }
    }
    if ($mainWindow -eq [IntPtr]::Zero) { Start-Sleep -Milliseconds 500 }
  }
  if ($mainWindow -eq [IntPtr]::Zero) {
    # A login-started daemon can see the process before its interactive window exists.
    # Do not close or reactivate Codex until its own Quit control is safely available.
    $report.result = 'deferred'
    $report.error = 'The verified Codex chat window and File menu are not ready.'
    return
  }
  $report.chatWindowHandle = $mainWindow.ToInt64()
  $chatRoot = [System.Windows.Automation.AutomationElement]::FromHandle($mainWindow)
  $fileMenu = $chatRoot.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $fileMenuCondition)
  $expand = $fileMenu.GetCurrentPattern([System.Windows.Automation.ExpandCollapsePattern]::Pattern)
  $report.fileMenuStateBefore = [string]$expand.Current.ExpandCollapseState
  if ($expand.Current.ExpandCollapseState -ne [System.Windows.Automation.ExpandCollapseState]::Expanded) { $expand.Expand() }
  $quitItem = $null
  for ($attempt = 0; $attempt -lt 10 -and -not $quitItem; $attempt++) {
    Start-Sleep -Milliseconds 150
    $items = $chatRoot.FindAll([System.Windows.Automation.TreeScope]::Descendants,
      (New-Object System.Windows.Automation.PropertyCondition(
        [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
        [System.Windows.Automation.ControlType]::MenuItem)))
    $foundItems = @($items | Where-Object { $_.Current.Name -match 'ChatGPT Ctrl\+Q$' })
    if ($foundItems.Count -eq 1) { $quitItem = $foundItems[0] }
    if ($attempt -eq 9) {
      $report.fileMenuStateAfter = [string]$expand.Current.ExpandCollapseState
      $report.visibleMenuItems = @($items | ForEach-Object { $_.Current.Name } | Where-Object { $_ -and $_.Length -lt 80 })
    }
  }
  if (-not $quitItem) { throw 'Codex File > Quit was not found; no process was stopped.' }
  $quitItem.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke()
  $report.quitRequested = $true
  for ($index = 0; $index -lt 30; $index++) {
    Start-Sleep -Seconds 1
    if (-not (Get-Process -Id $ExpectedProcessId -ErrorAction SilentlyContinue)) { break }
  }
  if (Get-Process -Id $ExpectedProcessId -ErrorAction SilentlyContinue) {
    throw 'Codex did not exit after its own Ctrl+Q; no force-stop was used.'
  }
  $report.previousProcessExited = $true

  $arguments = "--remote-debugging-address=127.0.0.1 --remote-debugging-port=$CdpPort"
  [uint32]$activatedPid = [GptDaddyActivation]::Activate($report.appUserModelId, $arguments)
  $report.activationHresult = '0x00000000'
  $report.activationProcessId = $activatedPid
  for ($index = 0; $index -lt 25; $index++) {
    Start-Sleep -Seconds 1
    $newMain = Get-CimInstance Win32_Process -Filter "ProcessId=$activatedPid"
    if ($newMain -and $newMain.ExecutablePath -eq $exe) { break }
  }
  if (-not $newMain -or $newMain.ExecutablePath -ne $exe) { throw 'Activation did not yield the verified Codex executable.' }
  $report.newProcessId = $newMain.ProcessId
  $report.commandLineHasCdp = [bool]($newMain.CommandLine -match [regex]::Escape("--remote-debugging-port=$CdpPort"))
  Start-Sleep -Seconds 10
  $statePath = Join-Path $env:LOCALAPPDATA 'GPTDaddy\state.json'
  if (Test-Path -LiteralPath $statePath) {
    $state = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
    $report.wallpaperEnabled = [bool]$state.wallpaper.enabled
    if ($state.apiToken) {
      try {
        $status = Invoke-RestMethod -Uri 'http://127.0.0.1:34873/api/status' -Headers @{
          Authorization = "Bearer $($state.apiToken)"
        } -TimeoutSec 5
        $report.lifecycleActive = [bool]$status.lifecycle.active
        $report.playbackHealthy = [bool]$status.lifecycle.playbackHealthy
      } catch { $report.statusError = $_.Exception.Message }
    }
  }
  $report.result = if ($report.commandLineHasCdp -and $report.lifecycleActive) { 'passed' } else { 'failed' }
} catch {
  $report.error = $_.Exception.Message
  if ($report.previousProcessExited -and -not $report.newProcessId) {
    try {
      Start-Process -FilePath 'explorer.exe' -ArgumentList "shell:AppsFolder\$($report.appUserModelId)"
      $report.normalLaunchFallbackRequested = $true
    } catch { $report.fallbackError = $_.Exception.Message }
  }
} finally {
  Save-Report
}
