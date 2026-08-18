param(
  [Parameter(Mandatory = $true)]
  [string]$Path,
  [bool]$RequireNetworkBlock = $true
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
$fullPath = [System.IO.Path]::GetFullPath($Path)
if (-not (Test-Path $fullPath)) { throw "Standalone HTML not found: $fullPath" }

$content = [System.IO.File]::ReadAllText($fullPath, [System.Text.Encoding]::UTF8)
$errors = New-Object System.Collections.Generic.List[string]

foreach ($placeholder in @("__APP_CONFIG_JSON__", "__BUILD_MANIFEST_JSON__", "__EMBEDDED_ASSET_BUNDLE_JSON__")) {
  if ($content.Contains($placeholder)) { $errors.Add("Unresolved placeholder: $placeholder") }
}
if ($content -match '<script[^>]+src\s*=') { $errors.Add("External script reference found.") }
if ($content -match '<link[^>]+href\s*=\s*["'']\s*https?://') { $errors.Add("External link reference found.") }
if ($content -match '@import\s+(url\()?\s*["'']?https?://') { $errors.Add("External CSS import found.") }
if ($content -match '<iframe\b') { $errors.Add("iframe is not allowed in the standalone output.") }
if ($RequireNetworkBlock -and $content -notmatch "connect-src\s+'none'") { $errors.Add("CSP must include connect-src 'none'.") }
if ($content -notmatch "script-src[^;]*'wasm-unsafe-eval'") { $errors.Add("CSP must include script-src 'wasm-unsafe-eval' for ffmpeg.wasm.") }
if ($content -match "(?<!wasm-)'unsafe-eval'") { $errors.Add("CSP must not include the broader JavaScript 'unsafe-eval'.") }
if ($content -notmatch 'ffmpeg-wasm-builder') { $errors.Add("Embedded Builder dependency metadata was not found.") }
if ($content -notmatch '__FFMPEG_WASM_PROGRESS__') { $errors.Add("Lossless cutter progress marker was not found.") }
if ($content -notmatch 'WORKERFS') { $errors.Add("WORKERFS support was not found in the standalone runtime.") }
if ($content -notmatch 'workerfs/input') { $errors.Add("WORKERFS input path contract was not found.") }
if ($content -notmatch 'actual-start=') { $errors.Add("Keyframe-aligned actual-start reporting was not found.") }
if ($content -match '@ffmpeg/core|ffmpeg-core\.js|libx264|libx265|libvpx-vp9') { $errors.Add("Unexpected legacy/transcoding FFmpeg references remain in the standalone output.") }
if ($content -match 'state\.file\.arrayBuffer\s*\(') { $errors.Add("The full input file must not be copied with file.arrayBuffer(); use WORKERFS.") }

if ($errors.Count -gt 0) {
  $errors | ForEach-Object { Write-Error $_ }
  throw "Standalone verification failed with $($errors.Count) error(s)."
}
Write-Host "[OK] Standalone verification passed: $fullPath" -ForegroundColor Green
