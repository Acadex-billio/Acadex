@echo off
setlocal

cd /d "%~dp0"

echo [1/4] Checking Docker CLI...
docker --version >nul 2>&1
if errorlevel 1 (
  echo Docker is not available yet. Install/start Docker Desktop first.
  exit /b 1
)

echo [2/4] Starting Chroma container via docker compose...
docker compose -f docker-compose.chroma.yml up -d
if errorlevel 1 (
  echo Failed to start Chroma with docker compose.
  exit /b 1
)

echo [3/4] Waiting briefly for Chroma...
timeout /t 4 /nobreak >nul

echo [4/4] Probing Chroma heartbeat...
powershell -NoProfile -Command "try { (Invoke-RestMethod -Uri 'http://localhost:8000/api/v1/heartbeat' -TimeoutSec 5) | ConvertTo-Json -Depth 4 } catch { Write-Output $_.Exception.Message; exit 1 }"
if errorlevel 1 (
  echo Chroma heartbeat probe failed.
  exit /b 1
)

echo Chroma is running on http://localhost:8000
exit /b 0
