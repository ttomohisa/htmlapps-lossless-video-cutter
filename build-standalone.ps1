param(
  [switch]$ForceDownload,
  [switch]$SkipSelfExtract,
  [string]$OutputPath = ""
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
Set-StrictMode -Version Latest
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$TemplatePath = Join-Path $Root "src\index.template.html"
$AppConfigPath = Join-Path $Root "app.config.json"
$DependenciesPath = Join-Path $Root "dependencies.json"
$VerifyPath = Join-Path $Root "scripts\verify-standalone.ps1"
$SelfExtractBuilderPath = Join-Path $Root "scripts\build-self-extract.ps1"
$CacheRoot = Join-Path $Root ".cache"
$DistRoot = Join-Path $Root "dist"

$OutputPathWasSpecified = -not [string]::IsNullOrWhiteSpace($OutputPath)
if ($OutputPathWasSpecified -and -not [System.IO.Path]::IsPathRooted($OutputPath)) {
  $OutputPath = Join-Path $Root $OutputPath
}

New-Item -ItemType Directory -Force -Path $CacheRoot, $DistRoot | Out-Null

function Write-Step([string]$Message) {
  Write-Host "[Single HTML] $Message" -ForegroundColor Cyan
}

function Get-Json([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path)) { throw "Required file not found: $Path" }
  return Get-Content -Raw -Encoding UTF8 -LiteralPath $Path | ConvertFrom-Json
}

function Get-SafeId([string]$Value) {
  if ([string]::IsNullOrWhiteSpace($Value)) { throw "Dependency id cannot be empty." }
  if ($Value -notmatch '^[a-z0-9][a-z0-9._-]*$') { throw "Dependency id '$Value' must use lowercase letters, numbers, dot, underscore, or hyphen." }
  return $Value
}

function Get-GitHubReleasePackage([object]$Dependency) {
  $repository = [string]$Dependency.repository
  $version = [string]$Dependency.version
  if ([string]::IsNullOrWhiteSpace($version)) { throw "GitHub Release dependencies require version." }
  $tag = "v$version"
  $releaseAsset = ([string]$Dependency.releaseAsset).Replace("{version}", $version)
  $checksumsAsset = [string]$Dependency.checksumsAsset
  $sourceAsset = ([string]$Dependency.sourceAsset).Replace("{version}", $version)
  if ([string]::IsNullOrWhiteSpace($repository) -or $repository -notmatch '^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$') {
    throw "Dependency repository must be in owner/name form."
  }
  if ([string]::IsNullOrWhiteSpace($releaseAsset) -or [string]::IsNullOrWhiteSpace($checksumsAsset) -or [string]::IsNullOrWhiteSpace($sourceAsset)) {
    throw "GitHub Release dependencies require releaseAsset, checksumsAsset, and sourceAsset."
  }

  $cacheKey = (([string]$Dependency.id) + "-" + ($tag -replace '[^A-Za-z0-9._-]', '-'))
  $packageRoot = Join-Path $CacheRoot $cacheKey
  $extractRoot = Join-Path $packageRoot "extracted"
  $archivePath = Join-Path $packageRoot $releaseAsset
  $checksumsPath = Join-Path $packageRoot $checksumsAsset
  $baseUrl = "https://github.com/$repository/releases/download/$tag"
  $headers = @{ "User-Agent" = "htmlapps-lossless-video-cutter/1.0" }

  if ($ForceDownload -and (Test-Path -LiteralPath $packageRoot)) {
    Remove-Item -Recurse -Force -LiteralPath $packageRoot
  }
  New-Item -ItemType Directory -Force -Path $packageRoot | Out-Null

  if (-not (Test-Path -LiteralPath $checksumsPath)) {
    Write-Step "Downloading checksum list for $repository $tag"
    $partial = "$checksumsPath.part"
    Remove-Item -Force -ErrorAction SilentlyContinue -LiteralPath $partial
    Invoke-WebRequest -Uri "$baseUrl/$checksumsAsset" -OutFile $partial -UseBasicParsing -Headers $headers
    Move-Item -Force -LiteralPath $partial -Destination $checksumsPath
  }

  $expectedSha256 = $null
  $sourceSha256 = $null
  foreach ($line in Get-Content -Encoding UTF8 -LiteralPath $checksumsPath) {
    if ($line -match '^\s*([0-9A-Fa-f]{64})\s+\*?(.+?)\s*$') {
      $hash = $Matches[1].ToLowerInvariant()
      $name = $Matches[2]
      if ($name -eq $releaseAsset) { $expectedSha256 = $hash }
      if ($name -eq $sourceAsset) { $sourceSha256 = $hash }
    }
  }
  if ([string]::IsNullOrWhiteSpace([string]$expectedSha256)) {
    throw "SHA256SUMS.txt does not contain an entry for $releaseAsset"
  }
  if ([string]::IsNullOrWhiteSpace([string]$sourceSha256)) {
    throw "SHA256SUMS.txt does not contain an entry for corresponding source asset $sourceAsset"
  }

  $needsDownload = -not (Test-Path -LiteralPath $archivePath)
  if (-not $needsDownload) {
    $cachedSha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $archivePath).Hash.ToLowerInvariant()
    if ($cachedSha256 -ne $expectedSha256) {
      Write-Warning "Cached release asset checksum mismatch. Downloading it again."
      Remove-Item -Force -LiteralPath $archivePath
      $needsDownload = $true
    } else {
      Write-Step "Using verified cached release asset $releaseAsset"
    }
  }

  if ($needsDownload) {
    $partial = "$archivePath.part"
    Remove-Item -Force -ErrorAction SilentlyContinue -LiteralPath $partial
    Write-Step "Downloading $repository $tag / $releaseAsset"
    Invoke-WebRequest -Uri "$baseUrl/$releaseAsset" -OutFile $partial -UseBasicParsing -Headers $headers
    $actualSha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $partial).Hash.ToLowerInvariant()
    if ($actualSha256 -ne $expectedSha256) {
      Remove-Item -Force -ErrorAction SilentlyContinue -LiteralPath $partial
      throw "Release asset SHA-256 mismatch. Expected $expectedSha256 but got $actualSha256"
    }
    Move-Item -Force -LiteralPath $partial -Destination $archivePath
  }

  $archiveSha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $archivePath).Hash.ToLowerInvariant()
  if ($archiveSha256 -ne $expectedSha256) {
    throw "Verified archive checksum changed unexpectedly: $archivePath"
  }

  if (-not (Test-Path -LiteralPath $extractRoot)) {
    Write-Step "Extracting $releaseAsset"
    Remove-Item -Recurse -Force -ErrorAction SilentlyContinue -LiteralPath $extractRoot
    New-Item -ItemType Directory -Force -Path $extractRoot | Out-Null
    Expand-Archive -LiteralPath $archivePath -DestinationPath $extractRoot -Force
  }

  return [ordered]@{
    Root = $extractRoot
    Archive = $archivePath
    ArchiveSha256 = $archiveSha256
    SourceSha256 = $sourceSha256
    ReleaseUrl = "https://github.com/$repository/releases/tag/$tag"
    CorrespondingSourceUrl = "$baseUrl/$sourceAsset"
    ResolvedVersion = $version
    ResolvedTag = $tag
    ResolvedReleaseAsset = $releaseAsset
    ResolvedSourceAsset = $sourceAsset
  }
}

function Get-MimeType([string]$Path) {
  switch ([System.IO.Path]::GetExtension($Path).ToLowerInvariant()) {
    ".js" { return "text/javascript" }
    ".mjs" { return "text/javascript" }
    ".css" { return "text/css" }
    ".json" { return "application/json" }
    ".wasm" { return "application/wasm" }
    ".svg" { return "image/svg+xml" }
    ".png" { return "image/png" }
    ".jpg" { return "image/jpeg" }
    ".jpeg" { return "image/jpeg" }
    ".webp" { return "image/webp" }
    ".woff" { return "font/woff" }
    ".woff2" { return "font/woff2" }
    ".txt" { return "text/plain" }
    default { return "application/octet-stream" }
  }
}

function Get-AssetBytes([string]$Path, [bool]$StripSourceMapComment) {
  if (-not (Test-Path -LiteralPath $Path)) { throw "Dependency asset not found: $Path" }
  if ($StripSourceMapComment -and [System.IO.Path]::GetExtension($Path) -in @(".js", ".mjs", ".css")) {
    $text = [System.IO.File]::ReadAllText($Path, [System.Text.Encoding]::UTF8)
    $text = [regex]::Replace($text, "(?m)^\s*//# sourceMappingURL=.*$", "")
    $text = [regex]::Replace($text, "(?m)^\s*/\*# sourceMappingURL=.*?\*/\s*$", "")
    return [System.Text.Encoding]::UTF8.GetBytes($text)
  }
  return [System.IO.File]::ReadAllBytes($Path)
}

function ConvertTo-SafeJson([object]$Value, [int]$Depth = 30) {
  return ($Value | ConvertTo-Json -Compress -Depth $Depth).Replace("<", "\u003c").Replace(">", "\u003e").Replace("&", "\u0026")
}

function Get-RelativeAssetPath([string]$PackageRoot, [string]$ConfiguredPath) {
  if ([string]::IsNullOrWhiteSpace($ConfiguredPath)) { throw "Dependency asset path cannot be empty." }
  $rootFull = [System.IO.Path]::GetFullPath($PackageRoot).TrimEnd([char[]]@([char]92, [char]47))
  $assetFull = [System.IO.Path]::GetFullPath((Join-Path $PackageRoot $ConfiguredPath))
  if (-not $assetFull.StartsWith($rootFull + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Dependency asset path escapes the extracted release root: $ConfiguredPath"
  }
  return $assetFull
}

$appConfig = Get-Json $AppConfigPath
$dependencyConfig = Get-Json $DependenciesPath
if (-not $OutputPathWasSpecified) {
  $configuredOutput = [string]$appConfig.build.output
  if ([string]::IsNullOrWhiteSpace($configuredOutput)) { $configuredOutput = "dist/index.html" }
  $OutputPath = if ([System.IO.Path]::IsPathRooted($configuredOutput)) { $configuredOutput } else { Join-Path $Root $configuredOutput }
}
if (-not $dependencyConfig.dependencies) { $dependencies = @() } else { $dependencies = @($dependencyConfig.dependencies) }

$ids = @{}
$assetBundle = [ordered]@{ schemaVersion = 2; dependencies = [ordered]@{} }
$manifestDependencies = @()

foreach ($dependency in $dependencies) {
  $id = Get-SafeId ([string]$dependency.id)
  if ($ids.ContainsKey($id)) { throw "Duplicate dependency id: $id" }
  $ids[$id] = $true

  if ([string]$dependency.source -ne "github-release") {
    throw "Unsupported dependency source '$([string]$dependency.source)' for '$id'."
  }
  $package = Get-GitHubReleasePackage $dependency
  $dependencyAssets = [ordered]@{}
  $manifestAssets = @()
  $assetKeys = @{}

  foreach ($asset in @($dependency.assets)) {
    $key = Get-SafeId ([string]$asset.key)
    if ($assetKeys.ContainsKey($key)) { throw "Duplicate asset key '$key' in dependency '$id'." }
    $assetKeys[$key] = $true

    $assetPath = Get-RelativeAssetPath $package.Root ([string]$asset.path)
    $strip = $false
    if ($asset.PSObject.Properties.Name -contains "stripSourceMapComment") { $strip = [bool]$asset.stripSourceMapComment }
    $bytes = Get-AssetBytes $assetPath $strip
    $configuredMime = ""
    if ($asset.PSObject.Properties.Name -contains "mime") { $configuredMime = [string]$asset.mime }
    $mime = if ([string]::IsNullOrWhiteSpace($configuredMime)) { Get-MimeType $assetPath } else { $configuredMime }
    $shaAlgorithm = [Security.Cryptography.SHA256]::Create()
    try { $hashBytes = $shaAlgorithm.ComputeHash($bytes) } finally { $shaAlgorithm.Dispose() }
    $sha = ($hashBytes | ForEach-Object { $_.ToString("x2") }) -join ""

    $dependencyAssets[$key] = [ordered]@{ mime = $mime; base64 = [Convert]::ToBase64String($bytes) }
    $manifestAssets += [ordered]@{ key = $key; path = [string]$asset.path; mime = $mime; bytes = $bytes.Length; sha256 = $sha }
  }

  $assetBundle.dependencies[$id] = [ordered]@{
    source = "github-release"
    repository = [string]$dependency.repository
    version = [string]$package.ResolvedVersion
    tag = [string]$package.ResolvedTag
    assets = $dependencyAssets
  }
  $manifestDependencies += [ordered]@{
    id = $id
    source = "github-release"
    repository = [string]$dependency.repository
    version = [string]$package.ResolvedVersion
    tag = [string]$package.ResolvedTag
    releaseAsset = [string]$package.ResolvedReleaseAsset
    checksumsAsset = [string]$dependency.checksumsAsset
    sourceAsset = [string]$package.ResolvedSourceAsset
    license = [string]$dependency.license
    homepage = [string]$dependency.homepage
    releaseUrl = [string]$package.ReleaseUrl
    correspondingSourceUrl = [string]$package.CorrespondingSourceUrl
    archiveSha256 = [string]$package.ArchiveSha256
    sourceSha256 = [string]$package.SourceSha256
    assets = $manifestAssets
  }
}

$manifest = [ordered]@{
  schemaVersion = 2
  builder = "htmlapps-lossless-video-cutter/1.0"
  generatedAtUtc = [DateTime]::UtcNow.ToString("o")
  app = [ordered]@{ name = [string]$appConfig.name; slug = [string]$appConfig.slug; version = [string]$appConfig.version }
  dependencies = $manifestDependencies
}

Write-Step "Generating standalone HTML"
$template = [System.IO.File]::ReadAllText($TemplatePath, [System.Text.Encoding]::UTF8)
$assetBundleJson = ConvertTo-SafeJson $assetBundle 50
$replacements = [ordered]@{
  "__APP_CONFIG_JSON__" = ConvertTo-SafeJson $appConfig 20
  "__BUILD_MANIFEST_JSON__" = ConvertTo-SafeJson $manifest 40
  "__EMBEDDED_ASSET_BUNDLE_JSON__" = $assetBundleJson
}
foreach ($entry in $replacements.GetEnumerator()) {
  $count = ([regex]::Matches($template, [regex]::Escape($entry.Key))).Count
  if ($count -ne 1) { throw "Template placeholder $($entry.Key) must occur exactly once; found $count." }
  $template = $template.Replace($entry.Key, [string]$entry.Value)
}

$outputDirectory = Split-Path -Parent $OutputPath
New-Item -ItemType Directory -Force -Path $outputDirectory | Out-Null
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($OutputPath, $template, $utf8NoBom)
[System.IO.File]::WriteAllText((Join-Path $outputDirectory "dependency-manifest.json"), ($manifest | ConvertTo-Json -Depth 40), $utf8NoBom)
[System.IO.File]::WriteAllText((Join-Path $outputDirectory ".nojekyll"), "", $utf8NoBom)

& $VerifyPath -Path $OutputPath -RequireNetworkBlock ([bool]$appConfig.build.blockRuntimeNetwork)

$selfExtractEnabled = $false
$selfExtractOutputPath = ""
if (-not $SkipSelfExtract -and ($appConfig.build.PSObject.Properties.Name -contains "selfExtract")) {
  $selfExtractConfig = $appConfig.build.selfExtract
  if ($selfExtractConfig -and ($selfExtractConfig.PSObject.Properties.Name -contains "enabled")) { $selfExtractEnabled = [bool]$selfExtractConfig.enabled }
  if ($selfExtractEnabled) {
    if (-not ($selfExtractConfig.PSObject.Properties.Name -contains "output")) { throw "app.config.json: build.selfExtract.output is required when self-extract output is enabled." }
    if ($OutputPathWasSpecified) {
      $customDirectory = Split-Path -Parent $OutputPath
      $customBaseName = [System.IO.Path]::GetFileNameWithoutExtension($OutputPath)
      $selfExtractOutputPath = Join-Path $customDirectory ($customBaseName + ".self-extract.html")
    } else {
      $configuredSelfExtractOutput = [string]$selfExtractConfig.output
      if ([string]::IsNullOrWhiteSpace($configuredSelfExtractOutput)) { throw "app.config.json: build.selfExtract.output cannot be empty." }
      $selfExtractOutputPath = if ([System.IO.Path]::IsPathRooted($configuredSelfExtractOutput)) { $configuredSelfExtractOutput } else { Join-Path $Root $configuredSelfExtractOutput }
    }
    Write-Step "Generating self-extracting HTML"
    & $SelfExtractBuilderPath -InputPath $OutputPath -OutputPath $selfExtractOutputPath -AppName ([string]$appConfig.name) -AppNameJa ([string]$appConfig.nameJa)
  }
}

# Keep the repository-root distribution file in sync for Browser Kitty and
# direct GitHub consumers.  A custom -OutputPath deliberately skips this copy.
if (-not $OutputPathWasSpecified) {
  $distributionPath = Join-Path $Root "lossless-video-cutter.html"
  Copy-Item -Force -LiteralPath $OutputPath -Destination $distributionPath
  Write-Host "[OK] Repository distribution HTML: $distributionPath" -ForegroundColor Green
}

$outputHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $OutputPath).Hash.ToLowerInvariant()
$outputSizeMb = [Math]::Round((Get-Item -LiteralPath $OutputPath).Length / 1MB, 2)
Write-Host ""
Write-Host "[OK] Standalone HTML: $OutputPath" -ForegroundColor Green
Write-Host "[OK] Size: $outputSizeMb MB"
Write-Host "[OK] SHA-256: $outputHash"
Write-Host "[OK] FFmpeg WASM Release checksum verified before embedding."
Write-Host "[OK] Runtime network access is blocked by CSP."
if ($selfExtractEnabled) { Write-Host "[OK] Self-extracting HTML: $selfExtractOutputPath" -ForegroundColor Green }
