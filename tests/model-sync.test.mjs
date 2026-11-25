import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ModelCatalogSync } from '../dist/main/model-sync.js';

function fixture(t, request) {
  const dir = mkdtempSync(path.join(tmpdir(), 'hermes-sync-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const auth = path.join(dir, 'auth.json'), cache = path.join(dir, 'hermes', 'models.json');
  let now = 1_000_000;
  const login = (account='a') => writeFileSync(auth, JSON.stringify({ auth_mode:'chatgpt', tokens:{access_token:`secret-${account}`,account_id:account} }));
  login();
  return {sync:new ModelCatalogSync(dir, cache, request, () => now), auth, cache, login, advance:n=>{now+=n;}};
}
const catalog = (slug) => ({models:[{slug, visibility:'list'}]});
const response = (slug, headers={}) => new Response(JSON.stringify(catalog(slug)), {headers});

test('online catalog refreshes without a Codex cache, persists privately, never writes credentials', async t => {
  let calls=0;
  const f=fixture(t, async (url, options) => {
    calls++;
    assert.equal(new URL(url).hostname,'chatgpt.com');
    assert.equal(options.redirect,'error');
    assert.equal(options.headers['ChatGPT-Account-ID'],'a');
    return response(calls===1?'new':'next');
  });
  const original=readFileSync(f.auth,'utf8');
  await f.sync.refresh();
  assert.equal(f.sync.status.source,'online');
  assert.equal(f.sync.catalog().models[0].slug,'new');
  assert.equal(statSync(f.cache).mode & 0o777,0o600);
  assert.ok(!readFileSync(f.cache,'utf8').includes('secret-'));
  assert.equal(readFileSync(f.auth,'utf8'),original);
  await f.sync.refresh(); assert.equal(calls,1);
  f.advance(30_000); await f.sync.refresh(); assert.equal(f.sync.catalog().models[0].slug,'next');
});

test('ETag revalidation and server cache lifetime prevent redundant fetches', async t => {
  let calls=0;
  const f=fixture(t,async (_url,options)=>{
    if (++calls===1) return response('new',{'etag':'catalog-v1','cache-control':'private, max-age=60'});
    assert.equal(options.headers['If-None-Match'],'catalog-v1');
    return new Response(null,{status:304});
  });
  await f.sync.refresh();
  f.advance(30_000); await f.sync.refresh(); assert.equal(calls,1);
  f.advance(30_000); await f.sync.refresh(); assert.equal(calls,2);
  assert.equal(f.sync.catalog().models[0].slug,'new'); assert.equal(f.sync.status.source,'online');
});

test('outage keeps the last catalog, retries with backoff, and restores it on restart', async t => {
  let calls=0;
  const f=fixture(t,async()=>++calls===1?response('working'):new Response('do not expose this body',{status:401}));
  await f.sync.refresh();
  f.advance(30_000); await f.sync.refresh();
  assert.equal(f.sync.status.source,'cache'); assert.match(f.sync.status.reason,/401/);
  assert.equal(f.sync.catalog().models[0].slug,'working');
  assert.ok(!JSON.stringify(f.sync.status).includes('expose'));
  await f.sync.refresh(); assert.equal(calls,2);
  const restored=new ModelCatalogSync(path.dirname(f.auth), f.cache);
  assert.equal(restored.catalog().models[0].slug,'working');
  f.login('different'); assert.equal(restored.catalog(),null);
});

test('account switches discard in-flight results and never expose another account catalog', async t => {
  let finish;
  const f=fixture(t,()=>new Promise(resolve=>{finish=resolve;}));
  const pending=f.sync.refresh();
  f.login('b'); assert.equal(f.sync.catalog(),null);
  finish(response('account-a')); await pending;
  assert.equal(f.sync.catalog(),null);
});

test('concurrent refreshes share one request; malformed replies cannot replace a valid catalog', async t => {
  let calls=0, finish;
  const f=fixture(t,()=> { calls++; return new Promise(resolve=>{finish=resolve;}); });
  const first=f.sync.refresh(); const second=f.sync.refresh(true);
  assert.equal(calls,1); finish(response('good')); await Promise.all([first,second]);
  f.advance(30_000); const third=f.sync.refresh(); finish(new Response('{broken')); await third;
  assert.equal(f.sync.catalog().models[0].slug,'good');
  assert.equal(f.sync.status.source,'cache');
});

test('missing login never makes a network request', async t => {
  const f=fixture(t,()=>{throw Error('must not request');});
  writeFileSync(f.auth,'{}'); await f.sync.refresh();
  assert.equal(f.sync.status.source,'builtin'); assert.match(f.sync.status.reason,/登录/);
  assert.equal(f.sync.catalog(),null);
});
