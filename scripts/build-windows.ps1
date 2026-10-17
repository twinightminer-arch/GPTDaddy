$ErrorActionPreference = 'Stop'
$root = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$manifest = Get-Content -LiteralPath (Join-Path $root 'package.json') -Raw | ConvertFrom-Json
$version = [string]$manifest.version
if ($version -notmatch '^\d+\.\d+\.\d+$') { throw 'Invalid package version' }
$out = Join-Path $root "dist\runtime-v$version"
$esbuild = Join-Path $root 'node_modules\.bin\esbuild.cmd'
$node = (Get-Command node.exe -ErrorAction Stop).Source
if (-not (Test-Path -LiteralPath $esbuild)) { throw 'Run npm ci before building' }
New-Item -ItemType Directory -Path $out -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $out 'public') -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $out 'scripts') -Force | Out-Null
$mainOut = Join-Path $out 'main.mjs'
$workerOut = Join-Path $out 'catalog-worker.mjs'
& $esbuild (Join-Path $root 'src\cli.mjs') --bundle --platform=node --format=esm --target=node22 --minify "--outfile=$mainOut"
if ($LASTEXITCODE -ne 0) { throw 'Main bundle failed' }
& $esbuild (Join-Path $root 'src\wallpaper\catalog-worker.mjs') --bundle --platform=node --format=esm --target=node22 --minify "--outfile=$workerOut"
if ($LASTEXITCODE -ne 0) { throw 'Catalog worker bundle failed' }
Copy-Item -LiteralPath $node -Destination (Join-Path $out 'node.exe') -Force
foreach ($file in @('index.html','app.js','styles.css')) {
  Copy-Item -LiteralPath (Join-Path $root "public\$file") -Destination (Join-Path $out "public\$file") -Force
}
foreach ($file in @('activate-packaged-codex.ps1','activate-installed-daemon.ps1','runtime-daemon.ps1','ensure-installed-daemon.ps1','install-daemon-watchdog.ps1')) {
  Copy-Item -LiteralPath (Join-Path $root "scripts\$file") -Destination (Join-Path $out "scripts\$file") -Force
}
foreach ($file in @('LICENSE','THIRD_PARTY_NOTICES.md','README.md')) {
  Copy-Item -LiteralPath (Join-Path $root $file) -Destination (Join-Path $out $file) -Force
}
[pscustomobject]@{ Version = $version; Runtime = $out; Files = (Get-ChildItem -LiteralPath $out -Recurse -File).Count } | Format-List
