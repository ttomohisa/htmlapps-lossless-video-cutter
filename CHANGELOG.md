## Unreleased

- Confirm before cutting an unchanged full-video range.
- Add a second mobile Cut button at the bottom of the range editor.

# Changelog

## 1.0.0
- Collapsed the start-position/keyframe details by default and renamed the visible summary to a less technical label.
- Moved the editable save filename beside the result Save action, with automatic output-extension normalization.
- Added confirmation before switching from a finished result to another video, without discarding the current video if the system file picker is cancelled.
- Reset S/E handles, playhead, and filmstrip immediately when a newly selected video replaces the current source.
- Expanded the Document Scanner-style mobile bottom action bar to Video / Range / Cut / Save; Save is enabled only after a successful cut.
- Added an icon to the Share action.
- Simplified the primary action label to **Cut / 切り出す** and removed the empty mobile dock row left behind by the fixed bottom action button.
- Tightened playhead dragging so hover/proximity can never scrub: movement is accepted only during an active primary-button drag, with global pointer-up cleanup.
- Reworked thumbnail extraction around a dedicated hidden probe video with decoded-frame waits and visible loading/failure states.
- Consolidated the desktop editor into one focused column and moved range summary, audio removal, and the primary action into an editor dock below the timeline.

- Refined the editor timeline with a local thumbnail filmstrip and playhead-only scrubbing, so touching the rail no longer jumps the current position.

- Initial Browser Kitty release.
- Added lossless stream-copy cutting for MP4, MOV, MKV, and WebM.
- Uses FFmpeg WASM Builder v1.1.0 `lossless-video-cutter` profile.
- Uses WORKERFS so the selected input `File`/`Blob` is not copied wholesale into MEMFS before processing.
- Added keyframe-aligned start reporting, native preview, dual-handle timeline, manual time entry, optional audio removal, progress/cancel, download/share, Japanese/English UI, and offline single-HTML packaging.
- Refined the timeline with a draggable current-position playhead, larger touch handles, selection duration, and an actual-start K marker after processing.
- Removed the source video's duplicate native seek bar and centralized seeking on the timeline, while keeping a compact play/pause control.
- Added a dedicated keyframe alignment result card showing requested start, actual start, and the exact backward shift.
- Refined the file controls with clearer icons and replaced the ambiguous large-file plus icon with a streaming-file symbol.
- Start/end time fields now initialize from the detected media duration and stay synchronized with timeline handles.
- Moved S/E markers above the handles so they remain visible while dragging, including on mobile.
- Standardized the visible product name as **Lossless Video Cutter** in both Japanese and English UI.
- Added pinned GitHub Release fetching with SHA-256 verification and corresponding-source metadata.
