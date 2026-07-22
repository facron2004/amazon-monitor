# Amazon Monitor - stop local API + Web + Worker
# Called by stop.bat. Can also be run directly:
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\stop-dev.ps1

$ErrorActionPreference = "Continue"
$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location $Root

function Write-Ok($msg)   { Write-Host "[OK]  $msg" -ForegroundColor Green }
function Write-Info($msg) { Write-Host "[..] $msg" -ForegroundColor Cyan }
function Write-Kill($msg) { Write-Host "[KILL] $msg" -ForegroundColor Yellow }
function Write-Skip($msg) { Write-Host "[SKIP] $msg" }
function Write-Warn($msg) { Write-Host "[WARN] $msg" -ForegroundColor Yellow }

Write-Host "============================================"
Write-Host "  Amazon Monitor - Stop"
Write-Host "============================================"
Write-Host ""

$killed = 0

function Stop-PortListeners([int]$Port) {
  $conns = @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
  if ($conns.Count -eq 0) {
    Write-Skip "port $Port not in use"
    return 0
  }
  $n = 0
  foreach ($c in $conns) {
    $procId = $c.OwningProcess
    Write-Kill "port $Port <- PID $procId"
    try {
      Stop-Process -Id $procId -Force -ErrorAction Stop
      $n++
    } catch {}
  }
  return $n
}

$killed += Stop-PortListeners 4000
$killed += Stop-PortListeners 5188

Write-Host ""
Write-Info "Sweeping amazon-monitor node processes under this repo..."

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
  "tsx watch",
  "tsx\dist\cli.mjs"
)
$rootEsc = [regex]::Escape($Root)
$sweep = 0
Get-CimInstance Win32_Process -Filter "Name='node.exe'" | ForEach-Object {
  $cmd = $_.CommandLine
  if (-not $cmd) { return }
  if ($cmd -notmatch $rootEsc) { return }
  foreach ($p in $patterns) {
    if ($cmd -like "*$p*") {
      try {
        Stop-Process -Id $_.ProcessId -Force -ErrorAction Stop
        Write-Kill "PID $($_.ProcessId) :: $p"
        $sweep++
      } catch {}
      break
    }
  }
}
Write-Info "swept $sweep process(es)"
$killed += $sweep

# Legacy window title from older start.bat
try {
  $legacy = Get-CimInstance Win32_Process -Filter "Name='cmd.exe'" |
    Where-Object { $_.CommandLine -match "Amazon Monitor - Worker" }
  foreach ($p in $legacy) {
    try {
      Stop-Process -Id $p.ProcessId -Force -ErrorAction Stop
      Write-Kill "legacy worker window PID $($p.ProcessId)"
      $killed++
    } catch {}
  }
} catch {}

Write-Host ""
Write-Host "============================================"
if ($killed -gt 0) {
  Write-Host "[DONE] Stopped $killed process(es)." -ForegroundColor Green
} else {
  Write-Host "[DONE] Nothing to stop - looks like it's already down."
}
Write-Host "============================================"
Write-Host ""

Start-Sleep -Seconds 1

foreach ($port in 4000, 5188) {
  $still = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
  if ($still) { Write-Warn "Port $port still occupied!" }
  else { Write-Ok "Port $port free" }
}

Write-Host ""
exit 0
