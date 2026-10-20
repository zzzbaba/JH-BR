@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ============================================
echo   江汉油田 BR  -  正在启动
echo ============================================
echo.
start "" cmd /c "timeout /t 2 >nul & start http://127.0.0.1:8123"
node server.js
pause
