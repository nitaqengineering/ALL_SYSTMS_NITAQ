// Showcase cloud: the publish script and the "showcase" edge function against an in-memory
// stand-in for the separate Supabase project (PostgREST + Storage + the showcase_open RPC).
// Proves: owner links open the latest upload on the same URL, a switched-off or unknown link
// gets the same 404, tokens are random and long, origins are restricted, answers are no-store.
import assert from 'node:assert/strict';
import {handle} from '../showcase-cloud/supabase/functions/showcase/handler.mjs';
import {handlePublish, sha256hex} from '../showcase-cloud/supabase/functions/showcase-publish/handler.mjs';
import {publish, createLink, listLinks, setActive, newToken, linkUrl, addPublisher, listPublishers, setPublisher, upload, newPublisherKey} from '../tools/revit/showcase_publish.mjs';

const BASE = 'https://showcase-test.supabase.co', KEY = 'service-test-key';
const SITE_ORIGIN = 'https://nitaqengineering.github.io';
const db = {villas: new Map(), links: new Map(), publishers: new Map()}, files = new Map();

// Minimal fake of the Supabase HTTP APIs the two sides use; rejects anything without the service key.
async function fakeSupabase(url, init = {}) {
  const u = new URL(url), method = init.method || 'GET', h = init.headers || {};
  const out = (status, body) => new Response(body === undefined ? '' : JSON.stringify(body), {status});
  if (u.origin !== BASE) return out(400, {error: 'wrong host'});
  if (method === 'PUT' && u.pathname.startsWith('/storage/v1/object/upload/sign/villas/')) { // signed upload: the token is the access
    const path = u.pathname.slice('/storage/v1/object/upload/sign/villas/'.length);
    if (u.searchParams.get('token') !== 'up-' + path) return out(403, {error: 'token'});
    files.set(path, init.body); return out(200, {Key: path});
  }
  if (h.apikey !== KEY || h.Authorization !== 'Bearer ' + KEY) return out(401, {error: 'auth'});
  const p = u.pathname, body = typeof init.body === 'string' ? JSON.parse(init.body || 'null') : init.body;
  const eq = (k) => (u.searchParams.get(k) || '').replace(/^eq\./, '');
  if (p === '/rest/v1/rpc/showcase_open') {
    const l = db.links.get(body.p_token);
    if (!l || !l.active) return out(200, []);
    l.opens++; l.last_opened_at = new Date().toISOString();
    const v = db.villas.get(l.villa_slug);
    return out(200, [{slug: v.slug, model_file: v.model_file, data_file: v.data_file || 'data.json', version: v.version}]);
  }
  if (p === '/rest/v1/showcase_villas') {
    if (method === 'GET') return out(200, db.villas.has(eq('slug')) ? [db.villas.get(eq('slug'))] : []);
    db.villas.set(body.slug, {...db.villas.get(body.slug), ...body}); return out(201);
  }
  if (p === '/rest/v1/showcase_publishers') {
    if (method === 'POST') { db.publishers.set(body.name, {id: 'id-' + body.name, active: true, last_used_at: null, ...body}); return out(201); }
    const all = [...db.publishers.values()];
    if (method === 'GET') return out(200, all.filter((x) => (!eq('key_hash') || x.key_hash === eq('key_hash')) && (u.searchParams.get('active') !== 'is.true' || x.active)));
    if (method === 'PATCH') {
      const rows = all.filter((x) => x.id === eq('id') || x.name === decodeURIComponent(eq('name')));
      rows.forEach((x) => Object.assign(x, body)); return out(200, rows);
    }
  }
  if (p.startsWith('/storage/v1/object/upload/sign/villas/') && method === 'POST') {
    const path = p.slice('/storage/v1/object/upload/sign/villas/'.length);
    return out(200, {url: `/object/upload/sign/villas/${path}?token=up-${path}`});
  }
  if (p === '/rest/v1/showcase_links') {
    if (method === 'POST') {
      if (!db.villas.has(body.villa_slug)) return out(409, {error: 'fk'});
      db.links.set(body.token, {opens: 0, active: true, last_opened_at: null, ...body}); return out(201);
    }
    if (method === 'GET') return out(200, [...db.links.values()].filter((l) => (!eq('villa_slug') || l.villa_slug === eq('villa_slug'))
      && (!eq('label') || l.label === eq('label')) && (u.searchParams.get('active') !== 'is.true' || l.active)));
    if (method === 'PATCH') {
      const l = db.links.get(decodeURIComponent(eq('token')));
      if (!l) return out(200, []);
      Object.assign(l, body); return out(200, [l]);
    }
  }
  if (p.startsWith('/storage/v1/object/sign/villas/')) {
    const path = p.slice('/storage/v1/object/sign/villas/'.length);
    if (!files.has(path)) return out(404, {error: 'not found'});
    return out(200, {signedURL: `/object/sign/villas/${path}?token=signed-${body.expiresIn}`});
  }
  if (p === '/storage/v1/object/villas' && method === 'DELETE') { body.prefixes.forEach((f) => files.delete(f)); return out(200, []); }
  if (p.startsWith('/storage/v1/object/villas/')) {
    const path = p.slice('/storage/v1/object/villas/'.length);
    if (method === 'POST') { files.set(path, init.body); return out(200, {Key: path}); }
    if (!files.has(path)) return out(404, {error: 'not found'});
    return new Response(files.get(path), {status: 200});
  }
  return out(404, {error: 'route ' + method + ' ' + p});
}

const env = {SHOWCASE_URL: BASE, SHOWCASE_SERVICE_KEY: KEY};
const fnEnv = {SUPABASE_URL: BASE, SUPABASE_SERVICE_ROLE_KEY: KEY, SHOWCASE_ALLOWED_ORIGINS: SITE_ORIGIN};
const villa = (label) => ({
  data: {project: {name: 'Villa ' + label}, levels: [{name: 'GF', rooms: [], elevation: 0}],
    mesh: {origin: [0, 0, 0], step: 1, buckets: [], file: 'data/local.bin'}},
  bin: Buffer.from('model ' + label)
});
const open = (token, origin = SITE_ORIGIN, method = 'GET') => handle(new Request(
  `${BASE}/functions/v1/showcase?v=${token}`, {method, headers: origin ? {origin} : {}}), fnEnv, fakeSupabase);

// Publish, link, open.
await publish(env, 'villa-4067', '', villa('A'), fakeSupabase);
const link = await createLink(env, 'villa-4067', 'Owner', fakeSupabase);
assert.match(link.token, /^villa-4067-[a-z2-9]{12}$/);
assert.equal(link.url, 'https://nitaqengineering.github.io/ALL_SYSTMS_NITAQ/showcase/?v=' + link.token);
let res = await open(link.token);
assert.equal(res.status, 200);
assert.equal(res.headers.get('cache-control'), 'no-store');
assert.equal(res.headers.get('access-control-allow-origin'), SITE_ORIGIN);
let body = await res.json();
assert.equal(body.data.project.name, 'Villa A');
assert.equal(body.data.version, 1);
assert.match(body.data.mesh.file, /^https:\/\/showcase-test\.supabase\.co\/storage\/v1\/object\/sign\/villas\/villa-4067\/model-1\.bin\?token=signed-900$/);

// Re-publish: same link, new model; the previous model file is removed.
await publish(env, 'villa-4067', '', villa('B'), fakeSupabase);
body = await (await open(link.token)).json();
assert.equal(body.data.project.name, 'Villa B');
assert.equal(body.data.version, 2);
assert.match(body.data.mesh.file, /model-2\.bin/);
assert.ok(!files.has('villa-4067/model-1.bin') && files.has('villa-4067/model-2.bin'));
assert.equal(String(files.get('villa-4067/model-2.bin')), 'model B');

// Opens are counted; a link is bound to its own villa only.
await publish(env, 'villa-5001', '', villa('C'), fakeSupabase);
const other = await createLink(env, 'villa-5001', '', fakeSupabase);
assert.equal((await (await open(other.token)).json()).data.project.name, 'Villa C');
assert.equal((await listLinks(env, 'villa-4067', fakeSupabase))[0].opens, 2);

// Switched off, unknown and malformed links; switched back on.
await setActive(env, link.token, false, fakeSupabase);
assert.equal((await open(link.token)).status, 404);
assert.equal((await open('villa-4067-zzzzzzzzzzzz')).status, 404);
assert.equal((await open('villa-4067')).status, 400, 'a bare villa name is not a link');
assert.equal((await open('../etc/passwd-aaaaaaa')).status, 400);
await setActive(env, link.token, true, fakeSupabase);
assert.equal((await open(link.token)).status, 200);
await assert.rejects(setActive(env, 'villa-4067-notatoken12', false, fakeSupabase), /No such link/);

// Origins, methods, preflight, missing configuration.
assert.equal((await open(link.token, 'https://evil.example')).status, 403);
assert.equal((await open(link.token, '')).status, 200, 'no Origin header (direct open) is allowed');
assert.equal((await open(link.token, SITE_ORIGIN, 'POST')).status, 405);
assert.equal((await open(link.token, SITE_ORIGIN, 'OPTIONS')).status, 204);
assert.equal((await handle(new Request(`${BASE}/functions/v1/showcase?v=${link.token}`), {}, fakeSupabase)).status, 503);

// Tokens: 12 symbols from a 32-letter alphabet (60 bits), different every time.
const seen = new Set(Array.from({length: 2000}, () => newToken('x')));
assert.equal(seen.size, 2000);
assert.equal(linkUrl({SHOWCASE_SITE: 'https://example.test/s/'}, 'abc'), 'https://example.test/s/?v=abc');

// The publish script refuses to run without its settings.
await assert.rejects(publish({}, 'villa-4067', '', villa('D'), fakeSupabase), /SHOWCASE_URL/);

// ---- Engineers publish from Revit with their own key, through the showcase-publish function ----
const PUB = BASE + '/functions/v1/showcase-publish';
const pubFetch = (url, init) => url === PUB ? handlePublish(new Request(url, init), fnEnv, fakeSupabase) : fakeSupabase(url, init);
const omar = await addPublisher(env, 'Omar', fakeSupabase);
assert.match(omar, /^nsk_[a-z2-9]{32}$/);
assert.equal(db.publishers.get('Omar').key_hash, await sha256hex(omar), 'only the hash is stored');
assert.notEqual(newPublisherKey(), newPublisherKey());
const cfg = {endpoint: PUB, key: omar};

let up = await upload(cfg, 'villa-7001', '', villa('E1'), pubFetch);
assert.equal(up.version, 1);
const officeLink = up.link, officeToken = officeLink.split('?v=')[1];
assert.match(officeLink, /^https:\/\/nitaqengineering\.github\.io\/ALL_SYSTMS_NITAQ\/showcase\/\?v=villa-7001-[a-z2-9]{12}$/);
body = await (await open(officeToken)).json();
assert.equal(body.data.project.name, 'Villa E1');
assert.match(body.data.mesh.file, /villa-7001\/model-1\.bin\?token=/);
assert.equal(db.villas.get('villa-7001').updated_by, 'Omar');

// Updating the same villa: same office link, new version, the old files are removed.
up = await upload(cfg, 'villa-7001', '', villa('E2'), pubFetch);
assert.equal(up.version, 2);
assert.equal(up.link, officeLink, 'the villa keeps its link');
body = await (await open(officeToken)).json();
assert.equal(body.data.project.name, 'Villa E2');
assert.ok(files.has('villa-7001/model-2.bin') && files.has('villa-7001/data-2.json'));
assert.ok(!files.has('villa-7001/model-1.bin') && !files.has('villa-7001/data-1.json'));
assert.equal([...db.links.values()].filter((l) => l.villa_slug === 'villa-7001').length, 1);

// Further owner links and the list, through the function.
const call = (key, payload, method = 'POST') => handlePublish(new Request(PUB, {method, headers: {'x-nitaq-key': key, 'Content-Type': 'application/json'},
  ...(method === 'POST' ? {body: JSON.stringify(payload)} : {})}), fnEnv, fakeSupabase);
const extra = await (await call(omar, {op: 'link', slug: 'villa-7001', label: 'Owner'})).json();
assert.match(extra.link, /\?v=villa-7001-/);
assert.equal((await (await call(omar, {op: 'links', slug: 'villa-7001'})).json()).links.length, 2);

// Refusals: bad or switched-off key, stale version, bad input, wrong method, unknown villa.
assert.equal((await call('nsk_' + 'a'.repeat(32), {op: 'begin', slug: 'villa-7001'})).status, 401);
assert.equal((await call('not-a-key', {op: 'begin', slug: 'villa-7001'})).status, 401);
assert.equal((await call(omar, {op: 'commit', slug: 'villa-7001', version: 2, modelFile: 'model-2.bin', dataFile: 'data-2.json'})).status, 409);
assert.equal((await call(omar, {op: 'begin', slug: '../x'})).status, 400);
assert.equal((await call(omar, {op: 'commit', slug: 'villa-7001', version: 9, modelFile: '../a.bin', dataFile: 'd.json'})).status, 400);
assert.equal((await call(omar, null, 'GET')).status, 405);
assert.equal((await call(omar, {op: 'link', slug: 'villa-9999'})).status, 404);
await setPublisher(env, 'Omar', false, fakeSupabase);
await assert.rejects(upload(cfg, 'villa-7001', '', villa('E3'), pubFetch), /not accepted/);
assert.equal((await listPublishers(env, fakeSupabase))[0].active, false);
await assert.rejects(upload({endpoint: '', key: ''}, 'villa-7001', '', villa('E3'), pubFetch), /not set up/);
assert.equal((await handlePublish(new Request(PUB, {method: 'POST'}), {}, fakeSupabase)).status, 503);

console.log('PASS showcase cloud: owner links open the latest upload on the same URL; switched-off/unknown links 404 alike; links bound to one villa; opens counted; no-store; origin-restricted; engineers publish with their own revocable key (hash only stored), uploads keep the villa link, old files removed, stale/bad requests refused');
