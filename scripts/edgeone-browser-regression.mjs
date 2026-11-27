#!/usr/bin/env node
/** Run from the Immersive-clock repo after npm ci and playwright install chromium.
 * Targets a preview origin, never builds, deploys, or modifies remote state.
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
const [baseArg, version='4.3.2'] = process.argv.slice(2);
assert(baseArg, 'Usage: node edgeone-browser-regression.mjs <preview-origin> [version]');
const base = new URL(baseArg);
assert(['https:', 'http:'].includes(base.protocol)&&base.pathname==='/'&&!base.search&&!base.hash&&!base.username&&!base.password,'Use a preview origin');
const { chromium } = createRequire(resolve(process.cwd(),'package.json'))('@playwright/test');
const browser = await chromium.launch({ headless:true });
const errors=[];
const contextFor=async serviceWorkers=>{
  const context=await browser.newContext({serviceWorkers});
  // Only isolated test browser storage; same fixture fields as scripts/prerender.mjs.
  await context.addInitScript(({version})=>{
    try {
      if(!localStorage.getItem('AppSettings'))localStorage.setItem('AppSettings',JSON.stringify({general:{developerModeEnabled:true,announcement:{version,hideUntil:Date.now()+3600000}}}));
      localStorage.setItem('immersive-clock:has-seen-tour','true');
      localStorage.setItem('immersive-clock:legal-consent:v1',JSON.stringify({schemaVersion:1,documentVersion:'2026-08-06',acceptedAt:Date.now()}));
      // Mirrors the prerender fixture: disable Clarity during these synthetic test visits.
      window.__IMMERSIVE_CLOCK_PRERENDER__=true;
    }catch{}
  },{version});
  return context;
};
function watch(page){page.on('pageerror',error=>errors.push(error.message));}
async function mounted(page){
  await page.waitForSelector('#root [data-ui-root], #root [data-legal-document]',{state:'attached',timeout:30000});
  await page.waitForFunction(()=>!document.getElementById('loading-screen'),{},{timeout:30000});
}
function assertRoute(page,path){assert.equal(new URL(page.url()).pathname.replace(/\/+$/,'')||'/',path,'Route changed unexpectedly');}
async function navigate(page,path){
  const res=await page.goto(new URL(path,base).href,{waitUntil:'domcontentloaded',timeout:30000});
  assert(res&&res.status()===200,`${path}: HTTP ${res?.status()}`);
  assert((res.headers()['content-type']||'').includes('text/html'),`${path}: not HTML`);
  await mounted(page); assertRoute(page,path);
}
try{
  // Separate context with service workers blocked: tests network routing, not Workbox fallback.
  const cold=await contextFor('block');
  try{
    for(const path of ['/countdown','/stopwatch','/study','/design-system','/debug/audio']){
      const page=await cold.newPage();watch(page);
      await navigate(page,path);
      const res=await page.reload({waitUntil:'domcontentloaded',timeout:30000});
      assert(res&&res.status()===200,`${path}: reload HTTP ${res?.status()}`);
      await mounted(page);assertRoute(page,path);console.log(`PASS cold direct + refresh ${path}`);await page.close();
    }
  }finally{await cold.close();}
  // A new context, online install then offline refresh on a core route.
  const warm=await contextFor('allow');
  try{
    const page=await warm.newPage();watch(page);await navigate(page,'/countdown');
    await page.waitForFunction(async()=>{const reg=await navigator.serviceWorker?.getRegistration();return !!(reg?.active&&navigator.serviceWorker.controller);},{},{timeout:60000});
    const info=await page.evaluate(async()=>{const reg=await navigator.serviceWorker.getRegistration();return {scope:reg.scope,script:reg.active.scriptURL,updateViaCache:reg.updateViaCache};});
    assert.equal(info.scope,new URL('/',base).href);assert.equal(new URL(info.script).pathname,'/sw.js');assert.equal(info.updateViaCache,'none');console.log('PASS service worker active, scope /, updateViaCache none');
    await warm.setOffline(true);
    try{const res=await page.reload({waitUntil:'domcontentloaded',timeout:30000});assert(res&&res.status()===200,'Offline reload did not return app HTML');assert(res.fromServiceWorker(),'Offline response not served by Service Worker');await mounted(page);assertRoute(page,'/countdown');console.log('PASS countdown offline refresh from Service Worker');}
    finally{await warm.setOffline(false);}
  }finally{await warm.close();}
  assert.equal(errors.length,0,`Uncaught page errors: ${errors.join('; ')}`);
  console.log('PASS browser smoke (not a two-version update test)');
}finally{await browser.close();}
