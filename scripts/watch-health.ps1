Param(
  [string]$BaseUrl = "http://127.0.0.1:3051",
  [int]$IntervalSec = 10,
  [int]$TimeoutSec = 5,
  [int]$MaxLagBlocks = 5,
  [int]$MaxConsecutiveFailures = 3,
  [string]$OutFile = ""
)

$ErrorActionPreference = "Stop"

$script:consecutiveFailures = 0

if ([string]::IsNullOrWhiteSpace($OutFile)) {
  $repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
  $outDir = Join-Path $repoRoot "scripts\out"
  New-Item -ItemType Directory -Path $outDir -Force | Out-Null
  $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
  $OutFile = Join-Path $outDir "health-watch-$stamp.log"
} else {
  $parent = Split-Path -Parent $OutFile
  if ($parent) { New-Item -ItemType Directory -Path $parent -Force | Out-Null }
}

function Write-Log([string]$Level, [string]$Message) {
  $line = "[{0}] [{1}] {2}" -f (Get-Date).ToString("s"), $Level.ToUpper(), $Message
  Write-Host $line
  Add-Content -Path $OutFile -Value $line
}

function Health-Fail([string]$Reason) {
  $script:consecutiveFailures += 1
  Write-Log "warn" ("Health check failed ({0}/{1}): {2}" -f $script:consecutiveFailures, $MaxConsecutiveFailures, $Reason)
  if ($script:consecutiveFailures -ge $MaxConsecutiveFailures) {
    Write-Log "error" ("ALERT: health degraded after {0} consecutive failures. Last reason: {1}" -f $script:consecutiveFailures, $Reason)
  }
}

function Health-Ok([object]$Status) {
  if ($script:consecutiveFailures -gt 0) {
    Write-Log "info" "Health restored after failures."
  }
  $script:consecutiveFailures = 0
  $syncState = [string]$Status.syncState
  $height = [string]$Status.latestHeight
  $lag = [string]$Status.lagBlocks
  Write-Log "info" ("OK mode={0} syncState={1} height={2} lag={3}" -f $Status.nodeMode, $syncState, $height, $lag)
}

Write-Log "info" ("Starting health watch for {0} (interval={1}s timeout={2}s maxLag={3} maxFailures={4})" -f $BaseUrl, $IntervalSec, $TimeoutSec, $MaxLagBlocks, $MaxConsecutiveFailures)

while ($true) {
  try {
    $status = Invoke-RestMethod -Uri "$BaseUrl/api/status" -Method GET -TimeoutSec $TimeoutSec
    if (-not $status) {
      Health-Fail "empty /api/status response"
    } elseif ([string]$status.nodeMode -eq "observer") {
      $syncState = [string]$status.syncState
      $lagBlocks = 0
      try { $lagBlocks = [int]$status.lagBlocks } catch { $lagBlocks = 0 }
      if ($syncState -eq "error") {
        Health-Fail ("observer syncState=error; lastSyncError={0}" -f [string]$status.lastSyncError)
      } elseif ($lagBlocks -gt $MaxLagBlocks) {
        Health-Fail ("observer lagBlocks={0} > threshold={1}" -f $lagBlocks, $MaxLagBlocks)
      } else {
        Health-Ok $status
      }
    } else {
      Health-Ok $status
    }
  } catch {
    Health-Fail $_.Exception.Message
  }

  Start-Sleep -Seconds $IntervalSec
}
