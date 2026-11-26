// NITAQ Showcase publish function: engineers upload villas from the Revit button with their own key.
// Deployed with verify_jwt = false; the x-nitaq-key header (checked against showcase_publishers)
// is the access check. Secrets: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by
// Supabase; optional SHOWCASE_SITE is the viewer page the links point to.
import { handlePublish } from './handler.mjs';

Deno.serve((request) => handlePublish(request, {
  SUPABASE_URL: Deno.env.get('SUPABASE_URL'),
  SUPABASE_SERVICE_ROLE_KEY: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
  SHOWCASE_SITE: Deno.env.get('SHOWCASE_SITE'),
}));
