# AGENTS.md

## Product

This repository builds **Lossless Video Cutter**, a privacy-friendly Browser Kitty single-HTML application.

## Non-negotiable behavior

- Runtime is fully offline. Never add runtime `fetch`, XHR, WebSocket, EventSource, external scripts, external stylesheets, analytics, telemetry, fonts, or CDNs.
- Keep the app as one generated HTML file with all required FFmpeg assets embedded.
- Input video must use WORKERFS. Do not replace it with `file.arrayBuffer()` or a MEMFS copy of the full input.
- Do not add decoders/encoders/filters to the app. This product is specifically a stream-copy cutter.
- Never call the cut frame-accurate. The requested start is aligned backward to a decodable keyframe.
- Keep output in the source container family: MP4/M4V→MP4, MOV→MOV, MKV→MKV, WebM→WebM.
- Keep Japanese and English UI strings in sync.
- Keep the no-audio option optional; default is to preserve audio.
- Preserve cancel behavior by terminating the active Worker.

## FFmpeg dependency

`dependencies.json` pins a released `ttomohisa/htmlapps-ffmpeg-wasm-builder` version. Build-time scripts download the exact release package and `SHA256SUMS.txt`, verify the archive, and record the corresponding-source URL/hash.

Do not point the browser runtime at GitHub. Updating FFmpeg is a repository build/update action, not an end-user network action.

## Validation

Before release, run:

```powershell
.\scripts\check-repository.ps1
```

This performs the source network-boundary check, builds the single HTML, verifies the generated output, and confirms the root distribution file matches `dist/index.html`.
