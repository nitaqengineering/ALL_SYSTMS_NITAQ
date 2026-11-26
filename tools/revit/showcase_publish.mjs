// NITAQ Showcase — publish villas to the private showcase project and manage owner links.
//
//   node tools/revit/showcase_publish.mjs publish <slug> [title]   upload public/showcase/data/<slug>.js + .bin
//   node tools/revit/showcase_publish.mjs link <slug> [label]      new owner link for that villa
//   node tools/revit/showcase_publish.mjs links [slug]             list links (opens, last opened, on/off)
//   node tools/revit/showcase_publish.mjs disable|enable <token>   switch a link off / back on
//   node tools/revit/showcase_publish.mjs publisher add <name>      new engineer key (shown once)
//   node tools/revit/showcase_publish.mjs publishers                list engineer keys
//   node tools/revit/showcase_publish.mjs publisher off|on <name>   stop / allow an engineer key
//
// Engineers (the Revit button) never hold the service key. They run
//   node showcase_publish.mjs upload <slug> <dataDir> [title]
// with %APPDATA%/NITAQ/showcase.json = { "endpoint": ".../functions/v1/showcase-publish", "key": "nsk_..." }
// and the "showcase-publish" edge function does the privileged work. Its last output line is JSON.
//
// Reads from .env (never committed): SHOWCASE_URL (project URL), SHOWCASE_SERVICE_KEY,
// optional SHOWCASE_SITE (viewer page URL that links point to).
// Re-publishing a villa keeps every link: owners see the update on the same link.
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import vm from 'node:vm';

export const SITE = 'https://nitaqengineering.github.io/ALL_SYSTMS_NITAQ/showcase/';
const SLUG = /^[a-z0-9-]{1,60}$/;
const ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789'; // 32 symbols: 5 bits each, no look-alikes

export function newToken(slug, random = crypto.getRandomValues.bind(crypto)) {
  const bytes = random(new Uint8Array(12));
  return slug + '-' + Array.from(bytes, (b) => ALPHABET[b % 32]).join('');
}

export function linkUrl(env, token) { return (env.SHOWCASE_SITE || SITE) + '?v=' + token; }

function api(env, fetchImpl) {
  const base = (env.SHOWCASE_URL || '').replace(/\/+$/, ''), key = env.SHOWCASE_SERVICE_KEY || '';
  if (!/^https:\/\//.test(base) || !key) throw new Error('Set SHOWCASE_URL and SHOWCASE_SERVICE_KEY in .env first.');
  const auth = {apikey: key, Authorization: 'Bearer ' + key};
  async function call(path, init = {}) {
    const res = await fetchImpl(base + path, {...init, headers: {...auth, ...(init.headers || {})}});
    const text = await res.text();
    if (!res.ok) throw new Error(`${init.method || 'GET'} ${path.split('?')[0]} → ${res.status} ${text.slice(0, 200)}`);
    return text ? JSON.parse(text) : null;
  }
  const json = (method, body, prefer) => ({
    method, body: JSON.stringify(body),
    headers: {'Content-Type': 'application/json', ...(prefer ? {Prefer: prefer} : {})}
  });
  return {call, json};
}

// Load the viewer data written by showcase_build.mjs (a `window.NITAQ_SHOWCASE = …` script).
export async function readVilla(slug, dir = 'public/showcase/data') {
  if (!SLUG.test(slug)) throw new Error('Villa name: lowercase letters, digits and dashes only.');
  const sandbox = {window: {}};
  vm.runInNewContext(await readFile(`${dir}/${slug}.js`, 'utf8'), sandbox, {timeout: 2000});
  const data = sandbox.window.NITAQ_SHOWCASE;
  if (!data || !Array.isArray(data.levels)) throw new Error(`${dir}/${slug}.js is not showcase data.`);
  const bin = data.mesh ? await readFile(`${dir}/${slug}.bin`) : null;
  return {data: JSON.parse(JSON.stringify(data)), bin};
}

export async function publish(env, slug, title, villa, fetchImpl = fetch) {
  const {call, json} = api(env, fetchImpl);
  const [old] = await call(`/rest/v1/showcase_villas?slug=eq.${slug}&select=model_file,version`);
  const version = (old ? old.version : 0) + 1;
  const modelFile = `model-${version}.bin`;
  const data = villa.data;
  if (villa.bin) {
    // A new file name per version, so no cache anywhere can serve the old model with new data.
    await call(`/storage/v1/object/villas/${slug}/${modelFile}`, {
      method: 'POST', body: villa.bin, headers: {'Content-Type': 'application/octet-stream', 'x-upsert': 'true'}
    });
    data.mesh = {...data.mesh, file: modelFile};
  }
  await call(`/storage/v1/object/villas/${slug}/data.json`, {
    method: 'POST', body: JSON.stringify(data), headers: {'Content-Type': 'application/json', 'x-upsert': 'true'}
  });
  await call('/rest/v1/showcase_villas?on_conflict=slug', json('POST', {
    slug, title: title || (data.project && data.project.name) || slug, model_file: modelFile, data_file: 'data.json', version, updated_at: new Date().toISOString()
  }, 'resolution=merge-duplicates'));
  if (old && old.model_file !== modelFile) { // the row now points at the new file; drop the old one
    await call('/storage/v1/object/villas', json('DELETE', {prefixes: [`${slug}/${old.model_file}`]})).catch(() => {});
  }
  return {slug, version};
}

export async function createLink(env, slug, label, fetchImpl = fetch) {
  const {call, json} = api(env, fetchImpl);
  const token = newToken(slug);
  await call('/rest/v1/showcase_links', json('POST', {token, villa_slug: slug, label: label || ''}));
  return {token, url: linkUrl(env, token)};
}

export async function listLinks(env, slug, fetchImpl = fetch) {
  const {call} = api(env, fetchImpl);
  const filter = slug ? `&villa_slug=eq.${slug}` : '';
  return call(`/rest/v1/showcase_links?select=token,villa_slug,label,active,opens,last_opened_at${filter}&order=villa_slug,created_at`);
}

export async function setActive(env, token, active, fetchImpl = fetch) {
  const {call, json} = api(env, fetchImpl);
  const rows = await call(`/rest/v1/showcase_links?token=eq.${encodeURIComponent(token)}`,
    json('PATCH', {active}, 'return=representation'));
  if (!rows.length) throw new Error('No such link: ' + token);
  return rows[0];
}

// ---- engineer keys (admin, service key) ----
export function newPublisherKey(random = crypto.getRandomValues.bind(crypto)) {
  return 'nsk_' + Array.from(random(new Uint8Array(32)), (b) => ALPHABET[b % 32]).join('');
}
async function sha256hex(text) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, '0')).join('');
}
export async function addPublisher(env, name, fetchImpl = fetch) {
  const {call, json} = api(env, fetchImpl), key = newPublisherKey();
  await call('/rest/v1/showcase_publishers', json('POST', {name, key_hash: await sha256hex(key)}));
  return key;
}
export async function listPublishers(env, fetchImpl = fetch) {
  const {call} = api(env, fetchImpl);
  return call('/rest/v1/showcase_publishers?select=name,active,created_at,last_used_at&order=name');
}
export async function setPublisher(env, name, active, fetchImpl = fetch) {
  const {call, json} = api(env, fetchImpl);
  const rows = await call(`/rest/v1/showcase_publishers?name=eq.${encodeURIComponent(name)}`, json('PATCH', {active}, 'return=representation'));
  if (!rows.length) throw new Error('No such engineer: ' + name);
  return rows[0];
}

// ---- engineer upload (the Revit button): through the showcase-publish function ----
export function configPath(env = process.env) {
  return env.NITAQ_SHOWCASE_CONFIG || join(env.APPDATA || '.', 'NITAQ', 'showcase.json');
}
export async function upload(cfg, slug, title, villa, fetchImpl = fetch) {
  if (!cfg || !/^https:\/\//.test(cfg.endpoint || '') || !/^nsk_/.test(cfg.key || '')) throw new Error('This PC is not set up for publishing: run the NITAQ showcase installer.');
  const op = async (name, body) => {
    const res = await fetchImpl(cfg.endpoint, {method: 'POST', headers: {'Content-Type': 'application/json', 'x-nitaq-key': cfg.key}, body: JSON.stringify({op: name, slug, ...body})});
    const out = await res.json().catch(() => ({}));
    if (res.status === 401) throw new Error('The engineer key on this PC is not accepted (wrong or switched off).');
    if (!res.ok) throw new Error(`${name}: ${res.status} ${out.error || ''}`);
    return out;
  };
  const put = async (url, body, type) => {
    const res = await fetchImpl(url, {method: 'PUT', headers: {'Content-Type': type, 'x-upsert': 'true'}, body});
    if (!res.ok) throw new Error('upload: ' + res.status);
  };
  const t = title || (villa.data.project && villa.data.project.name) || slug;
  const b = await op('begin', {title: t, model: !!villa.bin});
  const data = villa.data;
  if (villa.bin) { await put(b.upload.model, villa.bin, 'application/octet-stream'); data.mesh = {...data.mesh, file: b.modelFile}; }
  await put(b.upload.data, JSON.stringify(data), 'application/json');
  return op('commit', {title: t, version: b.version, modelFile: villa.bin ? b.modelFile : 'none.bin', dataFile: b.dataFile});
}

async function loadEnv(path = '.env') {
  const env = {...process.env};
  try {
    for (const line of (await readFile(path, 'utf8')).split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m && !(m[1] in process.env)) env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
    }
  } catch { /* no .env: rely on the environment */ }
  return env;
}

if (import.meta.main) {
  const [cmd, a, b] = process.argv.slice(2);
  const env = await loadEnv();
  try {
    if (cmd === 'publish' && a) {
      const r = await publish(env, a, b, await readVilla(a));
      console.log(`Published ${r.slug} (version ${r.version}). Existing links now show this version.`);
      for (const l of await listLinks(env, a)) if (l.active) console.log('  ' + (l.label || '-') + ': ' + linkUrl(env, l.token));
    } else if (cmd === 'link' && a) {
      const r = await createLink(env, a, b);
      console.log(r.url);
    } else if (cmd === 'links') {
      for (const l of await listLinks(env, a)) {
        console.log(`${l.active ? 'on ' : 'OFF'}  ${l.villa_slug}  ${l.label || '-'}  opens ${l.opens}  last ${l.last_opened_at || 'never'}  ${linkUrl(env, l.token)}`);
      }
    } else if (cmd === 'upload' && a && b) {
      const cfg = JSON.parse(await readFile(configPath(env), 'utf8').catch(() => '{}'));
      const r = await upload(cfg, a, process.argv[6], await readVilla(a, b));
      console.log(JSON.stringify({ok: true, version: r.version, link: r.link}));
    } else if (cmd === 'publisher' && a === 'add' && b) {
      const key = await addPublisher(env, b);
      console.log(`Key for ${b} (shown once, give it to the engineer for the installer):\n${key}`);
    } else if (cmd === 'publishers') {
      for (const p of await listPublishers(env)) console.log(`${p.active ? 'on ' : 'OFF'}  ${p.name}  last used ${p.last_used_at || 'never'}`);
    } else if (cmd === 'publisher' && (a === 'off' || a === 'on') && b) {
      const r = await setPublisher(env, b, a === 'on');
      console.log(`${r.name} is now ${r.active ? 'allowed' : 'stopped'}.`);
    } else if ((cmd === 'disable' || cmd === 'enable') && a) {
      const r = await setActive(env, a, cmd === 'enable');
      console.log(`${r.token} is now ${r.active ? 'on' : 'off'}.`);
    } else {
      console.log('usage: publish <slug> [title] | link <slug> [label] | links [slug] | disable|enable <token> | publisher add|off|on <name> | publishers | upload <slug> <dataDir> [title]');
      process.exitCode = 2;
    }
  } catch (err) {
    console.error(err.message);
    if (cmd === 'upload') console.log(JSON.stringify({ok: false, error: err.message}));
    process.exitCode = 1;
  }
}
