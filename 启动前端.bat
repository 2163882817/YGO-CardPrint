@echo off
setlocal
cd /d "%~dp0"
echo [CardPrint] Checking Node.js and npm...
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed or is not in PATH.
  echo Install Node.js LTS, then run this script again.
  pause
  exit /b 1
)
where npm >nul 2>nul
if errorlevel 1 (
  echo npm is not installed or is not in PATH.
  pause
  exit /b 1
)
if not exist "node_modules\next\package.json" (
  echo [CardPrint] Installing dependencies...
  call npm install
  if errorlevel 1 (
    echo Dependency installation failed.
    pause
    exit /b 1
  )
)
echo [CardPrint] Starting frontend at http://localhost:3000
call npm run dev
endlocal
