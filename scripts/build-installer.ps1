$ErrorActionPreference = 'Stop'
$root = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$manifest = Get-Content -LiteralPath (Join-Path $root 'package.json') -Raw | ConvertFrom-Json
$version = [string]$manifest.version
if ($version -notmatch '^\d+\.\d+\.\d+$') { throw 'Invalid package version' }
$runtime = Join-Path $root "dist\runtime-v$version"
if (-not (Test-Path -LiteralPath (Join-Path $runtime 'main.mjs'))) { throw 'Build the runtime first' }
$iscc = 'C:\Users\李忠浩\AppData\Local\Programs\Inno Setup 6\ISCC.exe'
if (-not (Test-Path -LiteralPath $iscc)) { throw 'Inno Setup 6 compiler was not found' }
$script = Join-Path $root 'installer\GPTDaddy.iss'
& $iscc "/DAppVersion=$version" $script
if ($LASTEXITCODE -ne 0) { throw 'Inno Setup build failed' }
$result = Join-Path $root "dist\GPTDaddy-$version-Setup.exe"
if (-not (Test-Path -LiteralPath $result)) { throw 'Installer output was not created' }
Get-FileHash -LiteralPath $result -Algorithm SHA256 | Select-Object Path,Hash | Format-List
