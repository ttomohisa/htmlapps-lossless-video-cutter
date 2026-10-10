# Dialog scrolling audit

Version: 1.0.4. Baseline: 1.0.3 at c3c94b4836986f1241d25515edf765ae45ea34b9.

## Reproduced issue and change

In headed cloud Chromium at 1180×757 CSS pixels, an outside-Help-backdrop wheel moved the underlying page from Y 0 to 600 while Help remained open. At 320×252 CSS pixels (300% desktop zoom), the full-range confirmation similarly allowed Y 329→569 page movement.

The fix locks both scrolling roots with a modal-only CSS selector. It applies automatically to Help and both native confirmations, and releases when no native modal remains. Existing native dialog handlers, focus management, bounded Help shell and sticky close header are preserved. The local-processing badge uses the shared decorative shield; canonical app artwork and embedded engine bytes are unchanged.

## Verification so far

- Existing Help header/final source/version content remained reachable on baseline desktop 1180×757, short 1180×300 and narrow 320×252; no shell rewrite was necessary.
- Baseline Help forward/reverse Tab cycle remained in Close/source link or browser chrome, without background app focus.
- New scroll-lock and badge assertions failed before the change; the existing sticky-shell assertion passed. All 3 pass after the change across source, root, readable and restored self-extract variants.
- Full Node aggregate 180/180 passes for source, root, readable and restored self-extract targets; generated header checks 6/6 pass.
- Reconstruction proved old source/root parity, retained verified official dependency bytes, and verified exact self-extract restoration. Official Windows CI remains required; local PowerShell is unavailable.
- An actual baseline mobile Save exported the edited MP4 filename for a 2.3→5.7-second request, reported actual start 2.0 seconds. The saved H264/AAC bytes fully decode and every output packet is an unchanged contiguous source subsequence. Keyframe-aligned cuts are not frame-accurate.

Exact-head official CI/artifacts and final native regression results will be recorded in the PR before Ready. Remaining baseline and final checklist items are not presumed passed.

## Limits

Desktop zoom is not a physical phone test. Physical Android/iOS touch, software keyboard, rotation, Safari/Firefox and direct file:// opening were not tested in this environment. No dependency update or runtime network access was introduced.
