param(
  [Parameter(Mandatory = $true, Position = 0)]
  [string]$Version,
  [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

if ($Version.StartsWith("v", [System.StringComparison]::OrdinalIgnoreCase)) {
  $Version = $Version.Substring(1)
}
if ($Version -notmatch '^[0-9]+\.[0-9]+\.[0-9]+(?:[-+][0-9A-Za-z.-]+)?$') {
  throw "Version must look like 1.0.0 (a leading v is also accepted)."
}

$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$DependenciesPath = Join-Path $Root "dependencies.json"
$originalText = [System.IO.File]::ReadAllText($DependenciesPath, [System.Text.Encoding]::UTF8)
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
$config = $originalText | ConvertFrom-Json
$dependency = @($config.dependencies | Where-Object { [string]$_.id -eq "ffmpeg-wasm-builder" })
if ($dependency.Count -ne 1) { throw "dependencies.json must contain exactly one ffmpeg-wasm-builder dependency." }

$oldVersion = [string]$dependency[0].version
if ($oldVersion -eq $Version) {
  Write-Host "[OK] FFmpeg WASM Builder is already pinned to $Version." -ForegroundColor Green
} else {
  $dependency[0].version = $Version
  $json = $config | ConvertTo-Json -Depth 20
  [System.IO.File]::WriteAllText($DependenciesPath, $json + [Environment]::NewLine, $utf8NoBom)
  Write-Host "[OK] FFmpeg WASM Builder version: $oldVersion -> $Version" -ForegroundColor Green
}

if ($SkipBuild) {
  Write-Host "[OK] Version updated without building." -ForegroundColor Green
  exit 0
}

try {
  Write-Host "[Update] Downloading the new Release, verifying SHA-256, and rebuilding..." -ForegroundColor Cyan
  & (Join-Path $Root "build-standalone.ps1") -ForceDownload
  Write-Host "[OK] FFmpeg WASM update completed." -ForegroundColor Green
} catch {
  if ($oldVersion -ne $Version) {
    [System.IO.File]::WriteAllText($DependenciesPath, $originalText, $utf8NoBom)
    Write-Warning "Build failed. dependencies.json was restored to Builder version $oldVersion."
  }
  throw
}
