@echo off
echo Starting Acadex Backend locally...
echo This will fix CORS issues by running backend on localhost:5000
echo.

cd /d "c:\Users\Administrator\Desktop\hnd-platform\hnd_backend"

echo Installing dependencies...
call npm install

echo.
echo Starting backend server...
echo Backend will be available at: http://localhost:5000
echo Frontend should use: http://localhost:5000/api
echo.
echo Press Ctrl+C to stop the server
echo.

call npm start

pause
