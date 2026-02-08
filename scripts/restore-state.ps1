Param(
  [Parameter(Mandatory = $true)][string]$SnapshotZip,
  [string]$TargetDataDir = "",
  [switch]$Force
)

$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
if (-not $TargetDataDir) {
  $TargetDataDir = Join-Path $repoRoot "server\data"
}

if (-not (Test-Path $SnapshotZip)) {
  throw "Snapshot file not found: $SnapshotZip"
}

if (Test-Path $TargetDataDir) {
  if (-not $Force) {
    throw "Target data dir exists: $TargetDataDir. Use -Force to overwrite."
  }
  Remove-Item $TargetDataDir -Recurse -Force
}
New-Item -ItemType Directory -Path $TargetDataDir -Force | Out-Null

$tmpExtract = Join-Path ([System.IO.Path]::GetTempPath()) ("sparge-restore-" + [Guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $tmpExtract -Force | Out-Null
try {
  Expand-Archive -Path $SnapshotZip -DestinationPath $tmpExtract -Force
  Copy-Item (Join-Path $tmpExtract "*") $TargetDataDir -Recurse -Force
} finally {
  if (Test-Path $tmpExtract) { Remove-Item $tmpExtract -Recurse -Force -ErrorAction SilentlyContinue }
}

$stateDb = Join-Path $TargetDataDir "state.db"
$genesis = Join-Path $TargetDataDir "genesis.json"
if (-not (Test-Path $stateDb)) { throw "Restore incomplete: missing state.db in $TargetDataDir" }
if (-not (Test-Path $genesis)) { throw "Restore incomplete: missing genesis.json in $TargetDataDir" }

Write-Host "Restore completed to: $TargetDataDir"
