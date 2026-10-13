$ErrorActionPreference = 'Stop'
$root = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$version = [string]((Get-Content -LiteralPath (Join-Path $root 'package.json') -Raw | ConvertFrom-Json).version)
$runtime = Join-Path $root "dist\runtime-v$version"
$archive = Join-Path $root "dist\GPTDaddy-$version-Portable.zip"
if (-not (Test-Path -LiteralPath (Join-Path $runtime 'node.exe'))) { throw 'Build the bundled runtime first' }
if (Test-Path -LiteralPath $archive) { throw "Archive already exists: $archive" }
$entries = @(Get-ChildItem -LiteralPath $runtime -Recurse -File)
if ($entries | Where-Object { $_.Name -in @('state.json','catalog-cache.json','index.json') -or $_.FullName -match '\\node_modules\\' }) {
  throw 'Private state or development dependencies would enter the portable archive'
}
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [IO.Compression.ZipFile]::Open($archive, [IO.Compression.ZipArchiveMode]::Create)
try {
  foreach ($entry in $entries) {
    $relative = $entry.FullName.Substring($runtime.Length + 1).Replace('\','/')
    [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $entry.FullName, $relative, [IO.Compression.CompressionLevel]::Optimal) | Out-Null
  }
} finally { $zip.Dispose() }
Get-FileHash -LiteralPath $archive -Algorithm SHA256 | Select-Object Path,Hash | Format-List
