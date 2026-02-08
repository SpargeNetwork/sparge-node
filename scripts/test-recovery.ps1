Param(
  [int]$PortA = 3251,
  [int]$PortB = 3252
)

$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$outDir = Join-Path $PSScriptRoot "out"
New-Item -ItemType Directory -Path $outDir -Force | Out-Null
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$logFile = Join-Path $outDir "test-recovery-$stamp.log"
$tmpConfig = Join-Path $outDir "test-recovery-config-$stamp.yml"

$script:started = @()
$script:failed = $false

function Log($line) {
  $msg = "[{0}] {1}" -f (Get-Date).ToString("s"), $line
  Write-Host $msg
  Add-Content -Path $logFile -Value $msg
}

function Start-Node([string]$mode, [string]$dataDir, [int]$port, [string]$configPath, [bool]$admin) {
  New-Item -ItemType Directory -Path $dataDir -Force | Out-Null
  $nodeExe = (Get-Command node).Source
  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = $nodeExe
  $psi.Arguments = "server/index.js"
  $psi.WorkingDirectory = $repoRoot
  $psi.UseShellExecute = $false
  $psi.CreateNoWindow = $true
  $psi.EnvironmentVariables["NODE_MODE"] = $mode
  $psi.EnvironmentVariables["PORT"] = [string]$port
  $psi.EnvironmentVariables["DATA_DIR"] = $dataDir
  $psi.EnvironmentVariables["CONFIG_PATH"] = $configPath
  $psi.EnvironmentVariables["DEV_ENABLE_ADMIN"] = $admin.ToString().ToLower()
  $proc = New-Object System.Diagnostics.Process
  $proc.StartInfo = $psi
  [void]$proc.Start()
  $script:started += $proc
  return $proc
}

function Stop-Node($proc) {
  if ($proc -and -not $proc.HasExited) {
    Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
  }
}

function Wait-Ok([string]$url, [int]$sec = 30) {
  $end = (Get-Date).AddSeconds($sec)
  while ((Get-Date) -lt $end) {
    try {
      Invoke-RestMethod -Uri $url -TimeoutSec 3 | Out-Null
      return $true
    } catch {
      Start-Sleep -Milliseconds 400
    }
  }
  return $false
}

function Status([int]$port) {
  Invoke-RestMethod -Uri ("http://127.0.0.1:{0}/api/status" -f $port) -TimeoutSec 5
}

try {
  Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force

  $cfgRaw = Get-Content (Join-Path $repoRoot "config/config.yml") -Raw
  $cfgRaw = [Regex]::Replace($cfgRaw, 'blockTimeSeconds:\s*\d+', 'blockTimeSeconds: 2')
  Set-Content -Path $tmpConfig -Value $cfgRaw -Encoding UTF8

  $dataA = Join-Path $repoRoot "server\data-recovery-a"
  $dataB = Join-Path $repoRoot "server\data-recovery-b"
  if (Test-Path $dataA) { Remove-Item $dataA -Recurse -Force -ErrorAction SilentlyContinue }
  if (Test-Path $dataB) { Remove-Item $dataB -Recurse -Force -ErrorAction SilentlyContinue }

  Log "Starting producer A"
  $pA = Start-Node "producer" $dataA $PortA $tmpConfig $true
  if (-not (Wait-Ok "http://127.0.0.1:$PortA/api/status" 30)) { throw "Producer A not reachable" }
  Invoke-RestMethod -Uri "http://127.0.0.1:$PortA/api/mining/start" -Method POST -TimeoutSec 5 | Out-Null
  $ready = $false
  for ($i=0; $i -lt 30; $i++) {
    $s = Status $PortA
    if ([int]$s.latestHeight -ge 2) { $ready = $true; break }
    Start-Sleep -Milliseconds 500
  }
  if (-not $ready) { throw "Producer A did not mine >=2 blocks" }
  $sA = Status $PortA
  $hA = [int]$sA.latestHeight
  $gA = [string]$sA.genesisHash
  Log "Producer A at height=$hA genesis=$gA"

  $snapshotOut = Join-Path $repoRoot "scripts\out"
  & powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "snapshot-state.ps1") -DataDir $dataA -OutDir $snapshotOut | Out-Null
  $snapshot = Get-ChildItem (Join-Path $snapshotOut "sparge-snapshot-*.zip") | Sort-Object LastWriteTime -Descending | Select-Object -First 1
  if (-not $snapshot) { throw "No snapshot zip generated" }
  Log "Snapshot created: $($snapshot.FullName)"

  Stop-Node $pA
  Log "Restoring snapshot to recovery data dir"
  & powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "restore-state.ps1") -SnapshotZip $snapshot.FullName -TargetDataDir $dataB -Force | Out-Null

  Log "Starting producer B from restored data"
  $pB = Start-Node "producer" $dataB $PortB $tmpConfig $false
  if (-not (Wait-Ok "http://127.0.0.1:$PortB/api/status" 30)) { throw "Producer B not reachable" }
  $sB = Status $PortB
  Log "Producer B height=$($sB.latestHeight) genesis=$($sB.genesisHash)"

  if ([string]$sB.genesisHash -ne $gA) { throw "Restore validation failed: genesisHash mismatch" }
  if ([int]$sB.latestHeight -lt $hA) { throw "Restore validation failed: height regressed ($($sB.latestHeight) < $hA)" }

  Log "PASS: Recovery smoke test succeeded"
} catch {
  $script:failed = $true
  Log ("FAIL: " + $_.Exception.Message)
} finally {
  foreach ($p in $script:started) { Stop-Node $p }
  if ($script:failed) { exit 1 } else { exit 0 }
}
