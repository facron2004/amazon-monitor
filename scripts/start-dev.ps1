# Amazon Monitor - reliable local start (API + Web + Worker)
# Called by start.bat. Can also be run directly:
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\start-dev.ps1

$ErrorActionPreference = "Stop"
$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location $Root

function Write-Step($msg) { Write-Host $msg }
function Write-Ok($msg)   { Write-Host "[OK]  $msg" -ForegroundColor Green }
function Write-Info($msg) { Write-Host "[..] $msg" -ForegroundColor Cyan }
function Write-Err($msg)  { Write-Host "[ERROR] $msg" -ForegroundColor Red }
function Write-Kill($msg) { Write-Host "[KILL] $msg" -ForegroundColor Yellow }

Write-Host "============================================"
Write-Host "  Amazon Monitor - Start"
Write-Host "============================================"
Write-Host ""

# ---- Node version ----
$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCmd) {
  Write-Err "Node.js not found. Install >= 22.12.0 from https://nodejs.org/"
  exit 1
}
$verRaw = (& node -v).Trim().TrimStart("v")
$parts = $verRaw.Split(".")
$major = [int]$parts[0]
$minor = if ($parts.Length -gt 1) { [int]$parts[1] } else { 0 }
Write-Ok "Node.js v$major.$minor.x"
if ($major -lt 22 -or ($major -eq 22 -and $minor -lt 12)) {
  Write-Err "Node.js >= 22.12.0 required, found v$major.$minor.x"
  exit 1
}

# ---- deps ----
if (-not (Test-Path (Join-Path $Root "node_modules"))) {
  Write-Info "npm install..."
  & npm install
  if ($LASTEXITCODE -ne 0) { Write-Err "npm install failed"; exit 1 }
}

# ---- shared package ----
Write-Info "Building shared package..."
& npm run build:shared
if ($LASTEXITCODE -ne 0) { Write-Err "build:shared failed"; exit 1 }
Write-Ok "shared ready"

# ---- log dir ----
$logDir = Join-Path $Root ".logs"
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir | Out-Null }
$ts = Get-Date -Format "yyyyMMdd-HHmmss"
$apiLog    = Join-Path $logDir "api-dev-$ts.log"
$apiErr    = Join-Path $logDir "api-dev-$ts.err.log"
$webLog    = Join-Path $logDir "web-dev-$ts.log"
$webErr    = Join-Path $logDir "web-dev-$ts.err.log"
$workerLog = Join-Path $logDir "worker-$ts.log"
$workerErr = Join-Path $logDir "worker-$ts.err.log"

function Stop-PortListeners([int]$Port) {
  $conns = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
  if (-not $conns) {
    Write-Ok "port $Port free"
    return
  }
  foreach ($c in $conns) {
    $procId = $c.OwningProcess
    Write-Kill "port $Port <- PID $procId"
    try { Stop-Process -Id $procId -Force -ErrorAction Stop } catch {}
  }
}

function Stop-RepoNodeProcesses {
  $patterns = @(
    "apps\api\src\index.ts",
    "apps/api/src/index.ts",
    "apps\api\src\worker.ts",
    "apps/api/src/worker.ts",
    "apps\web\node_modules\vite",
    "apps/web/node_modules/vite",
    "npm-run-all",
    "dev:api",
    "dev:web",
    "tsx watch"
  )
  $rootEsc = [regex]::Escape($Root)
  $count = 0
  Get-CimInstance Win32_Process -Filter "Name='node.exe'" | ForEach-Object {
    $cmd = $_.CommandLine
    if (-not $cmd) { return }
    if ($cmd -notmatch $rootEsc) { return }
    foreach ($p in $patterns) {
      if ($cmd -like "*$p*") {
        try {
          Stop-Process -Id $_.ProcessId -Force -ErrorAction Stop
          Write-Kill "PID $($_.ProcessId) :: $p"
          $count++
        } catch {}
        break
      }
    }
  }
  if ($count -eq 0) { Write-Ok "no leftover amazon-monitor node processes" }
  else { Write-Info "swept $count leftover process(es)" }
}

function Wait-Port([int]$Port, [int]$Seconds = 45) {
  for ($i = 0; $i -lt $Seconds; $i++) {
    $listening = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    if ($listening) { return $true }
    Start-Sleep -Seconds 1
  }
  return $false
}

function Show-Tail([string]$Path, [int]$Lines = 30) {
  if (-not (Test-Path $Path)) {
    Write-Host "         (no log yet: $Path)"
    return
  }
  Write-Host "---- last lines of $Path ----"
  Get-Content -LiteralPath $Path -Tail $Lines -ErrorAction SilentlyContinue
  Write-Host "---- end ----"
}

function Start-Logged([string]$Title, [string]$NpmScript, [string]$OutLog, [string]$ErrLog) {
  # Use cmd so npm.cmd resolution works the same as interactive shell.
  # Redirect stdout/stderr into dated log files so Hidden windows are still debuggable.
  $arg = "/c npm run $NpmScript 1>> `"$OutLog`" 2>> `"$ErrLog`""
  Start-Process -FilePath "cmd.exe" -WorkingDirectory $Root -WindowStyle Hidden -ArgumentList $arg | Out-Null
  Write-Host "[START] $Title"
  Write-Host "        log: $OutLog"
}

Write-Host ""
Write-Info "Checking ports 4000 / 5188..."
Stop-PortListeners 4000
Stop-PortListeners 5188
Write-Info "Sweeping leftover amazon-monitor node processes..."
Stop-RepoNodeProcesses
Start-Sleep -Seconds 1

Write-Host ""
Start-Logged "API  -> http://localhost:4000" "dev:api" $apiLog $apiErr
Start-Logged "Web  -> http://localhost:5188" "dev:web" $webLog $webErr
Start-Logged "Worker" "worker" $workerLog $workerErr

Write-Host ""
Write-Info "Waiting for API on :4000 ..."
if (-not (Wait-Port 4000 45)) {
  Write-Err "API did not open port 4000 within 45s"
  Write-Host "         Check logs:"
  Write-Host "           $apiLog"
  Write-Host "           $apiErr"
  Show-Tail $apiErr
  Show-Tail $apiLog
  exit 1
}
Write-Ok "API listening on http://localhost:4000"

Write-Info "Waiting for Web on :5188 ..."
if (-not (Wait-Port 5188 45)) {
  Write-Err "Web did not open port 5188 within 45s"
  Write-Host "         Check logs:"
  Write-Host "           $webLog"
  Write-Host "           $webErr"
  Show-Tail $webErr
  Show-Tail $webLog
  exit 1
}
Write-Ok "Web listening on http://localhost:5188"

# Optional HTTP smoke (best-effort)
try {
  $r = Invoke-WebRequest -Uri "http://127.0.0.1:4000/api/health" -UseBasicParsing -TimeoutSec 3
  Write-Ok "API /api/health -> $($r.StatusCode)"
} catch {
  # health route may not exist; fall back to any 4xx/2xx on root
  try {
    $null = Invoke-WebRequest -Uri "http://127.0.0.1:4000/" -UseBasicParsing -TimeoutSec 3
    Write-Ok "API root reachable"
  } catch {
    Write-Host "[WARN] API port is open but HTTP probe failed: $($_.Exception.Message)" -ForegroundColor Yellow
  }
}

Write-Host ""
Write-Host "============================================"
Write-Host "[DONE] Amazon Monitor is up" -ForegroundColor Green
Write-Host "  Web    http://localhost:5188"
Write-Host "  API    http://localhost:4000"
Write-Host "  Logs   $logDir"
Write-Host "  Stop   stop.bat"
Write-Host "============================================"
Write-Host ""
exit 0
