param(
  [string]$Root = ""
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

if ([string]::IsNullOrWhiteSpace($Root)) {
  $Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
}

$Root = [System.IO.Path]::GetFullPath($Root).TrimEnd([char[]]@([char]92, [char]47))
$RootPrefix = $Root + [System.IO.Path]::DirectorySeparatorChar
$SelfPath = [System.IO.Path]::GetFullPath($MyInvocation.MyCommand.Path)

$targets = @(
  (Join-Path $Root "src"),
  (Join-Path $Root "scripts"),
  (Join-Path $Root "build-standalone.ps1"),
  (Join-Path $Root "build-standalone.bat"),
  (Join-Path $Root "app.config.json"),
  (Join-Path $Root "dependencies.json")
)

$files = @(
  foreach ($target in $targets) {
    if (Test-Path $target -PathType Container) {
      Get-ChildItem -Path $target -Recurse -File
    } elseif (Test-Path $target -PathType Leaf) {
      Get-Item $target
    }
  }
) | Sort-Object FullName -Unique

$patterns = @(
  @{ Label = "remote URL"; Regex = 'https?://' },
  @{ Label = "fetch"; Regex = '\bfetch\s*\(' },
  @{ Label = "XHR"; Regex = '\bXMLHttpRequest\b' },
  @{ Label = "WebSocket"; Regex = '\bWebSocket\b' },
  @{ Label = "EventSource"; Regex = '\bEventSource\b' },
  @{ Label = "dynamic import"; Regex = '\bimport\s*\(' },
  @{ Label = "importScripts"; Regex = '\bimportScripts\s*\(' }
)

# These files may contain build-time metadata or download URLs. They are never
# copied into the standalone app as executable runtime network calls.
$allowedPathPrefixes = @(
  'build-standalone.ps1',
  'app.config.json',
  'dependencies.json',
  'schemas/',
  'scripts/build-self-extract.ps1',
  'scripts/verify-self-extract.ps1',
  'scripts/verify-standalone.ps1',
  'scripts/check-repository.ps1'
)

function Get-NormalizedRelativePath([string]$Path) {
  $fullPath = [System.IO.Path]::GetFullPath($Path)
  if (-not $fullPath.StartsWith($RootPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Path is outside the repository root: $fullPath"
  }

  return $fullPath.Substring($RootPrefix.Length).Replace([char]92, [char]47)
}

function Test-IsAllowedPath([string]$RelativePath) {
  foreach ($prefix in $allowedPathPrefixes) {
    if ($RelativePath.StartsWith($prefix, [System.StringComparison]::OrdinalIgnoreCase)) {
      return $true
    }
  }
  return $false
}

$hits = New-Object System.Collections.Generic.List[string]
foreach ($file in $files) {
  if ($file.Extension -notin @(".html", ".js", ".mjs", ".css", ".ps1", ".bat", ".json")) {
    continue
  }

  $fullPath = [System.IO.Path]::GetFullPath($file.FullName)

  # Do not scan this checker itself. Its pattern definitions intentionally
  # contain words such as WebSocket and EventSource.
  if ($fullPath.Equals($SelfPath, [System.StringComparison]::OrdinalIgnoreCase)) {
    continue
  }

  $relative = Get-NormalizedRelativePath $fullPath
  if (Test-IsAllowedPath $relative) {
    continue
  }

  $lineNumber = 0
  foreach ($line in Get-Content -Encoding UTF8 $fullPath) {
    $lineNumber++
    foreach ($pattern in $patterns) {
      if ($line -match $pattern.Regex) {
        $hits.Add("$relative`:$lineNumber [$($pattern.Label)] $($line.Trim())")
      }
    }
  }
}

if ($hits.Count -gt 0) {
  foreach ($hit in $hits) {
    Write-Host $hit -ForegroundColor Red
  }
  throw "Source network check failed with $($hits.Count) unexpected hit(s)."
}

Write-Host "[OK] Source network check passed. Expected build-time URLs only." -ForegroundColor Green