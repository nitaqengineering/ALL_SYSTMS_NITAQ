// NITAQ Showcase — "showcase" edge function logic, kept free of Deno APIs so Node can test it
// (scripts/check-showcase-cloud.mjs). index.ts wires it to Deno.serve.
//
// GET /functions/v1/showcase?v=<token>
//   200 { data }   the villa's viewer data, with mesh.file replaced by a short-lived signed URL
//   400 / 404 / 405 / 503 { error }
// Every answer is no-store, so an owner reopening the same link always gets the latest upload.

const TOKEN = /^[a-z0-9-]{12,80}$/;
const SIGNED_SECONDS = 15 * 60;

export async function handle(request, env, fetchImpl = fetch) {
  const allowed = (env.SHOWCASE_ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  const origin = request.headers.get('origin') || '';
  const headers = {
    'Cache-Control': 'no-store',
    'Vary': 'Origin',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'apikey, authorization, content-type, x-client-info',
  };
  if (origin && allowed.includes(origin)) headers['Access-Control-Allow-Origin'] = origin;
  const reply = (status, body) => new Response(JSON.stringify(body), {
    status, headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8' }
  });

  if (origin && !allowed.includes(origin)) return reply(403, { error: 'origin' });
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (request.method !== 'GET') return reply(405, { error: 'method' });
  const base = (env.SUPABASE_URL || '').replace(/\/+$/, ''), key = env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!base || !key) return reply(503, { error: 'config' });

  const token = new URL(request.url).searchParams.get('v') || '';
  if (!TOKEN.test(token)) return reply(400, { error: 'link' });

  const auth = { apikey: key, Authorization: 'Bearer ' + key };
  try {
    const open = await fetchImpl(base + '/rest/v1/rpc/showcase_open', {
      method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_token: token })
    });
    if (!open.ok) return reply(503, { error: 'database' });
    const villa = (await open.json())[0];
    if (!villa) return reply(404, { error: 'link' }); // unknown or switched off: same answer

    const file = await fetchImpl(base + '/storage/v1/object/villas/' + villa.slug + '/data.json', { headers: auth });
    if (!file.ok) return reply(503, { error: 'storage' });
    const data = await file.json();

    const sign = await fetchImpl(base + '/storage/v1/object/sign/villas/' + villa.slug + '/' + villa.model_file, {
      method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ expiresIn: SIGNED_SECONDS })
    });
    if (!sign.ok) return reply(503, { error: 'storage' });
    const signed = (await sign.json()).signedURL;
    if (data.mesh) data.mesh.file = base + '/storage/v1' + signed;
    data.version = villa.version;
    return reply(200, { data });
  } catch (err) {
    return reply(503, { error: 'unavailable' });
  }
}
