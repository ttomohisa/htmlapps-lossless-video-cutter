# Lossless Video Cutter

A privacy-friendly, self-contained video cutter for the browser. Choose a range and cut it **without re-encoding**: FFmpeg copies the compressed video/audio packets into a new file instead of decoding and encoding them again.

- No upload
- No runtime network access
- Single generated HTML file
- MP4 / M4V / MOV / MKV / WebM
- Large inputs use WORKERFS instead of copying the whole source into MEMFS first
- Two-handle S/E range timeline with a draggable current-position playhead; the source video has no duplicate native seek bar
- Source preview keeps only a simple play/pause control; all seeking is centralized on the timeline
- Start/end fields auto-initialize to the full duration and stay synchronized with the handles
- Post-cut K marker plus requested/actual start and alignment delta
- Japanese / English UI

[日本語 README](README.ja.md)

## What makes it different

This is not a lightweight front end around the full FFmpeg CLI. It uses the dedicated `lossless-video-cutter` profile from [ttomohisa/htmlapps-ffmpeg-wasm-builder](https://github.com/ttomohisa/htmlapps-ffmpeg-wasm-builder), pinned to **v1.1.0**.

That profile contains only the FFmpeg pieces needed to demux and remux the supported containers. There is no video/audio decoder, encoder, scale filter, swscale, swresample, or x264 in this core.

The browser passes the selected `File`/`Blob` to a Worker and mounts it through Emscripten WORKERFS. FFmpeg can then seek and read slices from a large input without first calling `file.arrayBuffer()` for the entire source.

## Keyframe-aligned starts

“Lossless” does not mean arbitrary frame-accurate cutting. Inter-frame video such as H.264 or HEVC normally needs a decodable keyframe at the beginning of the output.

If you request `00:13.400`, the actual start may become something like `00:12.967`. After processing, the app places a **K marker** on the timeline and shows the requested start, actual start, and the exact backward shift in the result card. This avoids re-encoding while keeping the output decodable.

## Build

On Windows, double-click:

```text
build-standalone.bat
```

or run:

```powershell
.\build-standalone.ps1
```

The build downloads the pinned FFmpeg WASM Builder GitHub Release, verifies its SHA-256 using `SHA256SUMS.txt`, embeds `ffmpeg.js` and `ffmpeg.wasm`, verifies the standalone output, and creates:

```text
dist/index.html
dist/index.self-extract.html
dist/dependency-manifest.json
lossless-video-cutter.html
```

The browser does **not** download FFmpeg at runtime. The network is only used by the repository build step.

## Update the FFmpeg WASM core

After publishing a compatible Builder release:

```text
update-ffmpeg.bat 1.2.0
```

The script updates the single pinned version in `dependencies.json`, downloads and verifies the new release, rebuilds the app, and restores the old pin if the build fails.

## Repository validation

```powershell
.\scripts\check-repository.ps1
```

The validation checks the runtime network boundary, WORKERFS contract, keyframe reporting, pinned release metadata, standalone build, SHA-256 provenance, and root distribution HTML.

## Memory behavior

Input and output behave differently:

- **Input:** WORKERFS reads the browser `File`/`Blob` in slices. A 1 GB source does not need to be copied wholesale into MEMFS before FFmpeg starts.
- **Output:** the current core still writes the result into Emscripten memory before the browser receives it. Cutting 30 seconds from a 1 GB source is therefore much friendlier than copying almost the entire 1 GB source into a new output.

## Offline verification

See [VERIFY_OFFLINE.md](VERIFY_OFFLINE.md).

## Licenses

The application source in this repository is MIT licensed.

The generated standalone HTML embeds the FFmpeg WASM core from the Builder's non-GPL lossless cutter profile. That generated FFmpeg core is distributed under **LGPL-2.1-or-later**. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) and the corresponding-source URL recorded in each generated `dist/dependency-manifest.json`.


### Timeline interaction

Use the S / E handles for the cut range. Move playback only by actively dragging the narrow white playhead; hover/proximity and timeline-background movement never seek. When the browser can decode the preview, lightweight thumbnails are generated locally for the timeline filmstrip.


### Mobile workflow

After a cut completes, the save filename can be edited beside the Save action. On phones, the bottom action bar provides Video / Range / Cut / Save controls; Save becomes enabled only after a successful cut. Choosing another video asks for confirmation first.
