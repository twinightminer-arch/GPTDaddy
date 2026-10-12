@echo off
setlocal
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0restart-user-daemon.ps1" -Restart
if errorlevel 1 (
  echo.
  echo GPTDaddy restart needs inspection. No Codex or ChatGPT process was stopped.
  pause
  exit /b 1
)
echo.
echo GPTDaddy daemon restarted.
pause
