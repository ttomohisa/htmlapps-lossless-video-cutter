const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { gunzipSync } = require('node:zlib');

const rejected = [
  "入力はWORKERFSで必要な部分だけ読み込みます。出力はブラウザメモリ上に作るため、長い範囲ほどメモリを使います。",
  "WORKERFS reads only the needed input slices. The output is created in browser memory, so longer ranges use more memory.",
  "入力はWORKERFSでFile/Blobを必要な範囲だけ読みます。1GB級でも入力全体を先にMEMFSへコピーしません。ただし出力ファイルはブラウザメモリに作るため、ほぼ全編を切り出す場合はメモリを多く使います。",
  "WORKERFS reads the selected File/Blob in slices instead of copying the whole input into MEMFS first. The output is still built in browser memory, so cutting almost the whole file can use substantial memory.",
  "処理はこのHTML内で完結し、実行時のネットワーク通信はCSPで禁止しています。FFmpeg WASMはビルド時に固定ReleaseからSHA-256を検証して内包します。",
  "Processing stays inside this HTML and runtime network access is blocked by CSP. The pinned FFmpeg WASM release is SHA-256 verified and embedded at build time."
];

test('help contains user guidance rather than implementation or layout audit prose', () => {
  const root = path.join(__dirname, '..');
  const files = ['src/index.template.html', 'dist/index.html', 'dist/index.self-extract.html',
    ...fs.readdirSync(root).filter(name => name.endsWith('.html'))];
  for (const file of files) {
    const filename = path.join(root, file);
    if (!fs.existsSync(filename)) continue;
    let html = fs.readFileSync(filename, 'utf8');
    const payload = html.match(/<script id="self-extract-payload"[^>]*>([\s\S]*?)<\/script>/);
    if (payload) html = gunzipSync(Buffer.from(payload[1].replace(/\s/g, ''), 'base64')).toString('utf8');
    for (const copy of rejected) assert.ok(!html.includes(copy), `${file}: remove internal-facing help copy: ${copy}`);
  }
});
