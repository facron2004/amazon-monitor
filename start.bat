@echo off
chcp 65001 >nul 2>&1
setlocal EnableDelayedExpansion
title Amazon Monitor

echo ============================================
echo   Amazon Monitor
echo ============================================
echo.

:: ---- Check Node.js ----
where node >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Node.js not found. Install >= 22.12.0
    pause
    exit /b 1
)
for /f "tokens=1 delims=v" %%a in ('node -v') do echo [OK] Node.js %%a

:: ---- Install dependencies ----
if not exist "node_modules" (
    echo.
    echo [..] Installing dependencies...
    call npm install
    if %ERRORLEVEL% neq 0 ( echo [ERROR] npm install failed & pause & exit /b 1 )
    echo [OK] Dependencies ready
)

:: ---- Build shared ----
if not exist "packages\shared\dist" (
    echo [..] Building shared package...
    call npm run build:shared
    if %ERRORLEVEL% neq 0 ( echo [ERROR] Build failed & pause & exit /b 1 )
    echo [OK] Shared package ready
)

:: ---- Playwright ----
if not exist "%LOCALAPPDATA%\ms-playwright" (
    echo [..] Installing Playwright Chromium...
    call npx playwright install chromium
    echo [OK] Playwright ready
)

:: ---- Start ----
echo.
echo [OK] All checks passed
echo [START] API :4000 + Web :5188 + Worker
echo.
echo   http://localhost:5188
echo   http://localhost:4000
echo.
echo   Ctrl+C to stop
echo ============================================
echo.

call npm run dev
