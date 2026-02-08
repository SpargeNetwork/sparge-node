Param(
  [int]$ProducerPort = 3151,
  [int]$ObserverPort = 3152,
  [int]$TimeoutSec = 120
)

$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$outDir = Join-Path $PSScriptRoot "out"
New-Item -ItemType Directory -Path $outDir -Force | Out-Null
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$logFile = Join-Path $outDir "test-stability-$stamp.log"
$tmpConfig = Join-Path $outDir "test-stability-config-$stamp.yml"
$tmpMismatchConfig = Join-Path $outDir "test-stability-mismatch-config-$stamp.yml"

$script:passCount = 0
$script:failCount = 0
$script:started = @()

function Write-Log($line) {
  $ts = (Get-Date).ToString("s")
  $msg = "[$ts] $line"
  Write-Host $msg
  Add-Content -Path $logFile -Value $msg
}

function Assert-Check([bool]$condition, [string]$message) {
  if ($condition) {
    $script:passCount += 1
    Write-Log "PASS: $message"
  } else {
    $script:failCount += 1
    Write-Log "FAIL: $message"
  }
}

function Start-NodeProcess {
  Param(
    [string]$Name,
    [string]$Mode,
    [string]$DataDir,
    [int]$Port,
    [string]$ConfigPath,
    [string]$ProducerUrl = "",
    [bool]$EnableAdmin = $false
  )

  New-Item -ItemType Directory -Path $DataDir -Force | Out-Null
  $nodeExe = (Get-Command node).Source
  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = $nodeExe
  $psi.Arguments = "server/index.js"
  $psi.WorkingDirectory = $repoRoot
  $psi.UseShellExecute = $false
  $psi.CreateNoWindow = $true
  $psi.EnvironmentVariables["NODE_MODE"] = $Mode
  $psi.EnvironmentVariables["PORT"] = [string]$Port
  $psi.EnvironmentVariables["DATA_DIR"] = $DataDir
  $psi.EnvironmentVariables["CONFIG_PATH"] = $ConfigPath
  $psi.EnvironmentVariables["DEV_ENABLE_ADMIN"] = $EnableAdmin.ToString().ToLower()
  if ($ProducerUrl) {
    $psi.EnvironmentVariables["PRODUCER_URL"] = $ProducerUrl
  } else {
    $psi.EnvironmentVariables.Remove("PRODUCER_URL")
  }

  $proc = New-Object System.Diagnostics.Process
  $proc.StartInfo = $psi
  [void]$proc.Start()

  $script:started += $proc
  Write-Log "Started $Name pid=$($proc.Id) mode=$Mode port=$Port dataDir=$DataDir"
  return $proc
}

function Stop-NodeProcess {
  Param([System.Diagnostics.Process]$Process, [string]$Name = "node")
  if (-not $Process) { return }
  try {
    if (-not $Process.HasExited) {
      Stop-Process -Id $Process.Id -Force -ErrorAction SilentlyContinue
      Write-Log "Stopped $Name pid=$($Process.Id)"
    }
  } catch {
    Write-Log "WARN: Failed stopping $Name pid=$($Process.Id): $($_.Exception.Message)"
  }
}

function Wait-HttpOk {
  Param([string]$Url, [int]$MaxSec = 60)
  $sw = [System.Diagnostics.Stopwatch]::StartNew()
  while ($sw.Elapsed.TotalSeconds -lt $MaxSec) {
    try {
      Invoke-RestMethod -Uri $Url -Method GET -TimeoutSec 3 | Out-Null
      return $true
    } catch {
      Start-Sleep -Milliseconds 400
    }
  }
  return $false
}

function Get-Status {
  Param([string]$BaseUrl)
  return Invoke-RestMethod -Uri "$BaseUrl/api/status" -Method GET -TimeoutSec 5
}

function Wait-For {
  Param(
    [scriptblock]$Predicate,
    [int]$MaxSec = 60,
    [int]$IntervalMs = 500
  )
  $sw = [System.Diagnostics.Stopwatch]::StartNew()
  while ($sw.Elapsed.TotalSeconds -lt $MaxSec) {
    try {
      if (& $Predicate) { return $true }
    } catch {
      # ignore and retry
    }
    Start-Sleep -Milliseconds $IntervalMs
  }
  return $false
}

function Start-Mining {
  Param([string]$BaseUrl)
  try {
    Invoke-RestMethod -Uri "$BaseUrl/api/mining/start" -Method POST -TimeoutSec 5 | Out-Null
    return $true
  } catch {
    Write-Log "WARN: mining start failed at $BaseUrl : $($_.Exception.Message)"
    return $false
  }
}

try {
  Write-Log "Starting stability baseline smoke test"
  Write-Log "Repo root: $repoRoot"
  Write-Log "Output log: $logFile"

  $cfgRaw = Get-Content (Join-Path $repoRoot "config/config.yml") -Raw
  # Reduce block time for deterministic local smoke speed without protocol code changes.
  $cfgRaw = [Regex]::Replace($cfgRaw, 'blockTimeSeconds:\s*\d+', 'blockTimeSeconds: 2')
  Set-Content -Path $tmpConfig -Value $cfgRaw -Encoding UTF8
  Write-Log "Temp config created: $tmpConfig (blockTimeSeconds=2)"
  $mismatchCfg = [Regex]::Replace($cfgRaw, 'blockTimeSeconds:\s*2', "blockTimeSeconds: 2`n  genesisCreatedAt: `"2030-01-01T00:00:00.000Z`"")
  Set-Content -Path $tmpMismatchConfig -Value $mismatchCfg -Encoding UTF8
  Write-Log "Temp mismatch config created: $tmpMismatchConfig"

  $prodAData = Join-Path $repoRoot "server/data-producer-test-a"
  $obsData = Join-Path $repoRoot "server/data-observer-test"
  $prodMismatchData = Join-Path $repoRoot "server/data-producer-test-mismatch"
  $prodBaseData = Join-Path $repoRoot "server/data-producer-test-base"
  $obsPrevData = Join-Path $repoRoot "server/data-observer-test-prev"

  foreach ($dir in @($prodAData, $obsData, $prodMismatchData, $prodBaseData, $obsPrevData)) {
    if (Test-Path $dir) { Remove-Item $dir -Recurse -Force -ErrorAction SilentlyContinue }
  }

  $producerBaseUrl = "http://127.0.0.1:$ProducerPort"
  $observerBaseUrl = "http://127.0.0.1:$ObserverPort"

  # A) Producer cold start
  $prodA = Start-NodeProcess -Name "producer-a" -Mode "producer" -DataDir $prodAData -Port $ProducerPort -ConfigPath $tmpConfig -EnableAdmin $true
  Assert-Check (Wait-HttpOk "$producerBaseUrl/api/status" 30) "Producer cold start /api/status reachable"
  $statusA = Get-Status $producerBaseUrl
  Assert-Check ($statusA.nodeMode -eq "producer") "Producer nodeMode=producer"
  Assert-Check (-not [string]::IsNullOrWhiteSpace([string]$statusA.genesisHash)) "Producer genesisHash present"
  Assert-Check ([int]$statusA.latestHeight -ge 0) "Producer height >= 0 after cold start"
  Assert-Check (Start-Mining $producerBaseUrl) "Producer mining start works locally for smoke"
  Assert-Check (Wait-For { ([int](Get-Status $producerBaseUrl).latestHeight) -ge 1 } 30) "Producer mines at least one block"

  # B) Producer restart continuity
  $before = Get-Status $producerBaseUrl
  $h1 = [int]$before.latestHeight
  $g1 = [string]$before.genesisHash
  $c1 = [string]$before.chainId
  $p1 = [string]$before.protocolVersion
  $e1 = [string]$before.economicsVersion
  Stop-NodeProcess $prodA "producer-a"

  $prodA = Start-NodeProcess -Name "producer-a-restart" -Mode "producer" -DataDir $prodAData -Port $ProducerPort -ConfigPath $tmpConfig -EnableAdmin $true
  Assert-Check (Wait-HttpOk "$producerBaseUrl/api/status" 30) "Producer restart /api/status reachable"
  $after = Get-Status $producerBaseUrl
  Assert-Check ([string]$after.genesisHash -eq $g1) "Producer restart keeps genesisHash stable"
  Assert-Check ([int]$after.latestHeight -ge $h1) "Producer restart keeps monotonic height (no reset)"
  Assert-Check ([string]$after.chainId -eq $c1) "Producer restart keeps chainId stable"
  Assert-Check ([string]$after.protocolVersion -eq $p1) "Producer restart keeps protocolVersion stable"
  Assert-Check ([string]$after.economicsVersion -eq $e1) "Producer restart keeps economicsVersion stable"
  Start-Mining $producerBaseUrl | Out-Null
  Assert-Check (Wait-For { ([int](Get-Status $producerBaseUrl).latestHeight) -ge ($h1 + 1) } 30) "Producer continues block production after restart"

  # C) Observer fresh sync from 0 to tip
  $obs = Start-NodeProcess -Name "observer-main" -Mode "observer" -DataDir $obsData -Port $ObserverPort -ConfigPath $tmpConfig -ProducerUrl $producerBaseUrl
  Assert-Check (Wait-HttpOk "$observerBaseUrl/api/status" 30) "Observer /api/status reachable"
  $synced = Wait-For {
    $s = Get-Status $observerBaseUrl
    ($s.syncState -eq "synced") -and ([int]$s.lagBlocks -le 1)
  } 60
  Assert-Check $synced "Observer fresh sync reaches synced with lag <= 1"
  $obsStatus = Get-Status $observerBaseUrl
  $prodStatus = Get-Status $producerBaseUrl
  Assert-Check ([string]$obsStatus.genesisHash -eq [string]$prodStatus.genesisHash) "Observer genesisHash matches producer"
  Assert-Check ([Math]::Abs(([int]$obsStatus.syncedHeight - [int]$prodStatus.latestHeight)) -le 1) "Observer synced height matches producer tip (<=1)"

  # D) Observer catch-up after producer downtime
  Stop-NodeProcess $prodA "producer-a-downtime"
  Start-Sleep -Seconds 8
  $downStatus = Get-Status $observerBaseUrl
  $downgraded = @("error", "syncing", "synced") -contains [string]$downStatus.syncState
  Assert-Check $downgraded "Observer remains responsive during producer downtime"
  $prodA = Start-NodeProcess -Name "producer-a-after-downtime" -Mode "producer" -DataDir $prodAData -Port $ProducerPort -ConfigPath $tmpConfig -EnableAdmin $true
  Assert-Check (Wait-HttpOk "$producerBaseUrl/api/status" 30) "Producer returns after downtime"
  Start-Mining $producerBaseUrl | Out-Null
  Assert-Check (Wait-For {
    $s = Get-Status $observerBaseUrl
    ($s.syncState -eq "synced") -and ([int]$s.lagBlocks -le 1)
  } 90) "Observer catches up again after producer returns"

  # E1) Explicit genesisHash mismatch
  $mismatchPort = $ProducerPort + 10
  $mismatchUrl = "http://127.0.0.1:$mismatchPort"
  if (Test-Path $prodMismatchData) { Remove-Item $prodMismatchData -Recurse -Force -ErrorAction SilentlyContinue }
  $prodMismatch = Start-NodeProcess -Name "producer-mismatch" -Mode "producer" -DataDir $prodMismatchData -Port $mismatchPort -ConfigPath $tmpMismatchConfig -EnableAdmin $true
  Assert-Check (Wait-HttpOk "$mismatchUrl/api/status" 30) "Mismatch producer started"
  $mismatchStatus = Get-Status $mismatchUrl
  Assert-Check ([string]$mismatchStatus.genesisHash -ne $g1) "Mismatch producer has different genesisHash"
  Stop-NodeProcess $obs "observer-main-for-mismatch"
  $obs = Start-NodeProcess -Name "observer-mismatch-check" -Mode "observer" -DataDir $obsData -Port $ObserverPort -ConfigPath $tmpConfig -ProducerUrl $mismatchUrl
  Assert-Check (Wait-HttpOk "$observerBaseUrl/api/status" 30) "Observer restarted for genesis mismatch check"
  $mismatchObserved = Wait-For { (Get-Status $observerBaseUrl).syncState -eq "error" } 40
  $mismatchObserverStatus = Get-Status $observerBaseUrl
  Assert-Check $mismatchObserved "Observer refuses mismatched producer (genesis/chain/protocol/economics)"
  if (-not $mismatchObserved) {
    Write-Log "INFO: mismatch observer status syncState=$($mismatchObserverStatus.syncState) lastSyncError=$($mismatchObserverStatus.lastSyncError)"
  }
  Stop-NodeProcess $prodMismatch "producer-mismatch"

  # E2) Explicit prevHash mismatch (controlled local divergence check)
  $basePort = $ProducerPort + 20
  $baseUrl = "http://127.0.0.1:$basePort"
  $prevObsPort = $ObserverPort + 30
  $prevObsUrl = "http://127.0.0.1:$prevObsPort"

  Stop-NodeProcess $obs "observer-before-prevhash"
  foreach ($dir in @($prodBaseData, $obsPrevData)) {
    if (Test-Path $dir) { Remove-Item $dir -Recurse -Force -ErrorAction SilentlyContinue }
  }

  $prodBase = Start-NodeProcess -Name "producer-base" -Mode "producer" -DataDir $prodBaseData -Port $basePort -ConfigPath $tmpConfig -EnableAdmin $true
  Assert-Check (Wait-HttpOk "$baseUrl/api/status" 30) "Base producer for prevHash test started"
  Assert-Check (Start-Mining $baseUrl) "Base producer mining start"
  Assert-Check (Wait-For { ([int](Get-Status $baseUrl).latestHeight) -ge 1 } 30) "Base producer mined block #1"

  $obsPrev = Start-NodeProcess -Name "observer-prev-base" -Mode "observer" -DataDir $obsPrevData -Port $prevObsPort -ConfigPath $tmpConfig -ProducerUrl $baseUrl
  Assert-Check (Wait-HttpOk "$prevObsUrl/api/status" 30) "Observer for prevHash test started"
  Assert-Check (Wait-For {
    $s = Get-Status $prevObsUrl
    ($s.syncState -eq "synced") -and ([int]$s.syncedHeight -ge 1)
  } 45) "Observer synced to base chain at height >= 1"

  Stop-NodeProcess $obsPrev "observer-prev-base-stop"
  $observerDbPath = Join-Path $obsPrevData "state.db"
  $tamperScriptPath = Join-Path $outDir "tamper-latest-hash-$stamp.js"
  @'
const Database = require("better-sqlite3");
const dbPath = process.argv[2];
const db = new Database(dbPath);
const tampered = "f".repeat(64);
db.prepare("INSERT INTO meta(key, value) VALUES('latestHash', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(tampered);
const row = db.prepare("SELECT value FROM meta WHERE key = 'latestHash'").get();
db.close();
if (!row || row.value !== tampered) {
  process.exit(2);
}
'@ | Set-Content -Path $tamperScriptPath -Encoding UTF8
  & node $tamperScriptPath $observerDbPath
  Assert-Check ($LASTEXITCODE -eq 0) "Tampered observer local tip hash for divergence simulation"

  $obsPrev = Start-NodeProcess -Name "observer-prev-div-check" -Mode "observer" -DataDir $obsPrevData -Port $prevObsPort -ConfigPath $tmpConfig -ProducerUrl $baseUrl
  Assert-Check (Wait-HttpOk "$prevObsUrl/api/status" 30) "Observer restarted against base producer with tampered tip"
  Assert-Check (Wait-For {
    $s = Get-Status $prevObsUrl
    ($s.syncState -eq "error") -and ([string]$s.lastSyncError -match "prevHash mismatch")
  } 45) "Observer detects divergence via prevHash mismatch"
  Stop-NodeProcess $prodBase "producer-base-stop"

} catch {
  $script:failCount += 1
  Write-Log "FAIL: Unhandled exception: $($_.Exception.Message)"
} finally {
  foreach ($p in $script:started) {
    Stop-NodeProcess $p "cleanup"
  }
  Write-Log "TOTAL: $($script:passCount) passed, $($script:failCount) failed"
  if ($script:failCount -gt 0) {
    Write-Log "RESULT: FAIL"
    exit 1
  }
  Write-Log "RESULT: PASS"
  exit 0
}
