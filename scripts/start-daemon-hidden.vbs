Option Explicit
Dim shell, files, scriptFolder, powerShell, runner, command
Set shell = CreateObject("WScript.Shell")
Set files = CreateObject("Scripting.FileSystemObject")
scriptFolder = files.GetParentFolderName(WScript.ScriptFullName)
powerShell = shell.ExpandEnvironmentStrings("%SystemRoot%") & "\System32\WindowsPowerShell\v1.0\powershell.exe"
runner = files.BuildPath(scriptFolder, "ensure-installed-daemon.ps1")
If Not files.FileExists(runner) Then WScript.Quit 2
command = Chr(34) & powerShell & Chr(34) & " -NoLogo -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy RemoteSigned -File " & Chr(34) & runner & Chr(34)
shell.Run command, 0, False
