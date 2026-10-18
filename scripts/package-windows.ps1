$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$manifest = Get-Content -LiteralPath (Join-Path $projectRoot 'package.json') -Raw | ConvertFrom-Json
$version = [string]$manifest.version
if ($version -notmatch '^\d+\.\d+\.\d+$') { throw 'Unexpected package version.' }

$dist = Join-Path $projectRoot 'dist'
$archivePath = Join-Path $dist "GPTDaddy-$version-windows-node22.zip"
if (Test-Path -LiteralPath $archivePath) { throw "Archive already exists: $archivePath" }

$runtimeFiles = @(
  'LICENSE', 'README.md', 'THIRD_PARTY_NOTICES.md', 'package.json',
  'docs/phase-1-compatibility.md',
  'scripts/install-user-startup.cmd', 'scripts/install-user-startup.ps1',
  'scripts/restart-user-daemon.cmd', 'scripts/restart-user-daemon.ps1',
  'scripts/run-user-daemon.ps1',
  'scripts/activate-packaged-codex.ps1',
  'scripts/ensure-installed-daemon.ps1', 'scripts/install-daemon-watchdog.ps1', 'scripts/start-daemon-hidden.vbs',
  'scripts/validate-live-codex.cmd', 'scripts/validate-live-codex.ps1'
)
$runtimeFiles += Get-ChildItem -LiteralPath (Join-Path $projectRoot 'src') -Recurse -File |
  ForEach-Object { $_.FullName.Substring($projectRoot.Length + 1).Replace('\', '/') }
$runtimeFiles += Get-ChildItem -LiteralPath (Join-Path $projectRoot 'public') -Recurse -File |
  ForEach-Object { $_.FullName.Substring($projectRoot.Length + 1).Replace('\', '/') }
$runtimeFiles = @($runtimeFiles | Sort-Object -Unique)
foreach ($relative in $runtimeFiles) {
  if (-not (Test-Path -LiteralPath (Join-Path $projectRoot $relative) -PathType Leaf)) {
    throw "Missing runtime file: $relative"
  }
}

New-Item -ItemType Directory -Path $dist -Force | Out-Null
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [IO.Compression.ZipFile]::Open($archivePath, [IO.Compression.ZipArchiveMode]::Create)
try {
  foreach ($relative in $runtimeFiles) {
    $fullPath = Join-Path $projectRoot $relative
    [IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
      $archive, $fullPath, $relative.Replace('\', '/'), [IO.Compression.CompressionLevel]::Optimal
    ) | Out-Null
  }
} finally {
  $archive.Dispose()
}

$hash = Get-FileHash -LiteralPath $archivePath -Algorithm SHA256
[pscustomobject]@{
  Archive = $archivePath
  Files = $runtimeFiles.Count
  Bytes = (Get-Item -LiteralPath $archivePath).Length
  SHA256 = $hash.Hash
} | Format-List
