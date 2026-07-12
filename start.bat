@echo off
setlocal
cd /d "%~dp0"

echo ============================================
echo   Infinite Canvas AI Agent - starting...
echo ============================================
echo.

REM Make sure pnpm is available on PATH.
where pnpm >nul 2>nul
if errorlevel 1 (
  echo [error] pnpm was not found on your PATH.
  echo         Install Node.js ^(https://nodejs.org^), then run:
  echo            npm install -g pnpm
  echo.
  pause
  exit /b 1
)

REM Install dependencies on first run.
if not exist "node_modules" (
  echo Installing dependencies ^(first run, this may take a minute^)...
  call pnpm install
  if errorlevel 1 (
    echo.
    echo [error] Dependency install failed.
    pause
    exit /b 1
  )
  echo.
)

echo Starting the dev server at http://localhost:3000/login?redirect=/
echo ^(Press Ctrl+C in this window to stop.^)
echo.

REM Open the browser a few seconds after the server starts (runs in parallel).
REM `ping` is used as the delay because it works in any console context (timeout does not).
start "" /min cmd /c "ping -n 5 127.0.0.1 >nul & start "" http://localhost:3000/login?redirect=/"

call pnpm dev

endlocal
