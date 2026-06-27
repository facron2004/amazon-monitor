@echo off
chcp 65001 >nul 2>&1
title Amazon Monitor

REM ---- Anchor everything to the script's own directory ----
pushd "%~dp0" >nul

echo ============================================
echo   Amazon Monitor
echo ============================================
echo.

REM ---- Check Node.js ----
where node >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Node.js not found. Install ^>= 22.12.0 from https://nodejs.org/
    pause
    popd
    exit /b 1
)
for /f "tokens=1 delims=v" %%a in ('node -v') do (
    set "NODE_VER=%%a"
    set "NODE_MAJOR=%%a"
)
REM NODE_VER looks like "22.22.3" -> parse major.minor
for /f "tokens=1,2 delims=." %%i in ("%NODE_VER%") do (
    set "NODE_MAJOR=%%i"
    set "NODE_MINOR=%%j"
)
echo [OK] Node.js v%NODE_MAJOR%.%NODE_MINOR%.x detected
if %NODE_MAJOR% LSS 22 (
    echo [ERROR] Node.js ^>= 22.12.0 required, found v%NODE_MAJOR%.%NODE_MINOR%.x
    pause
    popd
    exit /b 1
)
if %NODE_MAJOR% EQU 22 (
    if %NODE_MINOR% LSS 12 (
        echo [ERROR] Node.js ^>= 22.12.0 required, found v%NODE_MAJOR%.%NODE_MINOR%.x
        pause
        popd
        exit /b 1
    )
)

REM ---- Install dependencies (root workspaces) ----
if not exist "node_modules" (
    echo.
    echo [..] Installing dependencies...
    call npm install
    if %ERRORLEVEL% neq 0 (
        echo [ERROR] npm install failed
        pause
        popd
        exit /b 1
    )
    echo [OK] Dependencies ready
)

REM ---- Build shared package ----
if not exist "packages\shared\dist" (
    echo [..] Building shared package...
    call npm run build:shared
    if %ERRORLEVEL% neq 0 (
        echo [ERROR] Build failed
        pause
        popd
        exit /b 1
    )
    echo [OK] Shared package ready
)

REM ---- Playwright Chromium ----
if not exist "%LOCALAPPDATA%\ms-playwright" (
    echo [..] Installing Playwright Chromium...
    call npx playwright install chromium
    if %ERRORLEVEL% neq 0 (
        echo [WARN] Playwright install failed - browser tests may not work
    ) else (
        echo [OK] Playwright ready
    )
)

echo.
echo [OK] All checks passed
echo [START] API :4000 + Web :5188 + Worker
echo.
echo   Web    http://localhost:5188
echo   API    http://localhost:4000
echo.
echo   Ctrl+C to stop
echo ============================================
echo.

REM ---- Start worker in a separate window so it survives the parent ----
start "Amazon Monitor - Worker" cmd /c "npm --workspace @amazon-monitor/api run worker"

REM ---- Start API + Web (parallel via npm-run-all) ----
call npm run dev

popd