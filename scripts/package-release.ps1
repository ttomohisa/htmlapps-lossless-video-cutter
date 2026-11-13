param(
  [Parameter(Mandatory = $true)]
  [string]$Version
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$ReleaseRoot = Join-Path $Root 'release'
$StagingRoot = Join-Path $Root '.cache/release-staging'

if ($Version -notmatch '^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$') {
  throw "Only stable three-part SemVer releases are supported: $Version"
}

$config = Get-Content -Raw -Encoding UTF8 -LiteralPath (Join-Path $Root 'app.config.json') | ConvertFrom-Json
if ([string]$config.version -cne $Version) {
  throw "Requested version $Version does not match app.config.json version $($config.version)"
}

$manifestPath = Join-Path $Root 'dist/dependency-manifest.json'
if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) {
  throw 'The standalone app must be built and verified before packaging a Release.'
}
$manifest = Get-Content -Raw -Encoding UTF8 -LiteralPath $manifestPath | ConvertFrom-Json
if ([string]$manifest.app.version -cne $Version) {
  throw "Generated manifest version $($manifest.app.version) does not match $Version"
}
$ffmpeg = @($manifest.dependencies | Where-Object { $_.id -eq 'ffmpeg-wasm-builder' })
if ($ffmpeg.Count -ne 1) {
  throw 'Exactly one verified FFmpeg dependency is required.'
}
$sourceUri = $null
$validSourceUri = [Uri]::TryCreate([string]$ffmpeg[0].correspondingSourceUrl,
  [UriKind]::Absolute, [ref]$sourceUri)
if ([string]$ffmpeg[0].archiveSha256 -notmatch '^[0-9a-f]{64}$' -or
    [string]$ffmpeg[0].sourceSha256 -notmatch '^[0-9a-f]{64}$' -or
    -not $validSourceUri -or $sourceUri.Scheme -cne 'https' -or
    $sourceUri.Host -cne 'github.com') {
  throw 'The verified FFmpeg dependency manifest and corresponding-source reference are required.'
}

foreach ($directory in @($ReleaseRoot, $StagingRoot)) {
  if (Test-Path -LiteralPath $directory) {
    Remove-Item -LiteralPath $directory -Recurse -Force
  }
  New-Item -ItemType Directory -Force -Path $directory | Out-Null
}

$prefix = "htmlapps-lossless-video-cutter-v$Version"
$standardName = "$prefix.html"
$selfExtractName = "$prefix.self-extract.html"
$zipName = "$prefix.zip"

$standaloneSource = Join-Path $Root 'dist/index.html'
$selfExtractSource = Join-Path $Root 'dist/index.self-extract.html'
$rootSource = Join-Path $Root 'lossless-video-cutter.html'

foreach ($file in @($standaloneSource, $selfExtractSource, $rootSource)) {
  if (-not (Test-Path -LiteralPath $file -PathType Leaf) -or (Get-Item -LiteralPath $file).Length -lt 1024) {
    throw "Missing or unexpectedly small generated standalone HTML: $file"
  }
}
if ((Get-FileHash -Algorithm SHA256 -LiteralPath $standaloneSource).Hash -cne
    (Get-FileHash -Algorithm SHA256 -LiteralPath $rootSource).Hash) {
  throw 'The root distribution HTML must match the verified standalone HTML.'
}

$packageSources = [ordered]@{}
$packageSources[$standardName] = $standaloneSource
$packageSources[$selfExtractName] = $selfExtractSource
$packageSources['dependency-manifest.json'] = $manifestPath
$packageSources['self-extract-manifest.json'] = Join-Path $Root 'dist/self-extract-manifest.json'
$packageSources['README.md'] = Join-Path $Root 'README.md'
$packageSources['README.ja.md'] = Join-Path $Root 'README.ja.md'
$packageSources['LICENSE'] = Join-Path $Root 'LICENSE'
$packageSources['THIRD_PARTY_NOTICES.md'] = Join-Path $Root 'THIRD_PARTY_NOTICES.md'
$packageSources['VERIFY_OFFLINE.md'] = Join-Path $Root 'VERIFY_OFFLINE.md'
foreach ($entry in $packageSources.GetEnumerator()) {
  if (-not (Test-Path -LiteralPath $entry.Value -PathType Leaf)) {
    throw "Required Release file missing: $($entry.Value)"
  }
  Copy-Item -LiteralPath $entry.Value -Destination (Join-Path $StagingRoot $entry.Key) -Force
}

Copy-Item -LiteralPath $standaloneSource -Destination (Join-Path $ReleaseRoot $standardName) -Force
Copy-Item -LiteralPath $selfExtractSource -Destination (Join-Path $ReleaseRoot $selfExtractName) -Force
$zipPath = Join-Path $ReleaseRoot $zipName
Compress-Archive -Path (Join-Path $StagingRoot '*') -DestinationPath $zipPath -CompressionLevel Optimal

# Confirm the portable ZIP has precisely the expected files (including
# licenses and source provenance); no local build cache is ever packaged.
Add-Type -AssemblyName System.IO.Compression
$archive = [System.IO.Compression.ZipFile]::OpenRead($zipPath)
try {
  $expected = @($packageSources.Keys | Sort-Object)
  $actual = @($archive.Entries | ForEach-Object { $_.FullName } | Sort-Object)
  if (($actual -join [char]10) -cne ($expected -join [char]10)) {
    throw "Release ZIP contents differ from the declared files. Actual: $($actual -join ', ')"
  }
  foreach ($entry in $archive.Entries) {
    if ($entry.Length -eq 0) {
      throw "Release ZIP contains an empty file: $($entry.FullName)"
    }
  }
} finally {
  $archive.Dispose()
}

$assetNames = @($standardName, $selfExtractName, $zipName)
$shaLines = foreach ($name in $assetNames) {
  $sha = (Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $ReleaseRoot $name)).Hash.ToLowerInvariant()
  "$sha  $name"
}
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText((Join-Path $ReleaseRoot 'SHA256SUMS.txt'), ($shaLines -join [char]10) + [char]10, $utf8NoBom)
foreach ($line in $shaLines) {
  if ($line -notmatch '^([a-f0-9]{64})  (.+)$') { throw "Malformed SHA256SUMS entry: $line" }
  $name = $Matches[2]
  $hash = $Matches[1]
  if ((Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $ReleaseRoot $name)).Hash.ToLowerInvariant() -cne $hash) {
    throw "Release asset checksum mismatch: $name"
  }
}

Write-Host "[OK] Packaged $($Version): standalone HTML, self-extracting HTML, ZIP and SHA256SUMS.txt" -ForegroundColor Green
Write-Host "[OK] ZIP includes bilingual documentation, licenses and FFmpeg source provenance." -ForegroundColor Green
