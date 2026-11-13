// Browser-level regression for the *actual embedded* FFmpeg WASM runtime.
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {pathToFileURL} = require('node:url');
const {chromium} = require('playwright');

async function runCase(browser, language, width, height) {
  const context = await browser.newContext({
    viewport: {width, height}, locale: language, acceptDownloads: true,
    reducedMotion: 'reduce'
  });
  const page = await context.newPage();
  const errors = [], externalRequests = [];
  const label = language + '-' + width + 'x' + height;
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => {
    if (/^https?:/i.test(request.url())) externalRequests.push(request.url());
  });
  try {
    await page.goto(pathToFileURL(path.resolve(__dirname, '../dist/index.html')).href);
    if ((await page.locator('html').getAttribute('lang')) !== language)
      await page.locator('#languageButton').click();
    assert.equal(await page.locator('html').getAttribute('lang'), language);
    assert.match(await page.locator('#ffmpegVersionText').textContent(), /v1\.10\.8\b/);
    assert.ok(await page.locator('#ffmpegSourceLink').getAttribute('href')
      .then(href => href.includes('/releases/download/v1.10.8/')));

    await page.locator('#fileInput').setInputFiles(
      path.resolve(__dirname, '../assets/lossless-video-cutter-en.mp4')
    );
    await page.locator('#filePanel.is-visible').waitFor({timeout: 15000});
    // The source is synthetic and ships with the repository. Run a bounded
    // cut to exercise file selection, WORKERFS, true WASM execution and export.
    await page.locator('#endInput').fill('0:01.200');
    await page.locator('#endInput').press('Tab');
    await page.locator(width <= 640 ? '#mobileInlineCutButton' : '#cutButton').click();
    if (await page.locator('#fullRangeDialog').isVisible())
      await page.locator('#fullRangeConfirm').click();
    await page.locator('#resultCard.is-visible').waitFor({timeout: 100000});
    assert.notEqual((await page.locator('#resultSize').textContent()).trim(), '—', label);
    assert.notEqual((await page.locator('#resultDuration').textContent()).trim(), '—', label);
    assert.ok((await page.locator('#resultPreview').getAttribute('src')).startsWith('blob:'));
    assert.equal(await page.locator('#mobileSaveButton').isDisabled(), false);
    const downloadPromise = page.waitForEvent('download', {timeout: 20000});
    await page.locator('#downloadButton').click();
    const download = await downloadPromise;
    const local = await download.path();
    assert.ok(local && fs.statSync(local).size > 1024, label + ': download is empty');
    const bytes = fs.readFileSync(local);
    assert.equal(bytes.subarray(4, 8).toString('ascii'), 'ftyp', label + ': invalid MP4 header');
    assert.ok(bytes.includes(Buffer.from('moov')), label + ': missing movie header');
    assert.ok(bytes.includes(Buffer.from('mdat')), label + ': missing media data');
    // After a completed export, changing the audio option must discard the
    // stale result; a second real WASM invocation must produce a silent MP4.
    if (width > 640) {
      await page.locator('#removeAudio').check();
      assert.equal(await page.locator('#resultCard.is-visible').count(), 0,
        label + ': old download must be invalidated after changing audio option');
      await page.locator('#cutButton').click();
      await page.locator('#resultCard.is-visible').waitFor({timeout: 100000});
      assert.equal(await page.locator('#removeAudio').isChecked(), true);
      const silentPromise = page.waitForEvent('download', {timeout: 20000});
      await page.locator('#downloadButton').click();
      const silent = await silentPromise;
      const silentBytes = fs.readFileSync(await silent.path());
      assert.ok(silentBytes.length > 1024 && silentBytes.includes(Buffer.from('avc1')),
        label + ': video missing from silent output');
      assert.equal(silentBytes.includes(Buffer.from('mp4a')), false,
        label + ': --no-audio output contains AAC tracks');
      console.log('PASS app-WASM no-audio ' + label + ' downloaded=' + silentBytes.length);
    }
    assert.deepEqual(errors, [], label + ': script errors');
    assert.deepEqual(externalRequests, [], label + ': unexpected network request');
    console.log('PASS app-WASM ' + label + ' downloaded=' + bytes.length);
  } catch (error) {
    const evidence = path.resolve('test-results/mobile-label');
    fs.mkdirSync(evidence, {recursive: true});
    await page.screenshot({path: path.join(evidence, 'cutter-e2e-failure-' + label + '.png')})
      .catch(() => {});
    throw error;
  } finally {
    await context.close();
  }
}

// A damaged but correctly named media file must not leave the app locked or
// corrupt its next selection. The source is constructed locally, not uploaded.
async function runErrorRecovery(browser) {
  const context = await browser.newContext({
    viewport: {width: 1360, height: 900}, locale: 'ja', reducedMotion: 'reduce'
  });
  const page = await context.newPage();
  const uncaught = [];
  page.on('pageerror', error => uncaught.push(error.message));
  try {
    await page.goto(pathToFileURL(path.resolve(__dirname, '../dist/index.html')).href);
    await page.locator('#fileInput').setInputFiles({
      name: 'damaged.mp4', mimeType: 'video/mp4',
      buffer: Buffer.from('not an MP4 video file')
    });
    await page.locator('#filePanel.is-visible').waitFor({timeout: 12000});
    await page.locator('#endInput').fill('0:00.500');
    await page.locator('#endInput').press('Tab');
    await page.locator('#cutButton').click();
    await page.waitForFunction(() =>
      !document.body.classList.contains('is-processing') &&
      !!document.querySelector('.toast.error'), {timeout: 45000});
    assert.equal(await page.locator('#resultCard.is-visible').count(), 0);
    assert.equal(await page.locator('#cutButton').isEnabled(), true,
      'cut control remains usable after a failed export');
    await page.locator('#clearFileButton').click();
    assert.equal(await page.locator('#dropZone').isVisible(), true,
      'clearing a bad file restores the picker');
    await page.locator('#fileInput').setInputFiles(
      path.resolve(__dirname, '../assets/lossless-video-cutter-en.mp4')
    );
    await page.locator('#filePanel.is-visible').waitFor({timeout: 12000});
    await page.locator('#endInput').fill('0:01.200');
    await page.locator('#endInput').press('Tab');
    await page.locator('#cutButton').click();
    await page.locator('#resultCard.is-visible').waitFor({timeout: 100000});
    assert.deepEqual(uncaught, [], 'failed cutter must not cause uncaught errors');
    console.log('PASS app-WASM corrupt-input recovery');
  } finally {
    await context.close();
  }
}

async function main() {
  const browser = await chromium.launch();
  try {
    await runCase(browser, 'ja', 1360, 900);
    await runCase(browser, 'en', 390, 844);
    await runErrorRecovery(browser);
  } finally {
    await browser.close();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
