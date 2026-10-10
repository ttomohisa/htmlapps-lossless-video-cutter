import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {gunzipSync} from 'node:zlib';
import {test} from 'node:test';

// Static CSS/markup contracts supplement the real headed-browser scroll test.
// Removing the modal-only overflow rule or the shared shield fails these tests.
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
let html=fs.readFileSync(path.resolve(root,process.argv[2]||'src/index.template.html'),'utf8');
const payload=html.match(/<script id="self-extract-payload"[^>]*>([A-Za-z0-9+/=\s]+)<\/script>/);
if(payload)html=gunzipSync(Buffer.from(payload[1],'base64')).toString('utf8');

test('native modal dialogs lock both page scrolling roots only while modal',()=>{
  assert.match(html,/html:has\(dialog:modal\),\s*body:has\(dialog:modal\)\s*\{\s*overflow:\s*hidden\s*;?\s*\}/);
});

test('the existing bounded Help shell retains its sticky close header',()=>{
  assert.match(html,/dialog\{[^}]*max-height:min\(82vh,760px\)/);
  assert.match(html,/\.help-head\{position:sticky;top:0/);
  assert.match(html,/<dialog id="helpDialog"[^>]*>[\s\S]*?id="helpCloseButton"[\s\S]*?class="help-body"/);
});

test('local processing badge has the decorative shared shield before its label',()=>{
  const badge=html.match(/<div class="privacy-chip">([\s\S]*?)<\/div>/)?.[1];
  assert.ok(badge,'local-processing badge exists');
  assert.match(badge,/<svg[^>]*aria-hidden="true"[^>]*><path d="M12 3 5 6v5c0 4\.6 2\.8 8 7 10 4\.2-2 7-5\.4 7-10V6z"\/><path d="m9 12 2 2 4-5"\/><\/svg><span data-i18n="privacy">/);
});
