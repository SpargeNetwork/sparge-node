Param(
  [string]$DataDir = "",
  [string]$OutDir = "",
  [switch]$IncludeLogs
)

$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
if (-not $DataDir) {
  $DataDir = Join-Path $repoRoot "server\data"
}
if (-not $OutDir) {
  $OutDir = Join-Path $repoRoot "snapshots"
}

if (-not (Test-Path $DataDir)) {
  throw "Data directory not found: $DataDir"
}

$stateDb = Join-Path $DataDir "state.db"
$genesis = Join-Path $DataDir "genesis.json"
if (-not (Test-Path $stateDb)) {
  throw "Missing SQLite file: $stateDb"
}
if (-not (Test-Path $genesis)) {
  throw "Missing genesis file: $genesis"
}

New-Item -ItemType Directory -Path $OutDir -Force | Out-Null
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$stageDir = Join-Path $OutDir "snapshot-$stamp"
New-Item -ItemType Directory -Path $stageDir -Force | Out-Null

Copy-Item $stateDb (Join-Path $stageDir "state.db") -Force
Copy-Item $genesis (Join-Path $stageDir "genesis.json") -Force

$wal = Join-Path $DataDir "state.db-wal"
$shm = Join-Path $DataDir "state.db-shm"
if (Test-Path $wal) { Copy-Item $wal (Join-Path $stageDir "state.db-wal") -Force }
if (Test-Path $shm) { Copy-Item $shm (Join-Path $stageDir "state.db-shm") -Force }

if ($IncludeLogs) {
  $logs = Join-Path $DataDir "logs"
  if (Test-Path $logs) {
    Copy-Item $logs (Join-Path $stageDir "logs") -Recurse -Force
  }
}

$manifest = [ordered]@{
  createdAt = (Get-Date).ToString("o")
  sourceDataDir = $DataDir
  files = @((Get-ChildItem $stageDir -Recurse | Where-Object { -not $_.PSIsContainer } | ForEach-Object { $_.Name }))
}
$manifestPath = Join-Path $stageDir "manifest.json"
$manifest | ConvertTo-Json -Depth 5 | Set-Content -Path $manifestPath -Encoding UTF8

$zipPath = Join-Path $OutDir "sparge-snapshot-$stamp.zip"
if (Test-Path $zipPath) { Remove-Item $zipPath -Force }
Compress-Archive -Path (Join-Path $stageDir "*") -DestinationPath $zipPath -CompressionLevel Optimal
Remove-Item $stageDir -Recurse -Force

Write-Host "Snapshot created: $zipPath"
