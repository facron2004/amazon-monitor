@echo off
setlocal EnableExtensions
chcp 65001 >nul 2>&1
title Amazon Monitor - Stop

set "ROOT=%~dp0"
pushd "%ROOT%" >nul

powershell -NoProfile -ExecutionPolicy Bypass -File "%ROOT%scripts\stop-dev.ps1"
set "RC=%ERRORLEVEL%"

echo.
pause
popd >nul
endlocal & exit /b %RC%
