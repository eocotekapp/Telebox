@echo off
cd /d "%~dp0"
echo Installing dependencies...
call npm install
if errorlevel 1 pause && exit /b 1
echo Starting TeleBox API Tester...
call npm start
pause
