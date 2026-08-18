# Architecture

```text
Repository build time
  dependencies.json (Builder v1.1.0 pinned)
       ↓
  GitHub Release + SHA256SUMS.txt
       ↓ verify
  ffmpeg.js + ffmpeg.wasm
       ↓ embed
  lossless-video-cutter.html

Browser runtime
  selected File / Blob
       ↓ structured clone
  Blob Worker
       ↓ WORKERFS mount (read-only, slice-backed)
  FFmpeg 9 public-libav lossless cutter
       ↓ stream copy
  MEMFS output
       ↓ Uint8Array / Blob
  preview + save/share
```

The Worker source is composed from the embedded Emscripten-generated `ffmpeg.js` and the app's small WORKERFS runner wrapper. `ffmpeg.wasm` bytes are transferred directly to the Worker and instantiated from bytes, so `file://` execution does not depend on resolving a separate Wasm URL.

The input file is not transferred as an ArrayBuffer. Browser `File` / `Blob` structured cloning preserves a Blob-backed object in the Worker, and WORKERFS reads slices synchronously when FFmpeg seeks/reads.

The output remains MEMFS-backed in v1.0.0.
