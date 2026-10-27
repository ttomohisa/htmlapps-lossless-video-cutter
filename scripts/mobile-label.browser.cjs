// Focused layout regression. Camera, file decoding and exports are outside this wording-only test.
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium}=require('playwright');
const cfg={"language": "#languageButton", "help": "#helpButton", "modal": "#helpDialog", "scroll": "#helpDialog", "end": "#versionText", "badge": "[data-i18n=\"privacy\"]", "hide": 640, "header": "#helpDialog .help-head"};
const evidence=path.resolve('test-results/mobile-label');
async function main(){
 fs.mkdirSync(evidence,{recursive:true});const browser=await chromium.launch();
 try{for(const language of ['ja','en'])for(const [width,height]of [[1360,900],[320,568],[360,640],[390,844],[393,252]]){
 const context=await browser.newContext({viewport:{width,height},locale:language,reducedMotion:'reduce'});
 // Exercise the app's real no-camera fallback without requesting device access.
 if(cfg.noCamera)await context.addInitScript(()=>Object.defineProperty(navigator,'mediaDevices',{value:undefined}));
 const page=await context.newPage(),errors=[],requests=[],label=`${language}-${width}x${height}`;
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('request',r=>{if(/^https?:/.test(r.url()))requests.push(r.url());});
 try{
 await page.goto(pathToFileURL(path.resolve(__dirname,'../dist/index.html')).href);
 const langButton=width<=760&&cfg.phoneLanguage?cfg.phoneLanguage:cfg.language;
 await page.locator(langButton).waitFor();
 if(await page.locator('html').getAttribute('lang')!==language)await page.locator(langButton).click();
 assert.equal(await page.locator('#helpButton svg path').last().evaluate(el=>getComputedStyle(el).strokeLinecap),'round',label+': Help dot has round caps');
 const headerVersion=page.locator('#versionBadge');
 assert.equal((await headerVersion.textContent()).trim(),'v'+require('../app.config.json').version,label+': current header version');
 assert.equal(await headerVersion.isVisible(),true,label+': header version visible');
 assert.ok(await headerVersion.evaluate(el=>{const r=el.getBoundingClientRect();if(r.left<0||r.right>innerWidth||r.top<0||r.bottom>innerHeight||el.scrollWidth>el.clientWidth+1)return false;for(let p=el.parentElement;p;p=p.parentElement){const s=getComputedStyle(p),b=p.getBoundingClientRect();if(/hidden|clip/.test(s.overflowX)&&(r.left<b.left-1||r.right>b.right+1))return false;if(/hidden|clip/.test(s.overflowY)&&(r.top<b.top-1||r.bottom>b.bottom+1))return false;}return true;}),label+': version is not clipped');
 const badge=page.locator(cfg.badge);
 assert.equal((await badge.textContent()).trim(),language==='ja'?'完全ローカル処理':'Fully local processing');
 assert.equal(await badge.isVisible(),width>cfg.hide,label+': existing badge visibility');
 if(width>cfg.hide)assert.ok(await badge.evaluate(el=>{const r=el.getBoundingClientRect(),p=el.parentElement.getBoundingClientRect();return r.left>=p.left-1&&r.right<=p.right+1;}),label+': label fits');
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),label+': page width');
 if(cfg.footer)assert.equal(await page.locator('body > footer').isVisible(),width>cfg.footer,label+': existing footer hiding');
 else assert.equal(await page.locator('body > footer').count(),0,'No informational footer is added');
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 if(width!==393)await page.screenshot({path:path.join(evidence,label+'.png')});
 await page.locator(width<=760&&cfg.phoneHelp?cfg.phoneHelp:cfg.help).click();
 await page.locator(cfg.scroll).evaluate(el=>{el.scrollTop=el.scrollHeight;});
 const bounds=await page.locator(cfg.end).evaluate(el=>{const r=el.getBoundingClientRect();let top=0,bottom=innerHeight;for(let p=el.parentElement;p;p=p.parentElement){const s=getComputedStyle(p);if(/auto|scroll|hidden|clip/.test(s.overflowY)){const b=p.getBoundingClientRect();top=Math.max(top,b.top);bottom=Math.min(bottom,b.bottom);}}return{top:r.top,bottom:r.bottom,clipTop:top,clipBottom:bottom};});
 assert.ok(bounds.top>=bounds.clipTop-1&&bounds.bottom<=bounds.clipBottom+1,label+': Help end reachable '+JSON.stringify(bounds));
 const header=await page.locator(cfg.header).boundingBox();assert.ok(header&&header.y>=0&&header.y+header.height<=height,label+': Help header visible');
 await page.keyboard.press('Escape');assert.equal(await page.locator(cfg.modal).isVisible(),false,label+': Escape closes Help');
 assert.deepEqual(errors,[],label+': runtime errors');assert.deepEqual(requests,[],label+': external requests');console.log('PASS '+label);
 }catch(error){await page.screenshot({path:path.join(evidence,'failure-'+label+'.png')}).catch(()=>{});throw error;}finally{await context.close();}
 }}finally{await browser.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
