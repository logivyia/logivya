$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectRoot

foreach ($file in @(".env.production.local", ".env.local")) {
  $path = Join-Path $projectRoot $file
  if (-not (Test-Path -LiteralPath $path)) { continue }
  foreach ($line in Get-Content -LiteralPath $path) {
    if ($line -match "^([^#=]+)=(.*)$") {
      [Environment]::SetEnvironmentVariable($matches[1], $matches[2].Trim('"'), "Process")
    }
  }
}

$env:WHATSAPP_SESSION_DIR = Join-Path $projectRoot "sessions"
$env:WORKER_ID = "$env:COMPUTERNAME-local-primary"
$env:WORKER_HEALTH_PORT = "3001"

$logPath = Join-Path $projectRoot "logs\worker-service.log"
& npm.cmd run worker *>> $logPath
