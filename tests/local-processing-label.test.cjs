'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
test('equivalent local-processing wording stays bilingual and canonical',()=>{
 const source=fs.readFileSync(path.join(__dirname,'../src/index.template.html'),'utf8');
 assert.ok(source.includes('完全ローカル処理'));
 assert.ok(source.includes("privacy:'Fully local processing'"),'English local-processing label must be canonical');
 assert.ok(!source.includes("privacy:'Fully local'"),'Superseded equivalent label must not remain');
});
