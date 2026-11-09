import { createClient } from 'npm:@supabase/supabase-js@2.45.3';

const configuredAppUrl = Deno.env.get('NITAQ_PUBLIC_APP_URL') || '';
let appUrl = '';
try { const u = new URL(configuredAppUrl); if (u.protocol === 'https:' && !u.username && !u.password && !u.search && !u.hash) appUrl = u.href.replace(/\/+$/, '') + '/'; } catch {} 
const origin = appUrl ? new URL(appUrl).origin : '';
const headers = {
  'Access-Control-Allow-Origin': origin,
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Vary': 'Origin',
};
const reply = (status: number, body: Record<string, unknown>) => Response.json(body, { status, headers });

Deno.serve(async (request) => {
  if (!appUrl) return reply(503, { error: 'Configure NITAQ_PUBLIC_APP_URL before sending invitations' });
  if (request.headers.get('origin') && request.headers.get('origin') !== origin) {
    return reply(403, { error: 'Origin is not allowed' });
  }
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (request.method !== 'POST') return reply(405, { error: 'POST is required' });
  const authorization = request.headers.get('authorization') || '';
  if (!authorization.startsWith('Bearer ')) return reply(401, { error: 'Sign in first' });
  const url = Deno.env.get('SUPABASE_URL');
  const publicKey = Deno.env.get('SUPABASE_ANON_KEY');
  const secretKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !publicKey || !secretKey) return reply(503, { error: 'Invitation service is unavailable' });
  try {
    const body = await request.json();
    if (typeof body.email !== 'string' || body.email.length > 254) {
      return reply(400, { error: 'A valid email is required' });
    }
    const userClient = createClient(url, publicKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const identity = await userClient.auth.getUser();
    if (identity.error || !identity.data.user) return reply(401, { error: 'Sign in again' });
    const target = await userClient.rpc('nitaq_engineering_invite_target_v1', { p_email: body.email });
    if (target.error) {
      return reply(target.error.code === '42501' ? 403 : 400, { error: target.error.message });
    }
    if (target.data.registered) return reply(200, { result: 'already_registered' });
    const adminClient = createClient(url, secretKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const invitation = await adminClient.auth.admin.inviteUserByEmail(target.data.email, {
      redirectTo: new URL('engineering/index.html', appUrl).href + '?onboard=1&email=' + encodeURIComponent(target.data.email),
      data: { name: target.data.name },
    });
    if (invitation.error) {
      console.error('Nitaq invitation provider error', invitation.error.code || invitation.error.status);
      return reply(502, { error: 'تعذر إرسال الدعوة. راجع إعدادات البريد أو أعد المحاولة بعد دقيقة.' });
    }
    return reply(200, { result: 'invited' });
  } catch {
    return reply(400, { error: 'تعذر معالجة طلب الدعوة.' });
  }
});
