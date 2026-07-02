param(
  [int]$CaptureSeconds = 20
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$adb = Join-Path $repoRoot ".tools\android-platform-tools\platform-tools\adb.exe"
$packageName = "com.logivya.mobile"
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$logDir = Join-Path $repoRoot ".logs\mobile-crash"
$rawLog = Join-Path $logDir "logivya-$timestamp-raw.logcat.txt"
$filteredLog = Join-Path $logDir "logivya-$timestamp-filtered.logcat.txt"
$patterns = "FATAL EXCEPTION|AndroidRuntime|$packageName|SoLoader|Firebase|Sentry|Expo|ReactNative|React Native|Hermes|TaskManager|Notifications|Fatal signal|Exception|Process $packageName|crash|libc"

if (!(Test-Path -LiteralPath $adb)) {
  throw "adb.exe not found at $adb. Download platform-tools first."
}

New-Item -ItemType Directory -Force -Path $logDir | Out-Null

Write-Host "Using ADB: $adb"
& $adb start-server | Out-Host
& $adb devices -l | Out-Host

Write-Host ""
Write-Host "Waiting for an authorized Android device..."
& $adb wait-for-device

$deviceState = (& $adb get-state).Trim()
if ($deviceState -ne "device") {
  throw "ADB state is '$deviceState'. Unlock the phone and approve USB debugging authorization."
}

Write-Host "Checking package: $packageName"
& $adb shell pm path $packageName | Out-Host

Write-Host "Clearing old logcat..."
& $adb logcat -c

Write-Host "Starting raw logcat capture: $rawLog"
$logcat = Start-Process -FilePath $adb -ArgumentList @("logcat", "-v", "time") -RedirectStandardOutput $rawLog -NoNewWindow -PassThru

try {
  Start-Sleep -Seconds 2
  Write-Host "Launching $packageName..."
  & $adb shell monkey -p $packageName -c android.intent.category.LAUNCHER 1 | Out-Host

  Write-Host "Capturing for $CaptureSeconds seconds. Let the app crash/close now."
  Start-Sleep -Seconds $CaptureSeconds
} finally {
  if (!$logcat.HasExited) {
    Stop-Process -Id $logcat.Id -Force
  }
}

Write-Host "Filtering critical crash lines: $filteredLog"
Select-String -Path $rawLog -Pattern $patterns -CaseSensitive:$false | ForEach-Object { $_.Line } | Set-Content -Path $filteredLog -Encoding UTF8

Write-Host ""
Write-Host "Raw logcat:      $rawLog"
Write-Host "Filtered logcat: $filteredLog"
Write-Host ""
Write-Host "Open the filtered file first. If it is empty, inspect the raw log around the launch timestamp."
