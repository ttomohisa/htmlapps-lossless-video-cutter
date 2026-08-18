# Offline verification

1. Run `build-standalone.bat` while online once so the pinned Builder release can be downloaded and embedded.
2. Disconnect the machine from the network.
3. Open `lossless-video-cutter.html` directly with `file://` or open `dist/index.html`.
4. Select an MP4/MOV/MKV/WebM file, choose a range, and run the cut.
5. Confirm the result can be saved without reconnecting.

The generated HTML must contain a CSP with `connect-src 'none'` and no external script/style dependencies.

For a browser check, DevTools → Network should show no network requests from the app itself. Blob URLs used for the preview and Worker are local browser objects, not uploads.
