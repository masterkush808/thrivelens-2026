@echo off
title ThriveLens 300K Dataset Builder
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0START_THRIVELENS_300K_BUILD.ps1"
echo.
echo Press any key to close this window.
pause >nul
