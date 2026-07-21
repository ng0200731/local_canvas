@echo off
setlocal
cd /d "%~dp0"

if not exist ".venv\Scripts\python.exe" (
  if not exist ".venv\Scripts\uvicorn.exe" (
    echo [error] Missing picture-sherlock .venv. See services\picture-sherlock\README.md
    exit /b 1
  )
)

if exist ".venv\Scripts\uvicorn.exe" (
  ".venv\Scripts\uvicorn.exe" app.main:app --host 127.0.0.1 --port 8091
) else (
  ".venv\Scripts\python.exe" -m uvicorn app.main:app --host 127.0.0.1 --port 8091
)
endlocal
