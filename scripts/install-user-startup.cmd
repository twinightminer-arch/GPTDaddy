@echo off
setlocal
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-user-startup.ps1" -Install
if errorlevel 1 (
  echo.
  echo GPTDaddy startup registration failed. See the error above.
  pause
  exit /b 1
)
start "" powershell.exe -NoLogo -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "%~dp0run-user-daemon.ps1"
echo.
echo GPTDaddy was started and will also start automatically after future Windows sign-ins.
pause
