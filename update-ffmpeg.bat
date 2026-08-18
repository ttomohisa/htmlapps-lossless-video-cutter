@echo off
setlocal
cd /d "%~dp0"

if "%~1"=="" (
  echo Usage: update-ffmpeg.bat 1.0.1
  echo.
  echo The version is written to dependencies.json, then the pinned GitHub Release
  echo is downloaded, SHA-256 verified, and the standalone HTML is rebuilt.
  exit /b 2
)

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\update-ffmpeg.ps1" "%~1"
if errorlevel 1 (
  echo.
  echo FFmpeg update failed. The requested release may not exist or may not pass verification.
  pause
  exit /b 1
)

endlocal
