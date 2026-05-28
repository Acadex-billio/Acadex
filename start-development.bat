@echo off
echo Fixing CORS Issue - Complete Solution
echo =====================================
echo.

echo Step 1: Starting backend server...
cd /d "c:\Users\Administrator\Desktop\hnd-platform\hnd_backend"
echo Installing dependencies...
call npm install >nul 2>&1
echo Starting backend on localhost:5000...
start "Backend Server" cmd /k "npm start"

echo.
echo Step 2: Starting frontend...
cd /d "c:\Users\Administrator\Desktop\hnd-platform"
echo Starting frontend on localhost:3000...
start "Frontend Server" cmd /k "npm start"

echo.
echo Both servers are starting...
echo.
echo Backend: http://localhost:5000
echo Frontend: http://localhost:3000
echo.
echo The frontend will now connect to the local backend
echo No CORS issues should occur.
echo.
echo Press any key to close this window...
pause >nul
