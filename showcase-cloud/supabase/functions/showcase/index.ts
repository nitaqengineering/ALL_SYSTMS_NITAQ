// NITAQ Showcase edge function: opens an owner link and returns that villa's model.
// Deployed with verify_jwt = false (owners have no account); the token in ?v= is the access check.
// Secrets: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase;
// set SHOWCASE_ALLOWED_ORIGINS to the site origin(s), e.g. https://nitaqengineering.github.io
import { handle } from './handler.mjs';

Deno.serve((request) => handle(request, {
  SUPABASE_URL: Deno.env.get('SUPABASE_URL'),
  SUPABASE_SERVICE_ROLE_KEY: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
  SUPABASE_SECRET_KEYS: Deno.env.get('SUPABASE_SECRET_KEYS'),
  SHOWCASE_ALLOWED_ORIGINS: Deno.env.get('SHOWCASE_ALLOWED_ORIGINS'),
}));
