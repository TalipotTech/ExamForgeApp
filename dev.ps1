<#
.SYNOPSIS
  ExamForge development environment launcher.

.DESCRIPTION
  Manages Redis (Docker), pnpm dev, and BullMQ worker processes.

.PARAMETER Action
  start    - Start all services (default)
  stop     - Stop all services
  restart  - Stop then start all services
  status   - Show status of each service

.PARAMETER Service
  all      - All services (default)
  redis    - Only Redis container
  dev      - Only pnpm dev (web + api)
  worker   - Only BullMQ worker

.EXAMPLE
  .\dev.ps1                     # Start everything
  .\dev.ps1 stop                # Stop everything
  .\dev.ps1 restart             # Restart everything
  .\dev.ps1 status              # Check what's running
  .\dev.ps1 start redis         # Start only Redis
  .\dev.ps1 stop worker         # Stop only the worker
  .\dev.ps1 restart dev         # Restart only pnpm dev
#>

param(
  [ValidateSet("start", "stop", "restart", "status")]
  [string]$Action = "start",

  [ValidateSet("all", "redis", "dev", "worker")]
  [string]$Service = "all"
)

$ErrorActionPreference = "Continue"
$REDIS_CONTAINER = "examforge-redis"
$REDIS_PORT = 6379
$API_PORT = 4100
$WEB_PORT = 3100

function Write-Status($icon, $msg) {
  Write-Host "  $icon " -NoNewline
  Write-Host $msg
}

function Get-PortPid($port) {
  $line = netstat -ano | Select-String "TCP\s+.*:$port\s+.*LISTENING\s+(\d+)"
  if ($line) { return ($line.Matches[0].Groups[1].Value) }
  return $null
}

# ── Redis ──

function Start-Redis {
  Write-Host "`n[Redis]" -ForegroundColor Cyan
  $existing = docker ps -a --filter "name=^${REDIS_CONTAINER}$" --format "{{.Status}}" 2>$null
  if ($existing -match "^Up") {
    Write-Status "✓" "Already running"
    return
  }
  if ($existing) {
    docker start $REDIS_CONTAINER | Out-Null
    Write-Status "→" "Started existing container"
  } else {
    docker run -d --name $REDIS_CONTAINER -p "${REDIS_PORT}:6379" redis:7-alpine | Out-Null
    Write-Status "→" "Created and started new container"
  }
  Start-Sleep -Seconds 1
  $pong = docker exec $REDIS_CONTAINER redis-cli ping 2>$null
  if ($pong -eq "PONG") {
    Write-Status "✓" "Redis responding on port $REDIS_PORT"
  } else {
    Write-Status "✗" "Redis not responding" 
  }
}

function Stop-Redis {
  Write-Host "`n[Redis]" -ForegroundColor Cyan
  $existing = docker ps -a --filter "name=^${REDIS_CONTAINER}$" --format "{{.Status}}" 2>$null
  if ($existing -match "^Up") {
    docker stop $REDIS_CONTAINER | Out-Null
    Write-Status "→" "Stopped"
  } else {
    Write-Status "·" "Not running"
  }
}

function Status-Redis {
  Write-Host "`n[Redis]" -ForegroundColor Cyan
  $existing = docker ps -a --filter "name=^${REDIS_CONTAINER}$" --format "{{.Status}}" 2>$null
  if ($existing -match "^Up") {
    Write-Status "✓" "Running ($existing)"
  } elseif ($existing) {
    Write-Status "·" "Stopped ($existing)"
  } else {
    Write-Status "✗" "No container found"
  }
}

# ── pnpm dev ──

function Start-Dev {
  Write-Host "`n[Dev Server]" -ForegroundColor Cyan
  $apiPid = Get-PortPid $API_PORT
  if ($apiPid) {
    Write-Status "✓" "Already running (PID $apiPid on port $API_PORT)"
    return
  }
  Write-Status "!" "Run this in a separate Cursor terminal:"
  Write-Host ""
  Write-Host "    pnpm dev" -ForegroundColor Yellow
  Write-Host ""
  Write-Status "·" "Web: http://localhost:$WEB_PORT  API: http://localhost:$API_PORT"
}

function Stop-Dev {
  Write-Host "`n[Dev Server]" -ForegroundColor Cyan
  $apiPid = Get-PortPid $API_PORT
  if ($apiPid) {
    taskkill /PID $apiPid /T /F 2>$null | Out-Null
    Write-Status "→" "Killed process tree (PID $apiPid)"
  }
  $pnpmProcs = Get-Process -Name "node" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -match "turbo.*dev|next.*dev" }
  foreach ($p in $pnpmProcs) {
    Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
  }
  if (-not $apiPid -and -not $pnpmProcs) {
    Write-Status "·" "Not running"
  } else {
    Write-Status "✓" "Stopped"
  }
}

function Status-Dev {
  Write-Host "`n[Dev Server]" -ForegroundColor Cyan
  $apiPid = Get-PortPid $API_PORT
  if ($apiPid) {
    Write-Status "✓" "Running (PID $apiPid on port $API_PORT)"
  } else {
    Write-Status "·" "Not running"
  }
  $webPid = Get-PortPid $WEB_PORT
  if ($webPid) {
    Write-Status "✓" "Web server running (PID $webPid on port $WEB_PORT)"
  } else {
    Write-Status "·" "Web server not running"
  }
}

# ── Worker ──

function Get-WorkerProcess {
  return Get-Process -Name "node" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -match "workers[/\\]index" }
}

function Start-Worker {
  Write-Host "`n[Worker]" -ForegroundColor Cyan
  $existing = Get-WorkerProcess
  if ($existing) {
    Write-Status "✓" "Already running (PID $($existing[0].Id))"
    return
  }
  Write-Status "!" "Run this in a separate Cursor terminal:"
  Write-Host ""
  Write-Host "    pnpm --filter @examforge/api worker:dev" -ForegroundColor Yellow
  Write-Host ""
}

function Stop-Worker {
  Write-Host "`n[Worker]" -ForegroundColor Cyan
  $procs = Get-WorkerProcess
  if ($procs) {
    foreach ($p in $procs) {
      taskkill /PID $p.Id /T /F 2>$null | Out-Null
    }
    Write-Status "→" "Stopped"
  } else {
    Write-Status "·" "Not running"
  }
}

function Status-Worker {
  Write-Host "`n[Worker]" -ForegroundColor Cyan
  $procs = Get-WorkerProcess
  if ($procs) {
    Write-Status "✓" "Running (PID $($procs[0].Id))"
  } else {
    Write-Status "·" "Not running"
  }
}

# ── Dispatch ──

Write-Host "`n ExamForge Dev Environment " -ForegroundColor White -BackgroundColor DarkBlue
Write-Host " Action: $Action | Service: $Service" -ForegroundColor DarkGray

switch ($Action) {
  "start" {
    if ($Service -in "all", "redis")  { Start-Redis }
    if ($Service -in "all", "dev")    { Start-Dev }
    if ($Service -in "all", "worker") { Start-Worker }
  }
  "stop" {
    if ($Service -in "all", "worker") { Stop-Worker }
    if ($Service -in "all", "dev")    { Stop-Dev }
    if ($Service -in "all", "redis")  { Stop-Redis }
  }
  "restart" {
    if ($Service -in "all", "worker") { Stop-Worker }
    if ($Service -in "all", "dev")    { Stop-Dev }
    if ($Service -in "all", "redis")  { Stop-Redis }
    Start-Sleep -Seconds 2
    if ($Service -in "all", "redis")  { Start-Redis }
    if ($Service -in "all", "dev")    { Start-Dev }
    if ($Service -in "all", "worker") { Start-Worker }
  }
  "status" {
    if ($Service -in "all", "redis")  { Status-Redis }
    if ($Service -in "all", "dev")    { Status-Dev }
    if ($Service -in "all", "worker") { Status-Worker }
  }
}

Write-Host ""
