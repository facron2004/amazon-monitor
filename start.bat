@echo off
setlocal EnableExtensions EnableDelayedExpansion
chcp 65001 >nul 2>&1
title Amazon Monitor

set "ROOT=%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -Command "$root = '%ROOT%'.TrimEnd('\'); Start-Process -FilePath 'cmd.exe' -WindowStyle Hidden -ArgumentList '/c', ('cd /d "' + $root + '" && npm run dev') | Out-Null"
exit /b

