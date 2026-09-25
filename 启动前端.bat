@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title CardPrint Frontend Launcher

echo.
echo [CardPrint] Checking Node.js and npm...
where node >nul 2>nul
if errorlevel 1 goto :node_error
where npm >nul 2>nul
if errorlevel 1 goto :npm_error

if not exist "node_modules\next\package.json" (
    echo [CardPrint] Dependencies are missing. Installing...
    call npm.cmd install
    if errorlevel 1 goto :install_error
)

set "URL=http://localhost:3000"
echo [CardPrint] Checking whether the frontend is already running...
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "try { Invoke-WebRequest -UseBasicParsing -Uri '%URL%' -TimeoutSec 2 ^| Out-Null; exit 0 } catch { exit 1 }" >nul 2>&1
if errorlevel 1 (
    echo [CardPrint] Starting the Next.js development server...
    start "CardPrint Dev Server" /D "%~dp0" cmd.exe /k "npm.cmd run dev"
) else (
    echo [CardPrint] An existing frontend server was found.
)

echo [CardPrint] Waiting for %URL% ...
set "READY="
for /l %%N in (1,1,30) do (
    powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "try { Invoke-WebRequest -UseBasicParsing -Uri '%URL%' -TimeoutSec 2 ^| Out-Null; exit 0 } catch { exit 1 }" >nul 2>&1
    if not errorlevel 1 (
        set "READY=1"
        goto :open_browser
    )
    timeout /t 1 /nobreak >nul
)

if not defined READY goto :server_error

:open_browser
echo [CardPrint] Opening %URL%
start "" "%URL%"
echo.
echo The frontend is available at %URL%.
echo The Next.js server window must stay open while you use the website.
echo.
pause
exit /b 0

:node_error
echo ERROR: Node.js was not found in PATH.
echo Install Node.js LTS, then run this file again.
goto :failed

:npm_error
echo ERROR: npm was not found in PATH.
echo Reinstall Node.js LTS or repair your PATH, then run this file again.
goto :failed

:install_error
echo ERROR: npm install failed. Check the messages above and try again.
goto :failed

:server_error
echo ERROR: The frontend did not become available at %URL% within 30 seconds.
echo Check the separate Next.js server window for the actual error.
goto :failed

:failed
echo.
pause
exit /b 1