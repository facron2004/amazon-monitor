@echo off
chcp 65001 >nul 2>&1
setlocal EnableDelayedExpansion
title Amazon Monitor - Stop

echo ============================================
echo   Amazon Monitor - Stop
echo ============================================
echo.

set "KILLED=0"
set "PORTS_TO_KILL=4000 5188"

REM ---- Kill processes listening on our ports (API + Web) ----
for %%P in (%PORTS_TO_KILL%) do (
    set "FOUND=0"
    for /f "tokens=5" %%A in ('netstat -ano ^| findstr /R /C:":%%P " ^| findstr LISTENING') do (
        set /a FOUND+=1
        echo [KILL] port %%P ^<- PID %%A
        taskkill /F /PID %%A >nul 2>&1
        if !ERRORLEVEL! equ 0 ( set /a KILLED+=1 )
    )
    if !FOUND! equ 0 echo [SKIP] port %%P not in use
)

REM ---- Kill worker by window title (the one start.bat opened) ----
echo.
echo [..] Stopping Worker window...
taskkill /F /FI "WINDOWTITLE eq Amazon Monitor - Worker" >nul 2>&1
if !ERRORLEVEL! equ 0 (
    echo [KILL] Worker window closed
    set /a KILLED+=1
) else (
    echo [SKIP] Worker window not found
)

REM ---- Fallback sweep: any node process whose command line mentions worker.ts ----
echo.
echo [..] Sweeping leftover worker processes...
set "SWEEP_PIDS="
for /f "usebackq tokens=2" %%A in (`tasklist /FI "IMAGENAME eq node.exe" /FO CSV /NH 2^>nul`) do (
    set "PID=%%~A"
    REM wmic is deprecated but still works on Win10/11; skip if it fails
    wmic process where "ProcessId=!PID!" get CommandLine /FORMAT:LIST 2>nul | findstr /I "worker.ts" >nul 2>&1
    if !ERRORLEVEL! equ 0 (
        echo [KILL] worker process PID !PID!
        taskkill /F /PID !PID! >nul 2>&1
        if !ERRORLEVEL! equ 0 set /a KILLED+=1
    )
)

echo.
echo ============================================
if !KILLED! gtr 0 (
    echo [DONE] Stopped !KILLED! process^(es^). Ports should be free now.
) else (
    echo [DONE] Nothing to stop - looks like it's already down.
)
echo ============================================
echo.

REM ---- Confirm ports free ----
for %%P in (%PORTS_TO_KILL%) do (
    netstat -ano | findstr /R /C:":%%P " | findstr LISTENING >nul 2>&1
    if !ERRORLEVEL! equ 0 (
        echo [WARN] Port %%P still occupied!
    ) else (
        echo [OK]   Port %%P free
    )
)

echo.
pause
endlocal