// REVIEW ONLY. Assemble imports locally inside a future Edge directory, after authorization review.
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { GatewayError } from 'npm:@lovable.dev/ai-gateway@0.1.11';
import { researchProduct } from './inference.ts';
import { DOCUMENTARY_FIELDS } from './documentarySuggestions.ts';

const CANONICAL = 'https://swzpzcwiasxmjutrmvkm.supabase.co';
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  if (Deno.env.get('SUPABASE_URL') !== CANONICAL) return json({ error: 'canonical_binding_required' }, 503);
  const key = Deno.env.get('SUPABASE_ANON_KEY');
  const bearer = req.headers.get('Authorization');
  if (!key || !bearer?.startsWith('Bearer ')) return json({ error: 'unauthorized' }, 401);
  const client = createClient(CANONICAL, key, { global: { headers: { Authorization: bearer } }, auth: { persistSession: false, autoRefreshToken: false } });
  const { data: user, error: authError } = await client.auth.getUser();
  if (authError || !user.user) return json({ error: 'unauthorized' }, 401);
  try {
    const body = await req.json();
    const id = body.identity;
    if (!id || !['produto','microrganismo'].includes(id.entity) || typeof id.name !== 'string' || !id.name.trim() || id.name.length > 500 || typeof id.manufacturer !== 'string' || id.manufacturer.length > 500 || typeof id.registration !== 'string' || id.registration.length > 200 || !Array.isArray(body.fields) || !body.fields.length || body.fields.some((f: unknown) => typeof f !== "string" || !DOCUMENTARY_FIELDS.some(field => field === f))) return json({ error: 'invalid_request' }, 400);
    // Existing catalog authority is evaluated on the server, not inferred from a readable product/JWT role.
    const { data: capability, error } = await client.rpc('tenant_catalog_documentary_capability_v1', { p_entity: id.entity, p_id: id.id ?? null });
    if (error || capability?.allowed !== true || capability?.actor_id !== user.user.id) return json({ error: 'catalog_authority_unavailable' }, 403);
    const result = await researchProduct(id, body.fields, req.signal);
    const { data: after, error: afterError } = await client.rpc('tenant_catalog_documentary_capability_v1', { p_entity: id.entity, p_id: id.id ?? null });
    if (afterError || after?.allowed !== true || after.actor_id !== capability.actor_id || after.organization_id !== capability.organization_id) return json({ error: 'catalog_context_changed' }, 403);
    return json(result); // No database writes, versions, approvals, published fields or provenance invented.
  } catch (e) {
    if (e instanceof GatewayError) return json({ error: 'documentary_provider_unavailable', code: e.code, outcome: e.outcome, request_ids: e.ids }, e.httpStatus ?? 502);
    return json({ error: 'invalid_documentary_response' }, 422);
  }
});