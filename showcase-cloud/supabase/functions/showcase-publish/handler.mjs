// NITAQ Showcase — "showcase-publish" edge function logic (no Deno APIs, so Node can test it in
// scripts/check-showcase-cloud.mjs). index.ts wires it to Deno.serve.
//
// Engineers publish from the Revit button with their own key (header x-nitaq-key). The key is
// checked against showcase_publishers (SHA-256 only, active rows); the service role never leaves
// this function. POST JSON { op, ... }:
//   begin  { slug, title, model }  → { version, modelFile, dataFile, upload: { data, model? } }
//          short-lived signed upload URLs; the files get new names for each version
//   commit { slug, title, version, modelFile, dataFile }
//          → { version, link }  the villa now points at the new files (old ones removed);
//          its "office" link is created once and stays the same for every later update
//   link   { slug, label }  → { link }   a further owner link
//   links  { slug }         → { links: [{ label, active, opens, last_opened_at, link }] }
// Errors: 400 input, 401 key, 404 villa, 405 method, 409 stale version, 503 config/backend.

const SLUG = /^[a-z0-9-]{1,60}$/, KEY = /^nsk_[a-z0-9]{24,64}$/, FILE = /^[a-z0-9-]{1,80}\.(bin|json)$/;
const ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789';
export const SITE = 'https://nitaqengineering.github.io/ALL_SYSTMS_NITAQ/showcase/';

export async function sha256hex(text) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, '0')).join('');
}
function token(slug) { return slug + '-' + Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => ALPHABET[b % 32]).join(''); }

export async function handlePublish(request, env, fetchImpl = fetch) {
  const reply = (status, body) => new Response(JSON.stringify(body), {
    status, headers: { 'Cache-Control': 'no-store', 'Content-Type': 'application/json; charset=utf-8' }
  });
  if (request.method !== 'POST') return reply(405, { error: 'method' });
  const base = (env.SUPABASE_URL || '').replace(/\/+$/, ''), key = env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!base || !key) return reply(503, { error: 'config' });
  const site = env.SHOWCASE_SITE || SITE, linkOf = (t) => site + '?v=' + t;
  const auth = { apikey: key, Authorization: 'Bearer ' + key };
  const db = async (path, init = {}) => {
    const res = await fetchImpl(base + path, { ...init, headers: { ...auth, ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...(init.headers || {}) } });
    const text = await res.text();
    if (!res.ok) throw Object.assign(new Error(path), { status: res.status });
    return text ? JSON.parse(text) : null;
  };

  const pk = request.headers.get('x-nitaq-key') || '';
  if (!KEY.test(pk)) return reply(401, { error: 'key' });
  let body;
  try { body = await request.json(); } catch { return reply(400, { error: 'body' }); }
  const slug = body && body.slug;
  if (!SLUG.test(slug || '')) return reply(400, { error: 'slug' });
  try {
    const [who] = await db(`/rest/v1/showcase_publishers?key_hash=eq.${await sha256hex(pk)}&active=is.true&select=id,name`);
    if (!who) return reply(401, { error: 'key' });
    const [villa] = await db(`/rest/v1/showcase_villas?slug=eq.${slug}&select=model_file,data_file,version`);

    if (body.op === 'begin') {
      const version = (villa ? villa.version : 0) + 1, modelFile = `model-${version}.bin`, dataFile = `data-${version}.json`;
      const sign = async (file) => base + '/storage/v1' + (await db(`/storage/v1/object/upload/sign/villas/${slug}/${file}`, {
        method: 'POST', body: '{}', headers: { 'x-upsert': 'true' } })).url;
      const upload = { data: await sign(dataFile) };
      if (body.model) upload.model = await sign(modelFile);
      return reply(200, { version, modelFile, dataFile, upload });
    }
    if (body.op === 'commit') {
      const { version, modelFile, dataFile } = body;
      if (!Number.isInteger(version) || !FILE.test(modelFile || '') || !FILE.test(dataFile || '')) return reply(400, { error: 'files' });
      if (villa && villa.version >= version) return reply(409, { error: 'stale' }); // someone published meanwhile
      await db('/rest/v1/showcase_villas?on_conflict=slug', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify({
        slug, title: String(body.title || slug).slice(0, 200), model_file: modelFile, data_file: dataFile, version,
        updated_at: new Date().toISOString(), updated_by: who.name }) });
      const old = villa ? [villa.model_file, villa.data_file].filter((f) => f !== modelFile && f !== dataFile) : [];
      if (old.length) await db('/storage/v1/object/villas', { method: 'DELETE', body: JSON.stringify({ prefixes: old.map((f) => `${slug}/${f}`) }) }).catch(() => {});
      await db(`/rest/v1/showcase_publishers?id=eq.${who.id}`, { method: 'PATCH', body: JSON.stringify({ last_used_at: new Date().toISOString() }) }).catch(() => {});
      let [office] = await db(`/rest/v1/showcase_links?villa_slug=eq.${slug}&label=eq.office&active=is.true&select=token`);
      if (!office) { office = { token: token(slug) }; await db('/rest/v1/showcase_links', { method: 'POST', body: JSON.stringify({ token: office.token, villa_slug: slug, label: 'office' }) }); }
      return reply(200, { version, link: linkOf(office.token) });
    }
    if (!villa) return reply(404, { error: 'villa' });
    if (body.op === 'link') {
      const t = token(slug);
      await db('/rest/v1/showcase_links', { method: 'POST', body: JSON.stringify({ token: t, villa_slug: slug, label: String(body.label || '').slice(0, 80) }) });
      return reply(200, { link: linkOf(t) });
    }
    if (body.op === 'links') {
      const rows = await db(`/rest/v1/showcase_links?villa_slug=eq.${slug}&select=token,label,active,opens,last_opened_at&order=created_at`);
      return reply(200, { links: rows.map((l) => ({ label: l.label, active: l.active, opens: l.opens, last_opened_at: l.last_opened_at, link: linkOf(l.token) })) });
    }
    return reply(400, { error: 'op' });
  } catch (err) {
    return reply(503, { error: 'backend' });
  }
}
