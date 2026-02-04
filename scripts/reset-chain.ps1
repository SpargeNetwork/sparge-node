param(
  [switch]$Start
)

Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue

$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $repoRoot
$datadir = Join-Path $repoRoot 'server\data'

if (Test-Path $datadir) {
  Remove-Item -Recurse -Force $datadir
}

if ($Start) {
  Push-Location $repoRoot
  npm start
  Pop-Location
}