@echo off
setlocal
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0remove-legacy-plugin.ps1" -Delete
if errorlevel 1 (
  echo.
  echo Legacy plugin removal needs inspection. See the error above.
  pause
  exit /b 1
)
echo.
echo Legacy plugin source, runtime, shortcuts and marketplace entry are removed.
pause
