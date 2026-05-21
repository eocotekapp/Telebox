@echo off
cd /d "%~dp0"
echo Installing dependencies...
npm install
echo Starting TeleBox Drive...
npm start
pause
