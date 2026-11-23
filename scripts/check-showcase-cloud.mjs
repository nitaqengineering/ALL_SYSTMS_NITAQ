// Showcase cloud: the publish script and the "showcase" edge function against an in-memory
// stand-in for the separate Supabase project (PostgREST + Storage + the showcase_open RPC).
// Proves: owner links open the latest upload on the same URL, a switched-off or unknown link
// gets the same 404, tokens are random and long, origins are restricted, answers are no-store.
import assert from 'node:assert/strict';
import {handle} from '../showcase-cloud/supabase/functions/showcase/handler.mjs';
import {publish, createLink, listLinks, setActive, newToken, linkUrl} from '../tools/revit/showcase_publish.mjs';

const BASE = 'https://showcase-test.supabase.co', KEY = 'service-test-key';
const SITE_ORIGIN = 'https://nitaqengineering.github.io';
const db = {villas: new Map(), links: new Map()}, files = new Map();

// Minimal fake of the Supabase HTTP APIs the two sides use; rejects anything without the service key.
async function fakeSupabase(url, init = {}) {
  const u = new URL(url), method = init.method || 'GET', h = init.headers || {};
  const out = (status, body) => new Response(body === undefined ? '' : JSON.stringify(body), {status});
  if (u.origin !== BASE) return out(400, {error: 'wrong host'});
  if (h.apikey !== KEY || h.Authorization !== 'Bearer ' + KEY) return out(401, {error: 'auth'});
  const p = u.pathname, body = typeof init.body === 'string' ? JSON.parse(init.body || 'null') : init.body;
  const eq = (k) => (u.searchParams.get(k) || '').replace(/^eq\./, '');
  if (p === '/rest/v1/rpc/showcase_open') {
    const l = db.links.get(body.p_token);
    if (!l || !l.active) return out(200, []);
    l.opens++; l.last_opened_at = new Date().toISOString();
    const v = db.villas.get(l.villa_slug);
    return out(200, [{slug: v.slug, model_file: v.model_file, version: v.version}]);
  }
  if (p === '/rest/v1/showcase_villas') {
    if (method === 'GET') return out(200, db.villas.has(eq('slug')) ? [db.villas.get(eq('slug'))] : []);
    db.villas.set(body.slug, {...db.villas.get(body.slug), ...body}); return out(201);
  }
  if (p === '/rest/v1/showcase_links') {
    if (method === 'POST') {
      if (!db.villas.has(body.villa_slug)) return out(409, {error: 'fk'});
      db.links.set(body.token, {opens: 0, active: true, last_opened_at: null, ...body}); return out(201);
    }
    if (method === 'GET') return out(200, [...db.links.values()].filter((l) => !eq('villa_slug') || l.villa_slug === eq('villa_slug')));
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

console.log('PASS showcase cloud: owner links open the latest upload on the same URL; switched-off/unknown links 404 alike; links bound to one villa; opens counted; no-store; origin-restricted');
