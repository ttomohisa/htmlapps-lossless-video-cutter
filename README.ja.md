# Lossless Video Cutter

動画をアップロードせず、ブラウザ内だけで必要な範囲を**再エンコードなし**で切り出す単一HTMLアプリです。FFmpegで映像・音声をデコード→再圧縮するのではなく、圧縮済みのストリームをそのまま新しいファイルへコピーします。

- アップロードなし
- 実行時のネットワーク通信なし
- 生成物は単一HTML
- MP4 / M4V / MOV / MKV / WebM対応
- 大きな入力はWORKERFSで扱い、最初に全体をMEMFSへコピーしない
- S / Eの2ハンドルで範囲を決め、現在位置の縦線をタイムライン上でドラッグしてプレビュー（動画側の重複シークバーは非表示）
- 動画プレビューは再生 / 一時停止だけの簡易操作にし、シーク操作をタイムラインへ集約
- 動画読込時に開始=0秒 / 終了=動画末尾を自動入力し、ハンドル操作と時刻欄を同期
- 処理後にKマーカー・実開始時刻・指定との差を表示
- 日本語 / English切替

## このツールの特徴

通常の巨大なFFmpeg CLIをそのままWASM化したものではありません。[ttomohisa/htmlapps-ffmpeg-wasm-builder](https://github.com/ttomohisa/htmlapps-ffmpeg-wasm-builder) の **v1.1.0 `lossless-video-cutter` profile** を固定して使用します。

このprofileには、対応コンテナのdemux / muxとストリームコピーに必要なFFmpeg機能だけを入れています。動画・音声decoder、encoder、scale、swscale、swresample、x264は入りません。

さらに、選択したブラウザの `File` / `Blob` はWorkerへ渡し、Emscripten WORKERFSへread-onlyでmountします。1GB級の入力でも、処理開始前に `file.arrayBuffer()` でファイル全体を複製しません。

## 「無劣化」と開始位置

再エンコードしないため、画質・音質の再圧縮劣化はありません。ただし、H.264 / HEVCなどのフレーム間圧縮動画は任意フレームからそのまま開始できないことがあります。

たとえば `00:13.400` を指定しても、実際の開始位置が直前のキーフレーム `00:12.967` になる場合があります。処理完了後は、タイムラインへ **Kマーカー** を表示し、結果カードで **指定開始 / 実際の開始 / 何秒前へ移動したか** を並べて確認できます。

つまりこのツールは「再エンコードなしの無劣化カット」であり、「任意フレームに完全一致するフレーム精度カット」ではありません。

## ビルド

Windowsでは `build-standalone.bat` をダブルクリックするか、PowerShellで次を実行します。

```powershell
.\build-standalone.ps1
```

ビルド時に、固定したFFmpeg WASM BuilderのGitHub Releaseを取得し、`SHA256SUMS.txt` でSHA-256を検証してから `ffmpeg.js` / `ffmpeg.wasm` をHTMLへ内包します。

生成物:

```text
dist/index.html
dist/index.self-extract.html
dist/dependency-manifest.json
lossless-video-cutter.html
```

エンドユーザーがHTMLを開いた時にはGitHubへアクセスしません。ネットワークを使うのはリポジトリのビルド時だけです。

## FFmpeg WASMの更新

互換性のあるBuilder Releaseを公開したら、たとえば次だけで更新できます。

```text
update-ffmpeg.bat 1.2.0
```

`dependencies.json` の固定バージョンを更新 → Release取得 → SHA-256検証 → 再ビルドまで実行します。失敗した場合は以前のバージョンへ戻します。

## リポジトリ全体の検証

```powershell
.\scripts\check-repository.ps1
```

実行時通信の混入、WORKERFSの利用、キーフレーム開始位置の表示、Release固定、SHA-256記録、単一HTML生成などを確認します。

## 大きな動画とメモリ

入力と出力で挙動が違います。

- **入力:** WORKERFSで必要なsliceを読み込むため、1GBの入力全体を最初にMEMFSへコピーしません。
- **出力:** 現在はEmscriptenのメモリ上に完成ファイルを作ってからブラウザへ返します。そのため、1GB動画から30秒だけ切る用途には非常に相性がよい一方、1GBのほぼ全編を切り出す場合は出力側のメモリ消費が大きくなります。

オフライン確認方法は [VERIFY_OFFLINE.md](VERIFY_OFFLINE.md) を参照してください。

## ライセンス

このリポジトリ自身のソースコードはMIT Licenseです。

生成HTMLへ内包するLossless Video Cutter用FFmpeg WASM coreは、Builderの非GPL profileから生成され、**LGPL-2.1-or-later**で配布されます。詳細は [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) と、生成される `dist/dependency-manifest.json` の対応ソースURLを参照してください。


### タイムライン操作

開始・終了は S / E ハンドルで指定します。再生位置は白い現在位置ラインを直接つかんで移動します。タイムラインの背景をタップしただけでは再生位置は移動しません。対応ブラウザでは、選択した動画から小さなサムネイルをローカル生成してタイムラインに表示します。


### 操作性

切り出し後、保存ボタンの近くで保存ファイル名を変更できます。スマホでは「動画 / 範囲 / 切り出す / 保存」の下部操作バーを表示し、保存は切り出し完了後に有効になります。別の動画へ切り替える前には確認を表示します。
