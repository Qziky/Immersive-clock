#!/usr/bin/env node
/** Read-only deployment smoke. Node >=22; no dependencies. */
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';

const [baseArg, ...args] = process.argv.slice(2);
if (!baseArg || baseArg === '--help') {
  console.log('Usage: node edgeone-regression.mjs <origin> [--dist dist] [--expect-version 4.3.2] [--strict-missing]\nOptional: WEATHER_PATH=/api/xiaomi-weather/wtr-v3/weather/all?... (valid non-personal test city query)');
  process.exit(baseArg ? 0 : 2);
}
const base = new URL(baseArg);
assert(['http:', 'https:'].includes(base.protocol) && base.pathname === '/' && !base.search && !base.hash && !base.username && !base.password, 'Use an HTTP(S) origin only');
let dist, expectedVersion, strictMissing = false;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--dist') { assert(args[i+1] && !args[i+1].startsWith('--')); dist = resolve(args[++i]); }
  else if (args[i] === '--expect-version') { assert(args[i+1] && !args[i+1].startsWith('--')); expectedVersion = args[++i]; }
  else if (args[i] === '--strict-missing') strictMissing = true;
  else throw Error(`Unknown option ${args[i]}`);
}
let pass = 0, fail = 0, warn = 0, skip = 0;
const log = (kind, msg) => console.log(`${kind.padEnd(4)} ${msg}`);
const warning = msg => { warn++; log('WARN', msg); };
const skipped = msg => { skip++; log('SKIP', msg); };
async function check(label, fn) {
  try { const result = await fn(); pass++; log('PASS', label); return result; }
  catch (e) { fail++; log('FAIL', `${label}: ${e.message}`); }
}
async function request(path, {method='GET', accept='*/*', slashRedirect=false}={}) {
  const url = new URL(path, base);
  assert.equal(url.origin, base.origin, 'Only same-origin requests allowed');
  let target = url;
  for (let n = 0; n < 3; n++) {
    const res = await fetch(target, {method, redirect:'manual', headers:{Accept:accept}, signal:AbortSignal.timeout(20000)});
    if (slashRedirect && [301,302,307,308].includes(res.status)) {
      const loc = res.headers.get('location'); assert(loc, 'Redirect missing Location');
      const next = new URL(loc, target); await res.body?.cancel();
      assert(next.origin === base.origin && next.pathname.replace(/\/+$/, '') === url.pathname.replace(/\/+$/, '') && next.search === url.search, 'Unexpected redirect (path, origin or query changed)');
      target = next; continue;
    }
    const bytes = Buffer.from(await res.arrayBuffer());
    return {status:res.status, headers:res.headers, type:(res.headers.get('content-type') || '').toLowerCase(), cache:(res.headers.get('cache-control') || '').toLowerCase(), bytes, body:bytes.toString('utf8'), url:target};
  }
  throw Error('Too many redirects');
}
const isHtml = r => /text\/html|application\/xhtml\+xml/.test(r.type) || /^\s*(?:<!doctype\s+html|<html(?:\s|>))/i.test(r.body);
const jsType = /^(?:application|text)\/(?:x-)?(?:javascript|ecmascript)(?:\s*;|$)/;
const jsonType = /^(?:application|text)\/(?:json|manifest\+json|[\w.-]+\+json)(?:\s*;|$)/;
const tagRoot = html => /\bid\s*=\s*["']root["']/i.test(html);
const directives = r => r.cache.split(',').map(v=>v.trim());
const has = (r, d) => directives(r).includes(d);
function maxAge(r) { const m = r.cache.match(/(?:^|,)\s*max-age\s*=\s*"?(\d+)/); return m ? Number(m[1]) : undefined; }
function cacheAge(r, seconds, immutable=false) { assert.equal(maxAge(r), seconds, `Cache-Control expected max-age=${seconds}, got ${r.cache || '(missing)'}`); if (immutable) assert(has(r, 'immutable'), 'Expected immutable'); assert(!has(r,'no-store') && !has(r,'no-cache'), 'Unexpected no-store/no-cache'); }
function freshHtml(r) { assert(!has(r, 'immutable'), `HTML marked immutable: ${r.cache}`); assert(has(r,'no-store') || has(r,'no-cache') || maxAge(r) === 0, `HTML must revalidate: ${r.cache || '(missing)'}`); }
function status200(r) { assert.equal(r.status,200,`HTTP ${r.status}`); assert(r.bytes.length > 0,'Empty response'); }
function asset(r, type) { status200(r); assert(!isHtml(r),'Returned HTML instead of asset'); assert(type.test(r.type),`Unexpected MIME ${r.type || '(missing)'}`); }
function appHtml(r) { status200(r); assert(isHtml(r) && tagRoot(r.body),'Expected React app HTML with #root'); freshHtml(r); }
function noIndex(r, archive=false) { const v=(r.headers.get('x-robots-tag') || '').toLowerCase(); assert(v.includes('noindex') && v.includes('nofollow') && (!archive || v.includes('noarchive')), `Unexpected X-Robots-Tag ${v || '(missing)'}`); }
const sha = b => createHash('sha256').update(b).digest('hex');
async function compareLocal(r, path) { if (!dist) return; const name=decodeURIComponent(new URL(path,base).pathname).replace(/^\//,''); const bytes=await readFile(join(dist,name)); assert.equal(sha(r.bytes),sha(bytes),'Body differs from local build (or platform transforms content)'); }
function urlsFromHtml(html) {
  const out=[];
  for (const m of html.matchAll(/<(script|link)\b[^>]*>/gi)) {
    const tag=m[0], a={};
    for (const p of tag.matchAll(/([\w:-]+)\s*=\s*(["'])(.*?)\2/g)) a[p[1].toLowerCase()]=p[3].replaceAll('&amp;','&');
    const raw=a.src || a.href; if (!raw) continue;
    let u; try {u=new URL(raw,base);} catch {continue;}
    if (u.origin!==base.origin) continue;
    out.push({path:u.pathname+u.search, pathname:u.pathname, rel:a.rel || '', tag:m[1].toLowerCase(), type:a.type || ''});
  }
  return out;
}
const originHtml = await check('GET /: React HTML + revalidation', async()=>{const r=await request('/',{accept:'text/html'}); appHtml(r); assert((r.headers.get('x-robots-tag')||'').toLowerCase().includes('all'),'Missing root X-Robots-Tag: all'); return r;});
for (const path of ['/clock','/countdown','/stopwatch','/study','/exam','/terms','/privacy','/analytics','/design-system','/debug/audio']) {
  await check(`GET ${path}: direct navigation`,async()=>{const r=await request(path,{accept:'text/html',slashRedirect:true}); appHtml(r); if (/^\/(design-system|debug)(\/|$)/.test(path)) noIndex(r,true);
    if (dist) {let local; try {local=await readFile(join(dist,path.replace(/^\//,''),'index.html'));} catch(e){if(e.code!=='ENOENT')throw e;}
      if(local) assert.equal(sha(r.bytes),sha(local),'Prerendered route does not match local HTML');
      else {const index=await readFile(join(dist,'index.html')); assert.equal(sha(r.bytes),sha(index),'Unrendered route does not match local index.html');}}
  });
}
await check('/countdown?edgeone_probe=1: query preserved',async()=>{const r=await request('/countdown?edgeone_probe=1',{accept:'text/html',slashRedirect:true});appHtml(r);assert.equal(r.url.search,'?edgeone_probe=1');});
await check('/sitemap.html: distinct static HTML, not SPA',async()=>{const r=await request('/sitemap.html',{accept:'text/html'});status200(r);assert(isHtml(r)&&!tagRoot(r.body)&&r.body.includes('网站地图'),'Expected sitemap document');freshHtml(r);await compareLocal(r,'/sitemap.html');});
await check('/sitemap.xml: XML',async()=>{const r=await request('/sitemap.xml');asset(r,/^(?:text|application)\/xml(?:;|$)/);assert(/<(?:urlset|sitemapindex)\b/.test(r.body),'Invalid sitemap XML');await compareLocal(r,'/sitemap.xml');});
await check('/robots.txt: robots text',async()=>{const r=await request('/robots.txt');asset(r,/^text\/plain(?:;|$)/);assert(/User-agent\s*:/i.test(r.body),'Not robots.txt');await compareLocal(r,'/robots.txt');});
await check('/docs/quick-start.md: Markdown + noindex',async()=>{const r=await request('/docs/quick-start.md');asset(r,/^(?:text\/(?:plain|markdown|x-markdown)|application\/(?:octet-stream|markdown))(?:;|$)/);assert(/^\s*(?:#|---)/.test(r.body),'Not expected Markdown');noIndex(r);await compareLocal(r,'/docs/quick-start.md');});
await check('/fonts/inter/inter-latin-400-normal.woff2: font + 30d cache',async()=>{const p='/fonts/inter/inter-latin-400-normal.woff2',r=await request(p);asset(r,/^(?:font\/woff2|application\/(?:font-woff2|font-woff|x-font-woff|octet-stream))(?:;|$)/);assert.equal(r.bytes.subarray(0,4).toString(),'wOF2','Not a WOFF2 font');cacheAge(r,2592000,true);await compareLocal(r,p);});
await check('/favicon.svg?v=...: real SVG',async()=>{const p='/favicon.svg?v='+(expectedVersion||'probe'),r=await request(p);asset(r,/^image\/svg\+xml(?:;|$)/);assert(/<svg\b/i.test(r.body),'Not SVG');await compareLocal(r,p);});
await check('/ding.mp3: real audio',async()=>{const p='/ding.mp3',r=await request(p);asset(r,/^audio\/(?:mpeg|mp3)(?:;|$)/);assert(r.bytes.subarray(0,3).toString()==='ID3'||(r.bytes[0]===255&&(r.bytes[1]&0xe0)===0xe0),'Not MP3');await compareLocal(r,p);});
const refs=originHtml?urlsFromHtml(originHtml.body):[];
await check('HTML references actual hashed JS and CSS',async()=>{assert(refs.some(x=>x.tag==='script'&&/^\/(js|assets)\/.+\.js$/.test(x.pathname)),'No built JS reference');assert(refs.some(x=>x.rel.includes('stylesheet')&&/^\/assets\/.+\.css$/.test(x.pathname)),'No built CSS reference');});
const builtRefs=[...new Set(refs.filter(x=>/^\/(?:js|assets)\/.+\.(?:js|css)$/.test(x.pathname)).map(x=>x.path))];
for (const p of builtRefs) await check(`${p}: MIME + 1y immutable`,async()=>{const r=await request(p);asset(r,/\.css(?:\?|$)/.test(p)?/^text\/css(?:;|$)/:jsType);cacheAge(r,31536000,true);await compareLocal(r,p);});
if(dist) for(const [dir,ext,type,age] of [['images',/\.(png|jpg|jpeg|svg|webp|gif|ico)$/i,/^image\//,86400],['audio',/\.(mp3|wav|ogg|m4a)$/i,/^audio\//,172800]]) {
  let names=[];try{names=await readdir(join(dist,dir));}catch(e){if(e.code!=='ENOENT')throw e;}
  const name=names.find(n=>ext.test(n));if(!name){skipped(`No built /${dir}/ asset in dist`);continue;}
  const p=`/${dir}/${encodeURIComponent(name)}`;await check(`${p}: MIME + cache`,async()=>{const r=await request(p);asset(r,type);cacheAge(r,age);await compareLocal(r,p);});
} else skipped('Built /images/ and /audio/ samples require --dist (public SVG/MP3 checked above)');
const update=await check('/update-manifest.json: valid update schema + no-store',async()=>{const p='/update-manifest.json',r=await request(p);asset(r,jsonType);assert(has(r,'no-store')&&has(r,'no-cache')&&has(r,'must-revalidate'),`Wrong cache: ${r.cache}`);const m=JSON.parse(r.body);assert.equal(m.schemaVersion,1);assert.match(m.version,/^\d+\.\d+\.\d+(?:[-+].*)?$/);assert.equal(m.platforms?.web?.version,m.version);if(expectedVersion)assert.equal(m.version,expectedVersion);await compareLocal(r,p);return m;});
const manifests=[...new Set(refs.filter(x=>x.rel==='manifest').map(x=>x.path))];
await check('HTML includes PWA manifest link',()=>assert(manifests.length>0,'No manifest link'));
for(const p of manifests) await check(`${p}: manifest + install metadata`,async()=>{const r=await request(p);asset(r,jsonType);const m=JSON.parse(r.body);assert(m.name&&m.icons?.length&&m.start_url==='/','Invalid install metadata');if(p.split('?')[0].endsWith('.webmanifest')){cacheAge(r,86400);if(update)assert.equal(m.version,update.version,'Generated manifest version mismatch');}await compareLocal(r,p);for(const icon of m.icons){const u=new URL(icon.src,base);assert.equal(u.origin,base.origin);const img=await request(u.pathname+u.search);asset(img,/^image\//);}});
const worker=await check('/sw.js: JavaScript worker + no-store',async()=>{const p='/sw.js',r=await request(p);asset(r,jsType);assert(has(r,'no-store')&&has(r,'no-cache')&&has(r,'must-revalidate'),`Wrong cache: ${r.cache}`);assert(r.body.includes('SKIP_WAITING'),'Expected prompt worker');await compareLocal(r,p);return r;});
if(worker){const deps=[...new Set([...worker.body.matchAll(/["'](?:\.\/|\/)?(workbox-[\w-]+)(?:\.js)?["']/g)].map(m=>'/'+m[1]+'.js'))];for(const p of deps)await check(`${p}: Workbox runtime`,async()=>{const r=await request(p);asset(r,jsType);await compareLocal(r,p);});}
await check('Weather function: invalid path returns its own 404',async()=>{const r=await request('/api/xiaomi-weather/__edgeone_regression__');assert.equal(r.status,404);assert(!isHtml(r)&&r.body.trim()==='Not found','Not the expected function response');});
await check('Weather function: POST rejected with 405 + Allow: GET',async()=>{const r=await request('/api/xiaomi-weather/wtr-v3/weather/all',{method:'POST'});assert.equal(r.status,405);assert(!isHtml(r)&&r.body.trim()==='Method not allowed');assert.equal(r.headers.get('allow'),'GET');});
if(process.env.WEATHER_PATH){await check('Weather upstream: valid query returns live JSON + no-store',async()=>{const p=process.env.WEATHER_PATH,u=new URL(p,base);assert.equal(u.origin,base.origin);assert.equal(u.pathname,'/api/xiaomi-weather/wtr-v3/weather/all');assert(u.search,'Supply a valid test-city query');const r=await request(u.pathname+u.search,{accept:'application/json'});asset(r,jsonType);assert(has(r,'no-store'),`Wrong cache: ${r.cache}`);const m=JSON.parse(r.body);assert(m.current&&typeof m.current==='object','Missing current weather data');});}else skipped('Live upstream not requested: set WEATHER_PATH to a valid test-city GET path (one request; no retry)');
for(const p of ['/js/__eo_regression_missing_83bb9da.js','/api/__eo_regression_missing_83bb9da']) await check(`${p}: missing-resource behavior`,async()=>{const r=await request(p,{accept:'*/*'});if([404,410].includes(r.status))return;assert(r.status===200&&isHtml(r)&&tagRoot(r.body),'Unexpected missing-resource response');assert(!strictMissing,'Strict mode rejects soft 404 (HTML 200)');freshHtml(r);warning(`${p} is a soft 404; unmatched path fell back to HTML. Do not consume as JS/API.`);});
console.log(`\nSUMMARY pass=${pass} fail=${fail} warn=${warn} skip=${skip}`);
process.exitCode=fail?1:0;
