# Security

## Runtime privacy boundary

The generated application is designed to process media entirely in the browser. Its CSP blocks runtime network connections with `connect-src 'none'`, and the source checker rejects unexpected network APIs/URLs from executable source.

Selected videos are not uploaded by this app. The FFmpeg core is embedded into the generated HTML at build time.

## Build-time dependency download

The repository build downloads the pinned FFmpeg WASM Builder GitHub Release package and `SHA256SUMS.txt`, verifies the package SHA-256, and records the exact release and corresponding-source hashes in `dist/dependency-manifest.json`.

## Large files

WORKERFS avoids an up-front full input copy, but the output is currently written in Emscripten memory. A large selected range can therefore still exhaust browser memory. This is a resource limit rather than a network/privacy issue.

## Reporting

Please use GitHub's private vulnerability reporting feature when available. Do not include private media files in public reports.
