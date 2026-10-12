param([switch]$Delete)

$ErrorActionPreference = 'Stop'
$profileRoot = [Environment]::GetFolderPath('UserProfile')
if ([string]::IsNullOrWhiteSpace($profileRoot) -or -not (Test-Path -LiteralPath $profileRoot)) {
  throw 'The current Windows user profile could not be resolved.'
}
$pluginName = 'dsh-plugin-wallpaper-engine-codex'
$source = Join-Path $profileRoot "plugins\$pluginName"
$runtime = Join-Path $profileRoot 'AppData\Local\CodexWallpaperEngineSkin'
$launcher = Join-Path $runtime 'launch-codex-with-skin.ps1'
$marketplace = Join-Path $profileRoot '.agents\plugins\marketplace.json'
$cache = Join-Path $profileRoot ".codex\plugins\cache\personal\$pluginName"
$shortcuts = @(
  (Join-Path $profileRoot 'AppData\Roaming\Microsoft\Windows\Start Menu\Programs\Codex Wallpaper Skin.lnk'),
  (Join-Path $profileRoot 'Desktop\Codex Wallpaper Skin.lnk')
)

function Assert-ExactDirectory([string]$path, [string]$expected) {
  $item = Get-Item -LiteralPath $path -Force -ErrorAction SilentlyContinue
  if (-not $item) { return $false }
  if (-not $item.PSIsContainer -or $item.FullName -ine $expected) { throw "Unexpected directory target: $path" }
  if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw "Directory is a reparse point: $path" }
  $links = @(Get-ChildItem -LiteralPath $path -Force -Recurse -Attributes ReparsePoint)
  if ($links.Count) { throw "Directory contains a reparse point: $path" }
  return $true
}

$sourceExists = Assert-ExactDirectory $source $source
$runtimeExists = Assert-ExactDirectory $runtime $runtime
$cacheExists = Assert-ExactDirectory $cache $cache
if ($runtimeExists) {
  $unexpected = @(Get-ChildItem -LiteralPath $runtime -Force | Where-Object { $_.FullName -ine $launcher })
  if ($unexpected.Count) { throw "Unexpected files in legacy runtime directory: $runtime" }
}

$shortcutItems = @()
$shell = New-Object -ComObject WScript.Shell
foreach ($path in $shortcuts) {
  $item = Get-Item -LiteralPath $path -Force -ErrorAction SilentlyContinue
  if (-not $item) { continue }
  if ($item.PSIsContainer -or $item.FullName -ine $path) { throw "Unexpected shortcut target: $path" }
  $link = $shell.CreateShortcut($path)
  if (-not $link.TargetPath.EndsWith('powershell.exe', [StringComparison]::OrdinalIgnoreCase) -or
      -not $link.Arguments.Contains($launcher)) {
    throw "Shortcut does not point to the verified legacy launcher: $path"
  }
  $shortcutItems += $item
}

$marketplaceEntryCount = 0
if (Test-Path -LiteralPath $marketplace) {
  $catalog = Get-Content -LiteralPath $marketplace -Raw | ConvertFrom-Json
  if ($catalog.name -ne 'personal') { throw 'The personal marketplace file has an unexpected name.' }
  $entries = @($catalog.plugins | Where-Object { $_.name -eq $pluginName })
  $marketplaceEntryCount = $entries.Count
  if ($marketplaceEntryCount -gt 1) { throw 'Duplicate legacy plugin marketplace entries need manual inspection.' }
  if ($marketplaceEntryCount -eq 1 -and $entries[0].source.path -ne "./plugins/$pluginName") {
    throw 'Legacy marketplace entry points to an unexpected source path.'
  }
}

[pscustomobject]@{
  Action = if ($Delete) { 'Delete exact legacy plugin targets' } else { 'Validation only; no changes' }
  Source = $sourceExists
  Runtime = $runtimeExists
  Cache = $cacheExists
  Shortcuts = $shortcutItems.Count
  MarketplaceEntries = $marketplaceEntryCount
} | Format-List
if (-not $Delete) { exit 0 }

if ($marketplaceEntryCount -eq 1) {
  $catalog.plugins = @($catalog.plugins | Where-Object { $_.name -ne $pluginName })
  $operationId = [guid]::NewGuid().ToString('N')
  $temporary = "$marketplace.$operationId.partial"
  $backup = "$marketplace.$operationId.backup"
  $json = $catalog | ConvertTo-Json -Depth 40
  [IO.File]::WriteAllText($temporary, "$json`n", [Text.UTF8Encoding]::new($false))
  try { [IO.File]::Replace($temporary, $marketplace, $backup) }
  finally { if (Test-Path -LiteralPath $temporary) { Remove-Item -LiteralPath $temporary -Force } }
  if (Test-Path -LiteralPath $backup) { Remove-Item -LiteralPath $backup -Force }
  Write-Host 'Removed only the legacy plugin entry from the personal marketplace.'
}

foreach ($item in $shortcutItems) {
  Remove-Item -LiteralPath $item.FullName -Force
  Write-Host "Removed shortcut: $($item.FullName)"
}
if ($runtimeExists) {
  Remove-Item -LiteralPath $runtime -Recurse -Force
  Write-Host "Removed legacy runtime: $runtime"
}
if ($cacheExists) {
  Remove-Item -LiteralPath $cache -Recurse -Force
  Write-Host "Removed legacy plugin cache: $cache"
}
if ($sourceExists) {
  Remove-Item -LiteralPath $source -Recurse -Force
  Write-Host "Removed legacy plugin source: $source"
}

if ((Test-Path -LiteralPath $source) -or (Test-Path -LiteralPath $runtime) -or
    (Test-Path -LiteralPath $cache) -or @($shortcuts | Where-Object { Test-Path -LiteralPath $_ }).Count) {
  throw 'At least one legacy plugin target remains; inspect the output above.'
}
Write-Host 'Legacy plugin removal verified. Close and reopen Codex to refresh plugin discovery.'
