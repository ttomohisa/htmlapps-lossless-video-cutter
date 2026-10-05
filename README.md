# Lossless Video Cutter

[![GitHub Pages](https://github.com/ttomohisa/htmlapps-lossless-video-cutter/actions/workflows/deploy-pages.yml/badge.svg)](https://github.com/ttomohisa/htmlapps-lossless-video-cutter/actions/workflows/deploy-pages.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Single HTML](https://img.shields.io/badge/distribution-single%20HTML-0ea5e9)](https://ttomohisa.github.io/htmlapps-lossless-video-cutter/)

[日本語版 README](README.ja.md)

A privacy-focused, single-HTML video cutter that trims supported videos **without re-encoding**. The app copies the already-compressed media streams into a new file, so cutting is fast and does not introduce generation loss from another encode.

## 🚀 Live demo

### [Open Lossless Video Cutter on GitHub Pages](https://ttomohisa.github.io/htmlapps-lossless-video-cutter/)

GitHub Pages delivers the initial HTML. After it loads, video preview, thumbnail generation, range selection, FFmpeg processing, saving, and sharing are handled locally on your device. The video you select is not uploaded by the app.

![Lossless Video Cutter with a selected video range on the editing timeline](assets/screenshot.png)

<p align="center"><img src="assets/screenshot-mobile.png" alt="Lossless Video Cutter on a mobile viewport" width="390"></p>

## Features

- Cut video without re-encoding the video or audio streams
- MP4 / M4V / MOV / MKV / WebM container support
- Editor-style timeline with local thumbnail filmstrip
- Independent S / E handles for the cut range
- Draggable white playhead for preview seeking; no duplicate native seek bar
- Direct start/end time entry and “use current position” controls
- Start = 0 and End = video duration are filled automatically when possible
- Optional audio removal without re-encoding the video
- Confirmation before cutting the entire unchanged range
- Confirmation before switching to another video, including Change and dropped files
- Reset range to restore the whole source without changing audio or filename choices
- Locked source/range/audio controls while cutting, with safe Cancel and immediate retry
- Save filename editing beside the result Save action
- Save and Share actions after a successful cut
- Mobile bottom action bar with Video / Range / Cut / Save
- Actual start position shown after processing when keyframe alignment changes it
- Start-position details collapsed by default for a simpler result view
- Japanese / English UI in the same HTML
- Embedded SVG favicon and FFmpeg WASM runtime
- Large inputs use WORKERFS so the whole source file is not copied into MEMFS before processing starts

## Quick start

### Use the web demo

Just [open the demo](https://ttomohisa.github.io/htmlapps-lossless-video-cutter/). No installation or account is required.

### Use the downloadable single HTML

1. Build or download `lossless-video-cutter.html` from this repository.
2. Open it in a current Chromium-based browser. Other modern browsers may also work depending on media/container support.
3. Choose a supported video and start cutting.

The generated HTML contains the FFmpeg JavaScript and WebAssembly assets it needs at runtime.

### Build it for fully offline use (advanced)

1. Download or clone this repository.
2. Double-click `build-standalone.bat` on Windows.
3. The first build downloads the exact FFmpeg WASM Builder release pinned in `dependencies.json`.
4. The release archive is verified against `SHA256SUMS.txt` before its assets are embedded.
5. Copy `dist/index.html` wherever you need it and open that single file later without an internet connection.

Python, Node.js, and a local web server are not required. The build uses Windows PowerShell.

## Usage

1. Choose or drop a supported video.
2. Drag the **S** and **E** handles to choose the range you want to keep.
3. Drag the white playhead to preview another position without changing the selected range.
4. Fine-tune Start / End with the time fields or the current-position buttons when needed.
5. Optionally enable **Remove audio**.
6. Press **Cut**. If the range is still the entire video, the app asks for confirmation first.
7. After the cut finishes, preview the result and open **Start position details** only if you want to inspect any automatic start adjustment.
8. Edit the save filename beside the result actions, then choose **Save** or **Share**.

### Start positions and keyframes

“Lossless” here means the app avoids decoding and re-encoding the compressed media. It does **not** mean every arbitrary frame can become the first frame of the new file.

Inter-frame codecs such as H.264 or HEVC may require the output to begin at an earlier decodable keyframe. For example, a requested start of `00:13.400` may become `00:12.967`. When that happens, the app shows a **K** marker on the timeline and keeps the requested/actual timing details available in a collapsed result section.

### Timeline controls

- **S**: start of the selected range
- **E**: end of the selected range
- **White playhead**: current preview position; it moves only when you actively drag it or use keyboard controls
- **K**: actual start used by the completed cut when keyframe alignment changed the requested start

When the browser can decode the source for preview, the app generates lightweight timeline thumbnails locally. A format can still be cut by manual time entry even when browser preview is unavailable.

### Keyboard controls for the playhead

| Shortcut | Action |
| --- | --- |
| `←` / `→` | Move the playhead by 0.5 seconds |
| `Shift` + `←` / `→` | Move the playhead by 5 seconds |
| `Home` | Jump to the beginning |
| `End` | Jump to the end |
| `I` | Set the range start to the current preview position |
| `O` | Set the range end to the current preview position |

Tab to the white playhead before using `I` / `O`. Marking works only while idle with usable preview metadata. Modifier keys, held-key repeats, and text composition do not mark the range. Invalid or unchanged selections keep the existing downloadable result. The Use current buttons share the same preview checks; manual time entry and Reset range remain available when browser preview is unsupported.

## Publish with GitHub Pages

The repository includes a workflow that builds the fully embedded HTML and deploys it to GitHub Pages automatically.

1. Push the repository to GitHub as `htmlapps-lossless-video-cutter`.
2. Open **Settings → Pages → Build and deployment → Source** and select **GitHub Actions**.
3. Push to `main`, or manually run **Deploy standalone app to GitHub Pages** from the Actions tab.
4. After a successful deployment, the app is available at `https://ttomohisa.github.io/htmlapps-lossless-video-cutter/`.

Each push to `main` rebuilds the standalone HTML from the pinned FFmpeg WASM release, verifies the dependency archive checksum, validates the runtime network boundary, and then publishes `dist/`.

If Pages has not been enabled yet, the workflow still builds and validates the app and writes setup instructions to the Actions summary instead of failing the build.

## Development and build layout

```text
.
├─ src/index.template.html          # Application template
├─ dependencies.json                # Pinned FFmpeg WASM Builder release
├─ app.config.json                  # App metadata and output settings
├─ build-standalone.bat             # Windows build entry point
├─ build-standalone.ps1             # Single-HTML builder
├─ update-ffmpeg.bat                # Pinned FFmpeg WASM update helper
├─ scripts/
│  ├─ check-repository.ps1          # Full repository/build validation
│  ├─ verify-standalone.ps1         # Standalone runtime/network checks
│  ├─ build-self-extract.ps1        # Self-extracting HTML generator
│  └─ update-ffmpeg.ps1             # Release update + rollback logic
├─ dist/
│  ├─ index.html                    # Generated standalone app
│  ├─ index.self-extract.html       # Generated self-extracting variant
│  └─ dependency-manifest.json      # Exact dependency hashes/source links
└─ .github/workflows/
   ├─ build-standalone.yml          # Pull request standalone validation
   ├─ validate.yml                  # Source/build validation
   └─ deploy-pages.yml              # Automatic Pages deployment from main
```

The normal build also copies `dist/index.html` to `lossless-video-cutter.html` at the repository root for Browser Kitty and direct-download distribution.

### Update the FFmpeg WASM core

The app currently pins **FFmpeg WASM Builder v1.1.0** and its dedicated `lossless-video-cutter` profile.

After publishing a compatible Builder release, update with:

```bat
update-ffmpeg.bat 1.2.0
```

The update helper changes the single pinned version in `dependencies.json`, downloads the release, verifies SHA-256, rebuilds the app, and restores the previous version if the build fails.

To discard the local package cache and fetch the currently pinned release again:

```powershell
.\build-standalone.ps1 -ForceDownload
```

## Privacy and runtime network protection

The generated standalone HTML includes:

- A Content Security Policy with `connect-src 'none'`
- No external runtime script, stylesheet, or iframe dependency
- Embedded `ffmpeg.js` and `ffmpeg.wasm`
- SHA-256 provenance for the Builder release archive
- A corresponding-source URL and hash in `dist/dependency-manifest.json`
- WORKERFS-based access to the selected browser `File` / `Blob`

The GitHub Pages version requires the initial HTML request, but the selected video is not transmitted by the app. For use with the network completely disconnected, open the generated `dist/index.html` locally. See [VERIFY_OFFLINE.md](VERIFY_OFFLINE.md) for the offline verification procedure.

## Memory behavior

Input and output have different memory characteristics:

- **Input:** WORKERFS lets FFmpeg read slices of the selected `File` / `Blob` instead of copying the entire input into MEMFS before processing starts.
- **Output:** the completed file is currently created in browser/Emscripten memory before it is returned to the page.

This makes the tool especially suitable for extracting a relatively short section from a large video. Cutting almost the entire contents of a very large source can still use substantial memory because the output itself must fit in browser memory.

## Limitations

- Cutting is stream-copy based, so the actual start can move backward to a decodable keyframe.
- Arbitrary frame-accurate cutting would require re-encoding around the cut point and is intentionally outside this tool's current design.
- Browser preview and thumbnail availability depend on the browser's built-in codec/container support.
- MP4 / M4V / MOV / MKV / WebM are supported by the app profile, but unusual stream/container combinations can still fail to remux.
- Output is created in browser memory, so very large output ranges can exceed the practical memory limit of the device/browser.
- Sharing depends on the browser/OS Web Share capability. When sharing is unavailable, the app falls back to saving the file.

## Dependencies

| Component | Version | License | Purpose |
| --- | ---: | --- | --- |
| FFmpeg WASM Builder | 1.1.0 | MIT for Builder/runtime source | Reproducible compact WASM build and browser runtime |
| Generated FFmpeg core | Builder v1.1.0 `lossless-video-cutter` profile | LGPL-2.1-or-later | Demux, seek, stream copy, and remux |

The generated FFmpeg core intentionally omits x264 and the GPL-only profile used by the separate video compressor. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for details and `dist/dependency-manifest.json` for the exact release/source hashes.

## Contributing

Bug reports and feature proposals are welcome through GitHub Issues.

## License

Copyright © 2026 ttomohisa

The application source in this repository is licensed under the [MIT License](LICENSE).

The generated standalone HTML also embeds the LGPL-2.1-or-later FFmpeg core described above; the MIT license does not relicense that third-party component.

### Regression checks

Use Node.js 24 or newer and PowerShell to run `./scripts/check-repository.ps1`. The check runs deterministic UI lifecycle/range tests against the template and generated standalone HTML, in addition to the source network boundary, verified FFmpeg build, self-extract verification, and root distribution parity checks. To run only the UI tests: `node --test tests/lossless-video-cutter.test.mjs`. These tests simulate Workers and media metadata; real media and browser checks remain complementary.
