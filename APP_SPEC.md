# APP_SPEC — Lossless Video Cutter

## Goal

Provide a Browser Kitty single-HTML tool that cuts a video locally without decoding or re-encoding it. The output keeps the compressed video/audio packets unchanged and therefore avoids generation loss.

## Supported containers

- MP4 / M4V input → MP4 output
- MOV input → MOV output
- MKV input → MKV output
- WebM input → WebM output

The app intentionally keeps the source container instead of acting as a general container converter.

## Core behavior

The app embeds the `lossless-video-cutter` profile from `ttomohisa/htmlapps-ffmpeg-wasm-builder` v1.1.0. The runner uses FFmpeg/libavformat stream copy. It does not decode, encode, scale, resample, or filter media.

The selected browser `File` is mounted read-only through Emscripten WORKERFS. This avoids first copying the whole input into MEMFS. The output is still written to MEMFS, so very large output ranges can still require substantial browser memory.

## Keyframe rule

Inter-frame video cannot always start cleanly at an arbitrary requested timestamp. The runner aligns the actual start to the nearest decodable video keyframe at or before the requested start and reports both values. The UI must never imply frame-accurate arbitrary cutting. Before processing it explains the keyframe behavior; after processing it visualizes the actual start with a K marker and a precise alignment delta.

## UX

1. Select or drop a supported video.
2. Preview it when the browser supports the source codec/container.
3. Set start/end with the S/E handles, scrub the current-position marker anywhere on the timeline, use manual time fields, or use the preview's current position. The source video intentionally has no native seek bar.
4. Choose whether to keep audio.
5. Run the lossless cut.
6. Show a K marker on the source timeline plus requested start, actual keyframe-aligned start, backward alignment delta, selected duration, output size, and result preview.
7. Download or share the result.

If browser metadata cannot be read, manual time entry remains available and an empty end value means "to the end of the file".

## Privacy and network boundary

The generated app has no runtime network access. CSP requires `connect-src 'none'`. FFmpeg JavaScript and WebAssembly are embedded during the repository build, not downloaded by the end user's browser.

## Licensing

The application source is MIT. The generated standalone HTML includes an FFmpeg WebAssembly core from the Builder's non-GPL lossless cutter profile, distributed under LGPL-2.1-or-later. The build manifest records the exact Builder release and corresponding-source archive.


## Timeline interaction

- The S/E handles define the cut range.
- Seeking is playhead-only: background taps/drags do not move playback.
- A lightweight local thumbnail filmstrip may be generated from the selected source for editor-like context.


## UI refinements

- The save filename is editable beside the result Save action after cutting, with the extension normalized to the selected output container.
- Choosing another video from the result asks for confirmation first. Cancelling the system file picker keeps the current video intact.
- Replacing the source resets the S/E handles, playhead, filmstrip, and keyframe marker before metadata for the new source is applied.
- On phones, use a fixed bottom action bar modeled on Browser Kitty's Document Scanner: Video / Range / Cut / Save. Save stays disabled until a cut succeeds.
- Save, Share, and source-change actions use icons as well as text where space allows.
