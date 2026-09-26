@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title YGO CardPrint Launcher

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-project.ps1"
if errorlevel 1 (
    echo.
    echo Startup failed. Review the error above.
    pause
    exit /b 1
)

echo.
echo The website remains available after this window is closed.
pause
