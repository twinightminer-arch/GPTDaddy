@echo off
setlocal
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0validate-live-codex.ps1"
if errorlevel 1 (
  echo.
  echo Live validation did not complete. See the message above.
)
echo.
pause
