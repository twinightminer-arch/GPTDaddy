@echo off
setlocal
set "SCRIPT=%~dp0activate-packaged-codex.ps1"
set "REPORT=%~dp0..\work\native-restart\packaged-activation-outside-sandbox.json"
if not exist "%SCRIPT%" (
  echo Probe script is missing: %SCRIPT%
  exit /b 1
)
echo One-time Codex package activation test.
echo This may close and reopen Codex once. It never force-stops a process.
echo Do not run it while Codex is executing a task.
powershell.exe -NoLogo -NoProfile -ExecutionPolicy RemoteSigned -File "%SCRIPT%" -ReportPath "%REPORT%" -CdpPort 9335
if exist "%REPORT%" (
  echo.
  echo Result saved to: %REPORT%
) else (
  echo.
  echo No report was created. Please send a screenshot of this window.
)
echo This window will close automatically in 10 seconds.
timeout /t 10 /nobreak >nul
endlocal
