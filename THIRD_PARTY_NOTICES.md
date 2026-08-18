# Third-party notices

Lossless Video Cutter's own source code is licensed under the repository's MIT license.

The generated standalone HTML embeds a WebAssembly build of **FFmpeg** produced by **FFmpeg WASM Builder**. The pinned dependency is declared in `dependencies.json`; the generated `dist/dependency-manifest.json` records the exact Builder release archive hash and corresponding-source archive hash/URL.

The `lossless-video-cutter` Builder profile does not enable x264 or other GPL-only FFmpeg components. Its generated FFmpeg core is distributed under **LGPL-2.1-or-later**. The Builder release contains the applicable FFmpeg license text and a corresponding-source archive containing the exact FFmpeg/Emscripten sources and Builder recipe used for that release.

This notice does not replace the license texts shipped with the Builder release. When redistributing a generated standalone HTML, keep this repository information and the corresponding-source link available to recipients.
