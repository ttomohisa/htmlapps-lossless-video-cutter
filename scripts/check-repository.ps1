param(
  [switch]$ForceDownload
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)

$required = @(
  "AGENTS.md",
  "APP_SPEC.md",
  "app.config.json",
  "dependencies.json",
  "src\index.template.html",
  "build-standalone.ps1",
  "update-ffmpeg.bat",
  "scripts\update-ffmpeg.ps1",
  "scripts\build-self-extract.ps1",
  "scripts\check-source.ps1",
  "scripts\verify-standalone.ps1",
  "scripts\verify-self-extract.ps1",
  "README.md",
  "README.ja.md",
  "LICENSE",
  "THIRD_PARTY_NOTICES.md",
  "schemas\app-config.schema.json",
  "schemas\dependencies.schema.json"
)

foreach ($relative in $required) {
  $path = Join-Path $Root $relative
  if (-not (Test-Path $path)) { throw "Required repository file is missing: $relative" }
}

$selfExtractBuilderPath = Join-Path $Root "scripts\build-self-extract.ps1"
foreach ($byte in [System.IO.File]::ReadAllBytes($selfExtractBuilderPath)) {
  if ($byte -gt 127) {
    throw "scripts\build-self-extract.ps1 must remain ASCII-only for Windows PowerShell 5.1 compatibility."
  }
}

$app = Get-Content -Raw -Encoding UTF8 (Join-Path $Root "app.config.json") | ConvertFrom-Json
if ([string]::IsNullOrWhiteSpace([string]$app.name)) { throw "app.config.json: name is required" }
if ([string]::IsNullOrWhiteSpace([string]$app.slug)) { throw "app.config.json: slug is required" }
if ([string]::IsNullOrWhiteSpace([string]$app.version)) { throw "app.config.json: version is required" }


$dependencies = Get-Content -Raw -Encoding UTF8 (Join-Path $Root "dependencies.json") | ConvertFrom-Json
$ffmpegDependency = @($dependencies.dependencies | Where-Object { [string]$_.id -eq "ffmpeg-wasm-builder" })
if ($ffmpegDependency.Count -ne 1) { throw "dependencies.json must contain exactly one ffmpeg-wasm-builder dependency" }
if ([string]$ffmpegDependency[0].source -ne "github-release") { throw "ffmpeg-wasm-builder must use source=github-release" }
if ([string]$ffmpegDependency[0].version -notmatch '^[0-9]+\.[0-9]+\.[0-9]+(?:[-+][0-9A-Za-z.-]+)?$') { throw "ffmpeg-wasm-builder version must be an explicit semver" }
if ([string]$ffmpegDependency[0].releaseAsset -notmatch '\{version\}') { throw "releaseAsset must derive from the single version field" }
if ([string]$ffmpegDependency[0].sourceAsset -notmatch '\{version\}') { throw "sourceAsset must derive from the single version field" }


$templateText = [System.IO.File]::ReadAllText((Join-Path $Root "src\index.template.html"), [System.Text.Encoding]::UTF8)
if ($templateText -notmatch 'WORKERFS') { throw "Template must use WORKERFS for large input files" }
if ($templateText -notmatch 'actual-start=') { throw "Template must surface the keyframe-aligned actual start" }
if ($templateText -notmatch 'id="keyframeMarker"') { throw "Template must visualize the actual keyframe-aligned start on the timeline" }
if ($templateText -notmatch 'id="alignmentDelta"') { throw "Template must show the requested-to-actual keyframe alignment delta" }
if ($templateText -notmatch '<details class="keyframe-card" id="keyframeCard">') { throw "Start-position details must be collapsed by default" }
if ($templateText -notmatch '<title>Lossless Video Cutter</title>') { throw "Visible app name must be Lossless Video Cutter" }
if ($templateText -notmatch 'function setInitialRange\(duration\)') { throw "Detected media duration must initialize the start/end time fields" }
if ($templateText -notmatch 'function selectedDuration\(\)') { throw "Selected-duration helper must keep timeline and action dock summaries synchronized" }
if ($templateText -notmatch 'class="text-btn is-danger" id="clearFileButton"') { throw "File removal control must keep its icon-aware danger styling" }
if ($templateText -notmatch '\.timeline-edge\{position:absolute;top:0;z-index:16') { throw "Timeline S/E labels must stay above the draggable handles" }
if ($templateText -match "timeline\.addEventListener\('pointerdown'") { throw "Timeline background must not seek; only the current-position playhead may scrub" }
if ($templateText -notmatch "playheadGrab\.addEventListener\('pointerdown'") { throw "Current-position playhead grab target must be draggable" }
if ($templateText -notmatch 'id="timelineFilmstrip"') { throw "Timeline must include the editor-style filmstrip surface" }
if ($templateText -notmatch 'id="filmstripProbe"') { throw "Timeline thumbnails must use a dedicated local probe video" }
if ($templateText -notmatch 'event\.buttons&1') { throw "Mouse scrubbing must stop when the primary button is no longer held" }
if ($templateText -notmatch 'function buildFilmstrip\(\)') { throw "Timeline filmstrip must be generated locally from the selected video" }
if ($templateText -match '<video id="sourcePreview"[^>]*\scontrols(?:\s|=|>)') { throw "Source preview must not use native video controls; the timeline is the single seek surface" }
if ($templateText -notmatch 'id="previewPlayButton"') { throw "Source preview must keep a custom play/pause control" }
if ($templateText -notmatch 'class="editor-dock"') { throw "Primary range summary and action controls must stay consolidated in the editor dock" }
if ($templateText -notmatch 'class="result-save-panel"') { throw "Result area must keep the editable save filename beside the save actions" }
if ($templateText -notmatch 'id="outputFilename"') { throw "Result area must allow the save filename to be edited" }
if ($templateText -notmatch 'normalizeOutputFilename') { throw "Output filename must be normalized to the selected container extension" }
if ($templateText -notmatch 'id="newVideoDialog"') { throw "Choosing another video must use a confirmation dialog" }
if ($templateText -notmatch 'function resetTimelineVisuals\(\)') { throw "Switching videos must explicitly reset the timeline handles and playhead" }
if ($templateText -notmatch 'id="mobileNav"') { throw "Mobile layout must include the bottom action navigation" }
if ($templateText -notmatch 'id="mobileCutButton"') { throw "Mobile bottom navigation must expose the cut action" }
if ($templateText -notmatch 'id="mobileInlineCutButton"') { throw "Mobile range section must expose an inline cut action" }
if ($templateText -notmatch 'id="fullRangeDialog"') { throw "Cutting the untouched full range must use a confirmation dialog" }
if ($templateText -notmatch 'function isFullRange\(\)') { throw "Full-range detection must be explicit before cutting" }
if ($templateText -notmatch 'function requestCut\(\)') { throw "Cut buttons must route through the full-range confirmation guard" }
if ($templateText -notmatch 'id="mobileSaveButton"[^>]*disabled') { throw "Mobile bottom navigation must expose a Save action that starts disabled" }
if ($templateText -notmatch 'grid-template-columns:repeat\(4,1fr\)') { throw "Mobile bottom navigation must reserve four actions: Video / Range / Cut / Save" }
if ($templateText -notmatch 'id="shareButton"[^>]*>\s*<svg') { throw "Share action must include an icon" }
if ($templateText -notmatch '@media\(max-width:640px\).*?\.dock-action\{display:none') { throw "Mobile editor dock must hide the duplicate desktop cut action" }
if ($templateText -match 'state\.file\.arrayBuffer\s*\(') { throw "Template must not copy the full selected input with file.arrayBuffer()" }
if ([string]$ffmpegDependency[0].releaseAsset -notmatch 'lossless-video-cutter') { throw "ffmpeg-wasm-builder releaseAsset must use the lossless-video-cutter profile" }
if ([string]$ffmpegDependency[0].license -notmatch 'LGPL-2\.1-or-later') { throw "lossless-video-cutter dependency must document LGPL-2.1-or-later" }

$node = Get-Command node -ErrorAction Stop
$testPath = Join-Path $Root "tests\lossless-video-cutter.test.mjs"
& $node.Source --test $testPath
if ($LASTEXITCODE -ne 0) { throw "UI regression tests failed." }

& (Join-Path $Root "scripts\check-source.ps1")
$buildArguments = @{}
if ($ForceDownload) { $buildArguments.ForceDownload = $true }
& (Join-Path $Root "build-standalone.ps1") @buildArguments

$distOutput = Join-Path $Root "dist\index.html"
$rootOutput = Join-Path $Root "lossless-video-cutter.html"
if (-not (Test-Path -LiteralPath $rootOutput)) { throw "Root distribution HTML was not generated: lossless-video-cutter.html" }
$distHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $distOutput).Hash
$rootHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $rootOutput).Hash
if ($distHash -ne $rootHash) { throw "lossless-video-cutter.html must match dist/index.html" }

$manifestPath = Join-Path $Root "dist\dependency-manifest.json"
$manifest = Get-Content -Raw -Encoding UTF8 -LiteralPath $manifestPath | ConvertFrom-Json
$resolved = @($manifest.dependencies | Where-Object { [string]$_.id -eq "ffmpeg-wasm-builder" })
if ($resolved.Count -ne 1) { throw "Generated manifest must contain exactly one ffmpeg-wasm-builder dependency" }
if ([string]$resolved[0].version -ne [string]$ffmpegDependency[0].version) { throw "Generated manifest Builder version does not match dependencies.json" }
if ([string]$resolved[0].archiveSha256 -notmatch '^[0-9a-f]{64}$') { throw "Generated manifest must record the verified Release archive SHA-256" }
if ([string]$resolved[0].sourceSha256 -notmatch '^[0-9a-f]{64}$') { throw "Generated manifest must record the corresponding-source SHA-256" }
if ([string]::IsNullOrWhiteSpace([string]$resolved[0].correspondingSourceUrl)) { throw "Generated manifest must record the corresponding-source URL" }

$previousHtmlPath = $env:LVC_TEST_TEMPLATE
try {
  $env:LVC_TEST_TEMPLATE = $distOutput
  & $node.Source --test $testPath
  if ($LASTEXITCODE -ne 0) { throw "Generated HTML regression tests failed." }
} finally {
  $env:LVC_TEST_TEMPLATE = $previousHtmlPath
}


& node (Join-Path $Root "tests\header-normalization.test.mjs")
if ($LASTEXITCODE -ne 0) { throw "Header normalization regression failed." }
& node (Join-Path $Root "tests\app-icon.test.mjs")
if ($LASTEXITCODE -ne 0) { throw "App icon regression failed." }
Write-Host "[OK] Repository check passed." -ForegroundColor Green
