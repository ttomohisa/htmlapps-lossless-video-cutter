import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

// Execute the real, offline application script. Only browser boundaries (DOM,
// Worker and object URLs) are simulated; no production test hooks are required.
const html = fs.readFileSync(process.env.LVC_TEST_TEMPLATE || new URL('../src/index.template.html', import.meta.url), 'utf8');
const fileA = new File(['synthetic input A'], 'fixture-A.mp4', {type: 'video/mp4'});
const fileB = new File(['synthetic input B'], 'fixture-B.webm', {type: 'video/webm'});
const tick = () => new Promise(resolve => setImmediate(resolve));

function harness({language = 'en', failure = {}} = {}) {
  const workers = [], revoked = [], urls = [], timers = new Map(), errors = [];
  let nextTimer = 0, document;
  class Classes {
    values = new Set();
    add(...values) { values.forEach(value => this.values.add(value)); }
    remove(...values) { values.forEach(value => this.values.delete(value)); }
    contains(value) { return this.values.has(value); }
    toggle(value, force = !this.contains(value)) { force ? this.add(value) : this.remove(value); return force; }
  }
  class Element {
    constructor(id = '', tagName = 'div') {
      Object.assign(this, {id, tagName: tagName.toUpperCase(), value: '', checked: false, disabled: false,
        style: {}, dataset: {}, classList: new Classes(), listeners: {}, attributes: {}, children: [],
        currentTime: 0, duration: NaN, paused: true, ended: false, hidden: false, open: false,
        textContent: '', src: '', files: [], clickCount: 0, readyState: 0});
    }
    addEventListener(type, fn, options = {}) { (this.listeners[type] ??= []).push({fn, once: !!options.once}); }
    removeEventListener(type, fn) { this.listeners[type] = (this.listeners[type] || []).filter(item => item.fn !== fn); }
    dispatch(type, properties = {}) {
      const event = {type, target: this, currentTarget: this, defaultPrevented: false,
        preventDefault() { this.defaultPrevented = true; }, stopPropagation() {}, ...properties};
      for (const item of [...this.listeners[type] || []]) {
        if (item.once) this.removeEventListener(type, item.fn);
        item.fn(event);
      }
      return event;
    }
    setAttribute(name, value) { this.attributes[name] = String(value); }
    getAttribute(name) { return this.attributes[name] ?? null; }
    removeAttribute(name) { delete this.attributes[name]; if (name === 'src') this.src = ''; }
    load() {}
    pause() { this.paused = true; }
    play() { this.paused = false; return Promise.resolve(); }
    scrollIntoView() {}
    focus() { document.activeElement = this; }
    click() { if (this.disabled) return; this.clickCount++; this.dispatch('click'); }
    remove() {}
    showModal() { this.open = true; }
    close() { this.open = false; this.dispatch('close'); }
    append(...children) { this.children.push(...children); }
    replaceChildren(...children) { this.children = children; }
    querySelector(selector) { return selector === 'img' ? this.children.find(child => child.tagName === 'IMG') ?? null : null; }
    get childElementCount() { return this.children.length; }
    getBoundingClientRect() { return {left: 0, top: 0, width: 800}; }
    getContext() { return null; } // Filmstrip painting is outside lifecycle coverage.
  }
  const elements = {};
  const translated = [];
  for (const match of html.matchAll(/<([a-z][a-z0-9-]*)\b([^>]*?)>/gi)) {
    const [, tag, attributes] = match;
    const id = attributes.match(/\bid="([^"]+)"/)?.[1];
    const key = attributes.match(/\bdata-i18n="([^"]+)"/)?.[1];
    if (!id && !key) continue;
    const element = new Element(id, tag);
    element.disabled = /(?:^|\s)disabled(?:\s|$|=)/.test(attributes);
    element.hidden = /(?:^|\s)hidden(?:\s|$|=)/.test(attributes);
    element.value = attributes.match(/\bvalue="([^"]*)"/)?.[1] ?? '';
    for (const value of (attributes.match(/\bclass="([^"]*)"/)?.[1] ?? '').split(/\s+/).filter(Boolean)) element.classList.add(value);
    if (key) { element.dataset.i18n = key; translated.push(element); }
    if (id) elements[id] = element;
  }
  document = {body: new Element('body'), documentElement: {}, activeElement: null, title: '',
    getElementById: id => elements[id] ?? null,
    querySelectorAll: selector => selector === '[data-i18n]' ? translated : [],
    createElement: tag => new Element('', tag)};
  class Worker {
    constructor(url) {
      if (failure.constructor > 0) { failure.constructor--; throw new Error('Synthetic Worker constructor failure'); }
      this.url = url; this.terminateCount = 0; this.terminated = false; workers.push(this);
    }
    terminate() { this.terminated = true; this.terminateCount++; }
    postMessage(message) {
      this.message = message; this.payload = message.payload;
      if (failure.postMessage > 0) { failure.postMessage--; throw new Error('Synthetic postMessage failure'); }
    }
    emit(event, values = {}) { this.onmessage?.({data: {id: this.message?.id ?? 1, event, ...values}}); }
    crash() { this.onerror?.({error: new Error('Synthetic Worker crash'), message: 'Synthetic Worker crash'}); }
    queuedCallbacks() {
      const message = this.onmessage, error = this.onerror, id = this.message?.id ?? 1;
      return {
        emit: (event, values = {}) => message?.({data: {id, event, ...values}}),
        crash: () => error?.({error: new Error('Late Worker crash'), message: 'Late Worker crash'}),
      };
    }
  }
  const window = new Element('window');
  window.scrollTo = () => {};
  const context = {document, window, navigator: {language}, Worker, Blob, File, Uint8Array, TextDecoder,
    atob, performance, innerWidth: 1440, innerHeight: 900, matchMedia: () => ({matches: false}),
    localStorage: {getItem: () => null, setItem() {}},
    URL: {createObjectURL(blob) { const url = `blob:synthetic-${urls.length}`; urls.push({url, blob}); return url; }, revokeObjectURL(url) { revoked.push(url); }},
    console: {error: error => errors.push(error), log() {}, warn() {}},
    setTimeout(fn, delay = 0) { const id = ++nextTimer; timers.set(id, {fn, delay}); return id; },
    clearTimeout: id => timers.delete(id), requestAnimationFrame: () => ++nextTimer, cancelAnimationFrame() {}};
  let script = html.match(/<script>\s*([\s\S]*?)<\/script>/)?.[1];
  assert.ok(script, 'application inline script exists');
  script = script.replace('__APP_CONFIG_JSON__', '{}').replace('__BUILD_MANIFEST_JSON__', '{}')
    .replace('__EMBEDDED_ASSET_BUNDLE_JSON__', JSON.stringify({dependencies: {'ffmpeg-wasm-builder': {assets: {'core-js': {base64: ''}, 'core-wasm': {base64: ''}}}}}));
  assert.match(script, /\}\)\(\);\s*$/, 'test instrumentation belongs only inside the final closure');
  script = script.replace(/\}\)\(\);\s*$/, 'window.testApi={cut,cancel,selectFile,clearFile,setInitialRange,validateRange,normalizeOutputFilename,parseTime,isFullRange};})();');
  vm.runInNewContext(script, context, {filename: 'lossless-video-cutter.template.js'});
  return {...window.testApi, els: elements, document, workers, revoked, urls, errors, failure,
    runChooserTimers() { for (const [id, timer] of [...timers]) if (timer.delay <= 200) { timers.delete(id); timer.fn(); } }};
}
function edit(h, id, value, type = 'change') { h.els[id].value = String(value); h.els[id].dispatch(type); }
function range(h) { return [h.parseTime(h.els.startInput.value), h.parseTime(h.els.endInput.value)]; }
function ready(options) {
  const h = harness(options); h.selectFile(fileA); h.setInitialRange(12); h.els.sourcePreview.duration = 12;
  edit(h, 'startInput', 2); edit(h, 'endInput', 8); return h;
}
function visible(h, id) { return h.els[id].classList.contains('is-visible'); }
function begin(h) { const promise = h.cut(); let settled = false; promise.then(() => { settled = true; }, () => { settled = true; }); return {promise, get settled() { return settled; }, worker: h.workers.at(-1)}; }
async function complete(h) { const job = begin(h); job.worker.emit('done', {data: new Uint8Array([1, 2, 3]).buffer}); await tick(); assert.equal(job.settled, true); assert.equal(visible(h, 'resultCard'), true); return h; }
function outputSnapshot(h) { return {url: h.els.resultPreview.src, name: h.els.resultName.textContent, duration: h.els.resultDuration.textContent, source: h.els.fileName.textContent, range: range(h)}; }
function assertOutputPreserved(h, before) { assert.deepEqual(outputSnapshot(h), before); assert.equal(visible(h, 'resultCard'), true); assert.equal(h.els.mobileSaveButton.disabled, false); assert.equal(h.revoked.includes(before.url), false); }
function assertIdle(h) { assert.equal(h.document.body.classList.contains('is-processing'), false); assert.equal(visible(h, 'progressCard'), false); assert.equal(h.els.cutButton.disabled, false); }

// Removing any job-ownership check makes these assertions fail: cancellation
// must settle, and old callbacks/finally cannot release or overwrite a new job.
test('Cancel settles the interrupted cut and releases its Worker URL exactly once', async () => {
  const h = ready(), job = begin(h); h.cancel(); await tick();
  assert.equal(job.settled, true, 'cancelled cut promise must settle');
  assertIdle(h); assert.equal(job.worker.terminateCount, 1);
  assert.equal(h.revoked.filter(url => url === job.worker.url).length, 1);
  assert.equal(visible(h, 'resultCard'), false);
});
test('Cancel followed by synchronous retry is safe before old finally runs', async () => {
  const h = ready(), old = begin(h); h.cancel(); const next = begin(h); await tick();
  assert.equal(old.settled, true, 'old promise must settle');
  assert.equal(next.worker.terminated, false, 'old finally must not terminate next Worker');
  assert.equal(h.revoked.includes(next.worker.url), false);
  assert.equal(h.document.body.classList.contains('is-processing'), true);
  assert.equal(h.els.cutButton.disabled, true);
  next.worker.emit('done', {data: new Uint8Array([7]).buffer}); await tick();
  assert.equal(next.settled, true); assert.equal(visible(h, 'resultCard'), true); assertIdle(h);
});
for (const event of ['done', 'error', 'log', 'progress', 'onerror']) {
  test(`queued old ${event} after Cancel cannot affect a synchronous retry`, async () => {
    const h = ready(), old = begin(h), queued = old.worker.queuedCallbacks(); h.cancel(); const next = begin(h);
    const before = {detail: h.els.progressDetail.textContent, percent: h.els.progressPercent.textContent, toasts: h.els.toastRegion.childElementCount};
    if (event === 'onerror') queued.crash();
    else queued.emit(event, {data: new Uint8Array([9]).buffer, error: 'stale error', ratio: .99,
      message: 'lossless-cut: requested-start=2 actual-start=1 keyframe-aligned=yes'});
    await tick();
    assert.equal(next.worker.terminated, false, 'stale callbacks cannot terminate current Worker');
    assert.equal(h.revoked.includes(next.worker.url), false);
    assert.equal(visible(h, 'resultCard'), false, 'stale output cannot be published');
    assert.equal(h.els.progressDetail.textContent, before.detail);
    assert.equal(h.els.progressPercent.textContent, before.percent);
    assert.equal(h.els.toastRegion.childElementCount, before.toasts);
    assert.equal(h.els.keyframeMarker.hidden, true);
    next.worker.emit('done', {data: new Uint8Array([7]).buffer}); await tick();
    assert.equal(next.settled, true); assert.equal(visible(h, 'resultCard'), true);
  });
}
for (const failureKind of ['constructor', 'postMessage', 'onerror', 'message-error']) {
  test(`${failureKind} failure clears running UI, releases owned resources, and allows retry`, async () => {
    const failure = {}; if (['constructor', 'postMessage'].includes(failureKind)) failure[failureKind] = 1;
    const h = ready({failure}), job = begin(h);
    if (failureKind === 'onerror') job.worker.crash();
    if (failureKind === 'message-error') job.worker.emit('error', {error: 'Synthetic corrupt media'});
    await tick(); assert.equal(job.settled, true); assertIdle(h);
    assert.equal(visible(h, 'resultCard'), false);
    for (const {url, blob} of h.urls.filter(item => item.blob.type === 'text/javascript')) {
      assert.equal(h.revoked.filter(item => item === url).length, 1, `${url} is revoked once`);
    }
    if (job.worker) assert.equal(job.worker.terminateCount, 1);
    await complete(h);
  });
}

test('export locks every source, range, and audio control until cancellation', async () => {
  const h = ready(); begin(h);
  const ids = ['fileInput', 'changeFileButton', 'clearFileButton', 'newButton', 'startInput', 'endInput',
    'startRange', 'endRange', 'setStartCurrent', 'setEndCurrent', 'removeAudio', 'resetRangeButton'];
  for (const id of ids) assert.ok(h.els[id]?.disabled, `${id} is locked`);
  h.els.sourcePreview.dispatch('timeupdate'); h.els.languageButton.click();
  for (const id of ids) assert.ok(h.els[id]?.disabled, `${id} remains locked after rendering`);
  h.cancel(); await tick();
  for (const id of ids) assert.equal(h.els[id]?.disabled, false, `${id} unlocks`);
});
for (const [name, mutate] of [
  ['direct selectFile', h => h.selectFile(fileB)], ['direct clearFile', h => h.clearFile()],
  ['input change', h => h.els.fileInput.dispatch('change', {target: {files: [fileB]}})],
  ['drop', h => h.els.dropZone.dispatch('drop', {dataTransfer: {files: [fileB]}})],
  ['Change', h => h.els.changeFileButton.dispatch('click')], ['New', h => h.els.newButton.dispatch('click')],
  ['Remove', h => h.els.clearFileButton.dispatch('click')],
  ['drop-zone keyboard', h => h.els.dropZone.dispatch('keydown', {key: 'Enter'})],
]) {
  test(`${name} handler cannot replace or remove a source during export`, async () => {
    const h = ready(), job = begin(h), before = range(h), clicks = h.els.fileInput.clickCount;
    mutate(h); h.runChooserTimers();
    assert.equal(h.els.fileName.textContent, fileA.name); assert.deepEqual(range(h), before);
    assert.equal(job.worker.terminated, false); assert.equal(h.els.fileInput.clickCount, clicks);
    assert.equal(h.els.newVideoDialog.open, false);
    job.worker.emit('done', {data: new Uint8Array([1]).buffer}); await tick(); assert.equal(job.settled, true);
  });
}
for (const [name, mutate] of [
  ['start input', h => edit(h, 'startInput', 4)], ['end input', h => edit(h, 'endInput', 9)],
  ['start slider', h => edit(h, 'startRange', 4, 'input')], ['end slider', h => edit(h, 'endRange', 9, 'input')],
  ['current start', h => { h.els.sourcePreview.currentTime = 4; h.els.setStartCurrent.dispatch('click'); }],
  ['current end', h => { h.els.sourcePreview.currentTime = 9; h.els.setEndCurrent.dispatch('click'); }],
  ['audio', h => { h.els.removeAudio.checked = true; h.els.removeAudio.dispatch('change'); }],
]) {
  test(`${name} handler rejects settings changes during export`, async () => {
    const h = ready(), job = begin(h); mutate(h);
    assert.deepEqual(range(h), [2, 8]); assert.equal(h.els.removeAudio.checked, false);
    assert.equal(h.els.summaryDuration.textContent, '0:06.000');
    assert.deepEqual(Array.from(job.worker.payload.args), ['--input', '/workerfs/input.mp4', '--output', '/output.mp4', '--start', '2', '--end', '8']);
    job.worker.emit('done', {data: new Uint8Array([1]).buffer}); await tick();
    assert.equal(h.els.resultDuration.textContent, '0:06.000'); assert.equal(h.els.requestedStartResult.textContent, '0:02.000');
  });
}
for (const event of ['loadedmetadata', 'durationchange', 'error']) {
  test(`late ${event} cannot change the active request or displayed range`, async () => {
    const h = harness(); h.selectFile(fileA); edit(h, 'startInput', 2); edit(h, 'endInput', 8);
    const job = begin(h); h.els.sourcePreview.duration = 6; h.els.sourcePreview.dispatch(event);
    assert.deepEqual(range(h), [2, 8]); assert.equal(h.els.summaryDuration.textContent, '0:06.000');
    job.worker.emit('done', {data: new Uint8Array([1]).buffer}); await tick();
    assert.equal(h.els.resultDuration.textContent, '0:06.000'); assert.equal(h.els.requestedStartResult.textContent, '0:02.000');
  });
}

for (const [name, mutate] of [
  ['invalid start', h => edit(h, 'startInput', 'garbage')], ['negative start', h => edit(h, 'startInput', -1)],
  ['invalid end', h => edit(h, 'endInput', 'garbage')], ['end before start', h => edit(h, 'endInput', 1)],
  ['same start', h => edit(h, 'startInput', '0:02.000')], ['same end', h => edit(h, 'endInput', '8')],
  ['same start slider', h => edit(h, 'startRange', 2, 'input')], ['same end slider', h => edit(h, 'endRange', 8, 'input')],
  ['same current start', h => { h.els.sourcePreview.currentTime = 2; h.els.setStartCurrent.click(); }],
  ['invalid current end', h => { h.els.sourcePreview.currentTime = 1; h.els.setEndCurrent.click(); }],
]) {
  test(`${name} preserves the previous downloadable result`, async () => {
    const h = await complete(ready()), before = outputSnapshot(h); mutate(h); assertOutputPreserved(h, before);
  });
}
test('an accepted range change invalidates the prior result and revokes its URL once', async () => {
  const h = await complete(ready()), before = outputSnapshot(h); edit(h, 'startInput', 3);
  assert.deepEqual(range(h), [3, 8]); assert.equal(visible(h, 'resultCard'), false);
  assert.equal(h.els.mobileSaveButton.disabled, true); assert.equal(h.revoked.filter(url => url === before.url).length, 1);
});
test('start at source duration cannot commit a zero-length selection', async () => {
  const h = await complete(ready()), before = outputSnapshot(h); edit(h, 'startInput', 12);
  const [start, end] = range(h); assert.ok(end - start >= .01 - 1e-9);
  if (start === before.range[0]) assertOutputPreserved(h, before);
});
test('minimum 10ms range is enforced after clamping to duration without committing rejected values', async () => {
  const h = await complete(ready()), before = outputSnapshot(h);
  h.els.startInput.value = '11.995'; h.els.endInput.value = '99';
  assert.equal(h.validateRange(), null, 'bounded 5ms range must be rejected');
  assert.deepEqual([h.els.summaryStart.textContent, h.els.summaryEnd.textContent], ['0:02.000', '0:08.000']);
  assert.equal(visible(h, 'resultCard'), true); assert.equal(h.revoked.includes(before.url), false);
});

test('playhead keyboard seeking retains 0.5s / 5s / Home / End behavior without editing trim', () => {
  const h = ready(); h.els.sourcePreview.currentTime = 3;
  for (const [key, shiftKey, expected] of [['ArrowRight', false, 3.5], ['ArrowRight', true, 8.5], ['ArrowLeft', true, 3.5], ['End', false, 12], ['Home', false, 0]]) {
    h.els.playhead.dispatch('keydown', {key, shiftKey}); assert.equal(h.els.sourcePreview.currentTime, expected); assert.deepEqual(range(h), [2, 8]);
  }
});
test('filename normalization preserves the source container and sanitizes unsafe characters', () => {
  const h = ready();
  for (const [input, expected] of [['custom.webm', 'custom.mp4'], ['  custom  ', 'custom.mp4'], ['a/b?.mp4', 'a-b-.mp4'], ['', 'fixture-A-cut.mp4'], ['.mp4', '.mp4']]) assert.equal(h.normalizeOutputFilename(input), expected);
});

// Removing the pending-candidate/picker confirmation guard makes these fail.
// Dialog dismissal and an abandoned native picker must never discard old work.
for (const [name, choose] of [
  ['file-input change', h => h.els.fileInput.dispatch('change', {target: {files: [fileB]}})],
  ['drop', h => h.els.dropZone.dispatch('drop', {dataTransfer: {files: [fileB]}})],
]) {
  for (const dismissal of ['cancel button', 'Escape', 'backdrop']) {
    test(`${name} asks before replacement; ${dismissal} preserves the source, range, and result`, async () => {
      const h = await complete(ready()), before = outputSnapshot(h); choose(h);
      assert.equal(h.els.newVideoDialog.open, true); assertOutputPreserved(h, before);
      if (dismissal === 'cancel button') h.els.newVideoCancel.click();
      if (dismissal === 'Escape') { const event = h.els.newVideoDialog.dispatch('cancel'); if (!event.defaultPrevented) h.els.newVideoDialog.close(); }
      if (dismissal === 'backdrop') h.els.newVideoDialog.dispatch('click');
      assert.equal(h.els.newVideoDialog.open, false); assertOutputPreserved(h, before);
      // A dismissed candidate must not leak into a later picker request.
      h.els.newButton.click(); h.els.newVideoConfirm.click(); h.runChooserTimers();
      assertOutputPreserved(h, before); assert.equal(h.els.fileInput.clickCount, 1);
    });
  }
  test(`${name} accepts exactly the selected candidate only after confirmation`, async () => {
    const h = await complete(ready()), before = outputSnapshot(h), sourceUrl = h.els.sourcePreview.src;
    choose(h); assertOutputPreserved(h, before); h.els.newVideoConfirm.click(); h.runChooserTimers();
    assert.equal(h.els.newVideoDialog.open, false); assert.equal(h.els.fileName.textContent, fileB.name);
    assert.deepEqual(range(h), [0, null]); assert.equal(visible(h, 'resultCard'), false);
    assert.equal(h.els.mobileSaveButton.disabled, true); assert.equal(h.els.fileInput.clickCount, 0, 'candidate approval must not open another picker');
    assert.equal(h.revoked.filter(url => url === before.url).length, 1);
    assert.equal(h.revoked.filter(url => url === sourceUrl).length, 1);
  });
}
for (const id of ['changeFileButton', 'newButton']) {
  test(`${id} confirms before opening the picker and cancellation preserves old work`, async () => {
    const h = await complete(ready()), before = outputSnapshot(h);
    h.els[id].click(); h.runChooserTimers();
    assert.equal(h.els.newVideoDialog.open, true); assert.equal(h.els.fileInput.clickCount, 0);
    assertOutputPreserved(h, before); h.els.newVideoCancel.click(); h.runChooserTimers();
    assert.equal(h.els.fileInput.clickCount, 0); assertOutputPreserved(h, before);
  });
  test(`${id} approval opens one picker; abandoning that picker keeps the result`, async () => {
    const h = await complete(ready()), before = outputSnapshot(h);
    h.els[id].click(); h.els.newVideoConfirm.click(); h.runChooserTimers();
    assert.equal(h.els.fileInput.clickCount, 1); assertOutputPreserved(h, before);
    h.els.fileInput.dispatch('cancel'); assertOutputPreserved(h, before);
    h.els.fileInput.dispatch('change', {target: {files: [fileB]}});
    assert.equal(h.els.newVideoDialog.open, true, 'picker cancellation clears its one-shot approval');
    assertOutputPreserved(h, before);
  });
  test(`${id} approved picker selection replaces directly without double-confirmation`, async () => {
    const h = await complete(ready()), before = outputSnapshot(h);
    h.els[id].click(); h.els.newVideoConfirm.click(); h.runChooserTimers();
    assertOutputPreserved(h, before); h.els.fileInput.dispatch('change', {target: {files: [fileB]}});
    assert.equal(h.els.fileName.textContent, fileB.name); assert.equal(h.els.newVideoDialog.open, false);
    assert.equal(visible(h, 'resultCard'), false); assert.deepEqual(range(h), [0, null]);
  });
}
test('an empty file-input selection preserves work and does not authorize a later replacement', async () => {
  const h = await complete(ready()), before = outputSnapshot(h);
  h.els.changeFileButton.click(); h.els.newVideoConfirm.click(); h.runChooserTimers();
  h.els.fileInput.dispatch('change', {target: {files: []}}); assertOutputPreserved(h, before);
  h.els.dropZone.dispatch('drop', {dataTransfer: {files: [fileB]}});
  assert.equal(h.els.newVideoDialog.open, true); assertOutputPreserved(h, before);
});
test('an unsupported replacement is rejected without destroying current work', async () => {
  const h = await complete(ready()), before = outputSnapshot(h);
  h.els.fileInput.dispatch('change', {target: {files: [new File(['synthetic'], 'wrong.txt', {type: 'text/plain'})]}});
  assertOutputPreserved(h, before); assert.equal(h.els.newVideoDialog.open, false);
});
test('a pending replacement cannot be confirmed while an export is active', async () => {
  const h = ready(); h.els.fileInput.dispatch('change', {target: {files: [fileB]}});
  assert.equal(h.els.newVideoDialog.open, true); const job = begin(h);
  h.els.newVideoConfirm.dispatch('click'); h.runChooserTimers();
  assert.equal(h.els.fileName.textContent, fileA.name); assert.deepEqual(range(h), [2, 8]); assert.equal(job.worker.terminated, false);
  job.worker.emit('done', {data: new Uint8Array([1]).buffer}); await tick(); assert.equal(job.settled, true);
});
test('the first source selection never needs replacement confirmation', () => {
  for (const choose of [h => h.els.fileInput.dispatch('change', {target: {files: [fileA]}}), h => h.els.dropZone.dispatch('drop', {dataTransfer: {files: [fileA]}})]) {
    const h = harness(); choose(h); assert.equal(h.els.fileName.textContent, fileA.name); assert.equal(h.els.newVideoDialog.open, false);
  }
});

test('Reset range is a translated Japanese/English control', () => {
  const h = ready(), control = h.els.resetRangeButton;
  assert.ok(control, 'Reset range control exists'); assert.equal(control.dataset.i18n, 'resetRange');
  assert.equal(control.textContent, 'Reset range'); h.els.languageButton.click();
  assert.ok(/[\u3040-\u30ff\u3400-\u9fff]/u.test(control.textContent), 'Japanese Reset label is translated');
  assert.notEqual(control.textContent, 'resetRange'); h.els.languageButton.click(); assert.equal(control.textContent, 'Reset range');
});
test('Reset range restores the full known duration and invalidates a changed result', async () => {
  const h = await complete(ready()), before = outputSnapshot(h); assert.ok(h.els.resetRangeButton); h.els.resetRangeButton.click();
  assert.deepEqual(range(h), [0, 12]); assert.equal(h.els.summaryDuration.textContent, '0:12.000');
  assert.equal(h.isFullRange(), true); assert.equal(visible(h, 'resultCard'), false);
  assert.equal(h.revoked.filter(url => url === before.url).length, 1);
});
test('Reset range with unknown duration restores zero through end of file', () => {
  const h = harness(); h.selectFile(fileA); edit(h, 'startInput', 2); edit(h, 'endInput', 8);
  assert.ok(h.els.resetRangeButton); h.els.resetRangeButton.click(); assert.deepEqual(range(h), [0, null]);
  assert.equal(h.isFullRange(), true); assert.equal(h.els.summaryEnd.textContent, 'To end');
});
test('Reset range is a no-op for a result already covering the whole source', async () => {
  const h = ready(); edit(h, 'startInput', 0); edit(h, 'endInput', 12); await complete(h); const before = outputSnapshot(h);
  assert.ok(h.els.resetRangeButton); h.els.resetRangeButton.click(); assertOutputPreserved(h, before);
});
test('Reset range handler cannot change an active cut', async () => {
  const h = ready(), job = begin(h); assert.ok(h.els.resetRangeButton); h.els.resetRangeButton.dispatch('click');
  assert.deepEqual(range(h), [2, 8]); job.worker.emit('done', {data: new Uint8Array([1]).buffer}); await tick();
  assert.equal(h.els.resultDuration.textContent, '0:06.000');
});
for (const [name, values] of [
  ['negative start', ['-1', '8']], ['end before start', ['2', '1']], ['start at duration', ['12', '99']],
  ['subminimum finite range', ['2', '2.005']], ['subminimum implicit end', ['11.995', '']],
]) {
  test(`validating ${name} preserves committed range and previous output`, async () => {
    const h = await complete(ready()), before = outputSnapshot(h);
    [h.els.startInput.value, h.els.endInput.value] = values; assert.equal(h.validateRange(), null);
    assert.deepEqual([h.els.summaryStart.textContent, h.els.summaryEnd.textContent], ['0:02.000', '0:08.000']);
    assert.equal(visible(h, 'resultCard'), true); assert.equal(h.revoked.includes(before.url), false);
  });
}
test('a bounded range of exactly 10ms is accepted', () => {
  const h = ready(); h.els.startInput.value = '11.990'; h.els.endInput.value = '99';
  const value = h.validateRange(); assert.ok(value); assert.equal(value.start, 11.99); assert.equal(value.end, 12);
});
test('accepted audio removal invalidates the result and sends the explicit no-audio option', async () => {
  const h = await complete(ready()); h.els.removeAudio.checked = true; h.els.removeAudio.dispatch('change');
  assert.equal(visible(h, 'resultCard'), false); const job = begin(h); assert.ok(job.worker.payload.args.includes('--no-audio'));
  job.worker.emit('done', {data: new Uint8Array([1]).buffer}); await tick(); assert.equal(job.settled, true);
});
test('full-range confirmation still guards Cut and allows cancel without starting a Worker', async () => {
  const h = ready(); edit(h, 'startInput', 0); edit(h, 'endInput', 12); h.els.cutButton.click(); assert.equal(h.els.fullRangeDialog.open, true);
  assert.equal(h.workers.length, 0); h.els.fullRangeCancel.click(); assert.equal(h.els.fullRangeDialog.open, false);
  assert.equal(h.workers.length, 0); h.els.cutButton.click(); h.els.fullRangeConfirm.click(); assert.equal(h.workers.length, 1);
  h.workers[0].emit('done', {data: new Uint8Array([1]).buffer}); await tick(); assert.equal(visible(h, 'resultCard'), true);
});
test('repeated Cancel is idempotent and cancelled output cannot reappear when no retry exists', async () => {
  const h = ready(), job = begin(h), queued = job.worker.queuedCallbacks(); h.cancel(); h.cancel();
  const toastCount = h.els.toastRegion.childElementCount; queued.emit('done', {data: new Uint8Array([9]).buffer}); await tick();
  assert.equal(job.settled, true); assert.equal(job.worker.terminateCount, 1);
  assert.equal(h.revoked.filter(url => url === job.worker.url).length, 1); assert.equal(visible(h, 'resultCard'), false);
  assert.equal(h.els.toastRegion.childElementCount, toastCount); assertIdle(h);
});

test('an invalid approved picker selection consumes approval and preserves old work', async () => {
  const h = await complete(ready()), before = outputSnapshot(h);
  h.els.changeFileButton.click(); h.els.newVideoConfirm.click(); h.runChooserTimers();
  h.els.fileInput.dispatch('change', {target: {files: [new File(['synthetic'], 'wrong.txt')]}});
  assertOutputPreserved(h, before); assert.equal(h.els.newVideoDialog.open, false);
  h.els.fileInput.dispatch('change', {target: {files: [fileB]}});
  assert.equal(h.els.newVideoDialog.open, true); assertOutputPreserved(h, before);
});
test('starting a cut clears abandoned picker approval before later replacement', async () => {
  const h = ready(); h.els.changeFileButton.click(); h.els.newVideoConfirm.click(); h.runChooserTimers();
  const job = begin(h); h.cancel(); await tick(); assert.equal(job.settled, true);
  h.els.fileInput.dispatch('change', {target: {files: [fileB]}});
  assert.equal(h.els.newVideoDialog.open, true); assert.equal(h.els.fileName.textContent, fileA.name);
  assert.deepEqual(range(h), [2, 8]);
});
test('a drop cannot spend confirmation intended for an approved native picker', async () => {
  const h = await complete(ready()), before = outputSnapshot(h);
  h.els.newButton.click(); h.els.newVideoConfirm.click(); h.runChooserTimers();
  h.els.dropZone.dispatch('drop', {dataTransfer: {files: [fileB]}});
  assert.equal(h.els.newVideoDialog.open, true); assertOutputPreserved(h, before);
});
test('replacement chooser keyboard activation confirms before opening', async () => {
  for (const key of ['Enter', ' ']) {
    const h = await complete(ready()), before = outputSnapshot(h);
    const event = h.els.dropZone.dispatch('keydown', {key}); h.runChooserTimers();
    assert.equal(event.defaultPrevented, true); assert.equal(h.els.newVideoDialog.open, true);
    assert.equal(h.els.fileInput.clickCount, 0); assertOutputPreserved(h, before);
  }
});
test('a cancelled replacement candidate never replaces the next approved candidate', async () => {
  const h = await complete(ready()), fileC = new File(['synthetic C'], 'fixture-C.mov', {type: 'video/quicktime'});
  h.els.dropZone.dispatch('drop', {dataTransfer: {files: [fileB]}}); h.els.newVideoCancel.click();
  h.els.fileInput.dispatch('change', {target: {files: [fileC]}}); h.els.newVideoConfirm.click();
  assert.equal(h.els.fileName.textContent, fileC.name); assert.equal(h.els.fileFormat.textContent, 'MOV');
  assert.equal(h.els.outputFilename.value, 'fixture-C-cut.mov');
});
test('repeated cut requests while processing do not allocate extra Workers', async () => {
  const h = ready(), job = begin(h); h.cut();
  for (const id of ['cutButton', 'mobileCutButton', 'mobileInlineCutButton']) h.els[id].dispatch('click');
  assert.equal(h.workers.length, 1); assert.equal(h.els.fullRangeDialog.open, false);
  job.worker.emit('done', {data: new Uint8Array([1]).buffer}); await tick(); assert.equal(job.settled, true);
});
test('duplicate terminal callbacks cannot overwrite a completed result or revoke its output URL', async () => {
  const h = ready(), job = begin(h), queued = job.worker.queuedCallbacks();
  queued.emit('done', {data: new Uint8Array([1]).buffer}); await tick(); const before = outputSnapshot(h), count = h.urls.length;
  queued.emit('done', {data: new Uint8Array([2, 3]).buffer}); queued.emit('error', {error: 'duplicate terminal event'}); queued.crash(); await tick();
  assertOutputPreserved(h, before); assert.equal(h.urls.length, count); assert.equal(job.worker.terminateCount, 1);
});
test('failed or cancelled cuts clear any partial keyframe alignment', async () => {
  for (const outcome of ['error', 'cancel']) {
    const h = ready(), job = begin(h);
    job.worker.emit('log', {message: 'lossless-cut: requested-start=2 actual-start=1 keyframe-aligned=yes'});
    assert.equal(h.els.keyframeMarker.hidden, false);
    if (outcome === 'cancel') h.cancel(); else job.worker.emit('error', {error: 'synthetic failure'});
    await tick(); assert.equal(h.els.keyframeMarker.hidden, true); assert.equal(h.els.timelineGuideResult.hidden, true);
  }
});
test('saved output rename retains bytes and enforces the source container extension', async () => {
  const h = await complete(ready()), before = outputSnapshot(h); edit(h, 'outputFilename', 'renamed.webm');
  assert.equal(h.els.resultName.textContent, 'renamed.mp4'); assert.equal(h.els.outputFilename.value, 'renamed.mp4');
  assert.equal(h.els.resultPreview.src, before.url); assert.equal(visible(h, 'resultCard'), true); assert.equal(h.revoked.includes(before.url), false);
});

test('Reset range preserves the selected audio option and custom output filename', async () => {
  const h = ready(); h.els.removeAudio.checked = true; h.els.removeAudio.dispatch('change'); await complete(h);
  edit(h, 'outputFilename', 'chosen-name.mp4'); assert.ok(h.els.resetRangeButton); h.els.resetRangeButton.click();
  assert.deepEqual(range(h), [0, 12]); assert.equal(h.els.removeAudio.checked, true);
  assert.equal(h.els.outputFilename.value, 'chosen-name.mp4');
  const job = begin(h); assert.ok(job.worker.payload.args.includes('--no-audio'));
  job.worker.emit('done', {data: new Uint8Array([1]).buffer}); await tick(); assert.equal(h.els.resultName.textContent, 'chosen-name.mp4');
});
test('Reset range stays unavailable until a source is selected', () => {
  const h = harness(); assert.ok(h.els.resetRangeButton); assert.equal(h.els.resetRangeButton.disabled, true);
  h.selectFile(fileA); assert.equal(h.els.resetRangeButton.disabled, false);
  h.clearFile(); assert.equal(h.els.resetRangeButton.disabled, true);
});

// Late browser metadata is deferred while the request owns the controls, then
// reconciled on every exit path without discarding the user's committed range.
for (const mediaEvent of ['loadedmetadata', 'durationchange']) {
  for (const outcome of ['done', 'cancel', 'error']) {
    test(`deferred ${mediaEvent} is reconciled after ${outcome} without changing the requested range`, async () => {
      const h = harness(); h.selectFile(fileA); edit(h, 'startInput', 2); edit(h, 'endInput', 8);
      const job = begin(h); h.els.sourcePreview.duration = 12; h.els.sourcePreview.dispatch(mediaEvent);
      assert.deepEqual(range(h), [2, 8], 'late metadata must not alter an active request');
      assert.equal(h.els.fileDuration.textContent, '—', 'duration reconciliation waits for the active cut');
      assert.equal(h.els.startRange.disabled, true); assert.equal(h.els.endRange.disabled, true);
      if (outcome === 'cancel') h.cancel();
      else if (outcome === 'error') job.worker.emit('error', {error: 'Synthetic processing error'});
      else job.worker.emit('done', {data: new Uint8Array([1]).buffer});
      await tick(); assert.equal(job.settled, true); assertIdle(h);
      assert.equal(h.els.fileDuration.textContent, '0:12.000', 'deferred duration is reconciled on exit');
      assert.deepEqual(range(h), [2, 8], 'metadata must preserve the committed manual range');
      assert.equal(h.els.startRange.disabled, false, 'known-duration start slider unlocks');
      assert.equal(h.els.endRange.disabled, false, 'known-duration end slider unlocks');
      assert.equal(h.els.summaryDuration.textContent, '0:06.000');
      if (outcome === 'done') {
        assert.equal(visible(h, 'resultCard'), true); assert.equal(h.els.resultDuration.textContent, '0:06.000');
        assert.equal(h.els.requestedStartResult.textContent, '0:02.000');
      }
    });
  }
}
test('preview error after a manual-duration cut preserves the committed end and saved output', async () => {
  const h = harness(); h.selectFile(fileA); edit(h, 'startInput', 2); edit(h, 'endInput', 8); await complete(h);
  const before = outputSnapshot(h); h.els.sourcePreview.dispatch('error');
  assertOutputPreserved(h, before); assert.equal(h.els.previewShell.classList.contains('is-unavailable'), true);
  assert.equal(h.els.summaryDuration.textContent, '0:06.000'); assert.equal(h.els.resultDuration.textContent, '0:06.000');
});
for (const outcome of ['done', 'cancel', 'error']) {
  test(`deferred preview error is reflected after ${outcome} without erasing the manual end`, async () => {
    const h = harness(); h.selectFile(fileA); edit(h, 'startInput', 2); edit(h, 'endInput', 8);
    const job = begin(h); h.els.sourcePreview.dispatch('error');
    assert.deepEqual(range(h), [2, 8]); assert.equal(h.els.previewShell.classList.contains('is-unavailable'), false);
    if (outcome === 'cancel') h.cancel();
    else if (outcome === 'error') job.worker.emit('error', {error: 'Synthetic processing error'});
    else job.worker.emit('done', {data: new Uint8Array([1]).buffer});
    await tick(); assert.equal(job.settled, true); assertIdle(h);
    assert.equal(h.els.previewShell.classList.contains('is-unavailable'), true, 'deferred preview error is applied on exit');
    assert.deepEqual(range(h), [2, 8]); assert.equal(h.els.summaryDuration.textContent, '0:06.000');
    if (outcome === 'done') {
      assert.equal(visible(h, 'resultCard'), true); assert.equal(h.els.resultDuration.textContent, '0:06.000');
      assert.equal(h.els.mobileSaveButton.disabled, false);
    }
  });
}

test('old deferred media facts cannot overwrite a new source during synchronous cancel and retry', async () => {
  const h = harness(); h.selectFile(fileA); edit(h, 'startInput', 2); edit(h, 'endInput', 8);
  const old = begin(h), queued = old.worker.queuedCallbacks();
  h.els.sourcePreview.duration = 12; h.els.sourcePreview.dispatch('loadedmetadata'); h.els.sourcePreview.dispatch('error');
  h.cancel(); h.selectFile(fileB); h.setInitialRange(6); edit(h, 'startInput', 1); edit(h, 'endInput', 4);
  const next = begin(h); queued.emit('done', {data: new Uint8Array([9]).buffer}); await tick();
  assert.equal(old.settled, true); assert.equal(next.worker.terminated, false);
  assert.equal(h.els.fileName.textContent, fileB.name); assert.equal(h.els.fileDuration.textContent, '0:06.000');
  assert.deepEqual(range(h), [1, 4]); assert.equal(h.els.previewShell.classList.contains('is-unavailable'), false);
  next.worker.emit('done', {data: new Uint8Array([1]).buffer}); await tick();
  assert.equal(visible(h, 'resultCard'), true); assert.equal(h.els.resultDuration.textContent, '0:03.000');
});

test('deferred duration resolves a to-end result without rewriting its requested range', async () => {
  const h = harness(); h.selectFile(fileA); edit(h, 'startInput', 2);
  const job = begin(h); h.els.sourcePreview.duration = 12; h.els.sourcePreview.dispatch('loadedmetadata');
  job.worker.emit('done', {data: new Uint8Array([1]).buffer}); await tick();
  assert.deepEqual(range(h), [2, null]); assert.equal(h.els.resultDuration.textContent, '0:10.000');
  assert.equal(h.els.endRange.value, '12'); assert.equal(h.els.timelineSelected.style.width, `${100 - 2 / 12 * 100}%`);
  assert.equal(h.els.mobileSaveButton.disabled, false);
});

for (const action of ['reset', 'validate']) {
  test(`${action} preserves a whole-source result after deferred metadata resolves an implicit end`, async () => {
    const h = harness(); h.selectFile(fileA); const job = begin(h);
    h.els.sourcePreview.duration = 12; h.els.sourcePreview.dispatch('loadedmetadata');
    job.worker.emit('done', {data: new Uint8Array([1]).buffer}); await tick();
    const outputUrl = h.els.resultPreview.src;
    assert.deepEqual(range(h), [0, null]);
    if (action === 'reset') h.els.resetRangeButton.dispatch('click'); else assert.ok(h.validateRange());
    assert.equal(visible(h, 'resultCard'), true, 'equivalent effective range keeps the completed result');
    assert.equal(h.els.resultPreview.src, outputUrl); assert.equal(h.revoked.includes(outputUrl), false);
    assert.equal(h.els.mobileSaveButton.disabled, false); assert.equal(h.els.resultDuration.textContent, '0:12.000');
  });
}
