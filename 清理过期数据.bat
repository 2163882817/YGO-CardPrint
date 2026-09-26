@echo off
setlocal
cd /d "%~dp0"
call npm run db:cleanup
if errorlevel 1 (
  echo Cleanup failed. Check MySQL and .env.
  exit /b 1
)
echo Cleanup complete.
