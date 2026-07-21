@echo off
setlocal
cd /d "%~dp0"

if not exist ".venv\Scripts\python.exe" (
  echo [error] Missing .venv. Create it first:
  echo   python -m venv .venv
  echo   .venv\Scripts\python.exe -m pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu
  echo   .venv\Scripts\python.exe -m pip install -r requirements.txt
  exit /b 1
)

if not defined MILVUS_MATCH_BACKEND set MILVUS_MATCH_BACKEND=numpy
if not defined MILVUS_MATCH_HOST set MILVUS_MATCH_HOST=127.0.0.1
if not defined MILVUS_MATCH_PORT set MILVUS_MATCH_PORT=8092

echo Starting milvus-match on %MILVUS_MATCH_HOST%:%MILVUS_MATCH_PORT% backend=%MILVUS_MATCH_BACKEND%
".venv\Scripts\python.exe" -m uvicorn app.main:app --host %MILVUS_MATCH_HOST% --port %MILVUS_MATCH_PORT%
endlocal
