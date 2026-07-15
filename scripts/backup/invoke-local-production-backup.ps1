param(
  [ValidateSet("CreateAndVerify", "VerifyLatest")]
  [string]$Mode = "CreateAndVerify"
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Security
$repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$secretDirectory = Join-Path $env:LOCALAPPDATA "Logivya\BackupSecrets"
$protectedKeyPath = Join-Path $secretDirectory "production-backup-key-v1.dpapi"
$backupDirectory = Join-Path $repositoryRoot "artifacts\backups\production"

New-Item -ItemType Directory -Path $secretDirectory -Force | Out-Null
New-Item -ItemType Directory -Path $backupDirectory -Force | Out-Null

if (-not (Test-Path -LiteralPath $protectedKeyPath)) {
  $key = [byte[]]::new(32)
  $random = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try {
    $random.GetBytes($key)
  } finally {
    $random.Dispose()
  }
  $protected = [System.Security.Cryptography.ProtectedData]::Protect(
    $key,
    $null,
    [System.Security.Cryptography.DataProtectionScope]::CurrentUser
  )
  [System.IO.File]::WriteAllBytes($protectedKeyPath, $protected)
}

$protectedKey = [System.IO.File]::ReadAllBytes($protectedKeyPath)
$backupKey = [System.Security.Cryptography.ProtectedData]::Unprotect(
  $protectedKey,
  $null,
  [System.Security.Cryptography.DataProtectionScope]::CurrentUser
)

try {
  $env:BACKUP_ENCRYPTION_KEY = [Convert]::ToBase64String($backupKey).TrimEnd("=").Replace("+", "-").Replace("/", "_")
  $env:BACKUP_ENCRYPTION_KEY_ID = "windows-dpapi-v1"
  $env:BACKUP_ENVIRONMENT = "production"
  $env:BACKUP_OUTPUT_DIR = $backupDirectory
  $env:BACKUP_ALLOW_LOCAL_PRODUCTION_OUTPUT = "1"
  $env:BACKUP_POSTGRES_TOOLS = "docker"
  $env:DOTENV_CONFIG_PATH = Join-Path $repositoryRoot ".env.local"

  Push-Location $repositoryRoot
  try {
    if ($Mode -eq "CreateAndVerify") {
      & node -r dotenv/config scripts/backup/create-database-backup.mjs --environment production --output $backupDirectory
      if ($LASTEXITCODE -ne 0) { throw "Production backup creation failed." }
    }

    $manifest = Get-ChildItem -LiteralPath $backupDirectory -Filter "production-postgres-*.manifest.json" -File |
      Sort-Object LastWriteTimeUtc -Descending |
      Select-Object -First 1
    if (-not $manifest) { throw "No production backup manifest was found." }

    & node -r dotenv/config scripts/backup/verify-database-backup.mjs --manifest $manifest.FullName
    if ($LASTEXITCODE -ne 0) { throw "Production backup verification failed." }

    Write-Output "Protected recovery key: $protectedKeyPath"
    Write-Output "Verified manifest: $($manifest.FullName)"
  } finally {
    Pop-Location
  }
} finally {
  $env:BACKUP_ENCRYPTION_KEY = $null
  [Array]::Clear($backupKey, 0, $backupKey.Length)
}
