#ifndef AppVersion
  #error AppVersion must be passed by the build script
#endif

[Setup]
AppId={{6B4A27CB-47CB-4A30-8D6C-606F937C3058}
AppName=GPTDaddy
AppVersion={#AppVersion}
AppPublisher=GPTDaddy Contributors
DefaultDirName={code:GetStableInstallDir}
UsePreviousAppDir=no
DisableDirPage=yes
DefaultGroupName=GPTDaddy
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
Compression=lzma2
SolidCompression=yes
OutputDir=..\dist
OutputBaseFilename=GPTDaddy-{#AppVersion}-Setup
UninstallDisplayIcon={app}\node.exe
CloseApplications=yes
RestartApplications=no

[Tasks]
Name: desktopicon; Description: "创建 GPTDaddy 控制面板桌面快捷方式"; GroupDescription: "附加快捷方式："; Flags: unchecked

[Files]
Source: "..\dist\runtime-v{#AppVersion}\*"; DestDir: "{app}"; Flags: recursesubdirs createallsubdirs ignoreversion

[Icons]
Name: "{group}\GPTDaddy 控制面板"; Filename: "http://127.0.0.1:34873/"
Name: "{userdesktop}\GPTDaddy 控制面板"; Filename: "http://127.0.0.1:34873/"; Tasks: desktopicon

[Registry]
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: string; ValueName: "GPTDaddy"; ValueData: """{sys}\wscript.exe"" //B //Nologo ""{app}\scripts\start-daemon-hidden.vbs"""; Flags: uninsdeletevalue

[Run]
Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoLogo -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy RemoteSigned -File ""{app}\scripts\install-daemon-watchdog.ps1"" -Uninstall"; Description: "移除旧版周期检查任务"; Flags: runhidden
Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoLogo -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy RemoteSigned -File ""{app}\scripts\activate-installed-daemon.ps1"""; Description: "更新并启动 GPTDaddy 后台服务"; Flags: runhidden

[UninstallRun]
Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoLogo -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy RemoteSigned -File ""{app}\scripts\install-daemon-watchdog.ps1"" -Uninstall"; RunOnceId: "RemoveGPTDaddyWatchdog"; Flags: runhidden

[Code]
function GetStableInstallDir(Param: String): String;
var
  Profile: String;
begin
  Profile := GetEnv('USERPROFILE');
  if Profile = '' then
    RaiseException('Windows user profile is unavailable.');
  Result := AddBackslash(Profile) + 'AppData\Local\Programs\GPTDaddy';
end;

function PrepareToInstall(var NeedsRestart: Boolean): String;
var
  ActualDir, ExpectedDir: String;
begin
  ActualDir := RemoveBackslashUnlessRoot(ExpandConstant('{app}'));
  ExpectedDir := RemoveBackslashUnlessRoot(GetStableInstallDir(''));
  if CompareText(ActualDir, ExpectedDir) <> 0 then
    Result := 'Refusing to install GPTDaddy outside the stable per-user directory: ' + ExpectedDir
  else
    Result := '';
end;
