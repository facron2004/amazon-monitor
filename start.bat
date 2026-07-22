@echo off
setlocal EnableExtensions
chcp 65001 >nul 2>&1
title Amazon Monitor - Start

REM Thin launcher: real logic lives in scripts\start-dev.ps1 so we avoid
REM fragile nested quoting and Hidden windows with no health checks.
set "ROOT=%~dp0"
pushd "%ROOT%" >nul
if errorlevel 1 (
  echo [ERROR] Cannot cd to "%ROOT%"
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%ROOT%scripts\start-dev.ps1"
set "RC=%ERRORLEVEL%"

if not "%RC%"=="0" (
  echo.
  echo [FAIL] Startup aborted. See messages above / .logs\
  popd >nul
  pause
  endlocal & exit /b %RC%
)

popd >nul
endlocal & exit /b 0
