// REVIEW ONLY. Assemble imports locally inside a future Edge directory, after authorization review.
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { GatewayError } from 'npm:@lovable.dev/ai-gateway@0.1.11';
import { researchProduct } from './inference.ts';
import { z } from 'npm:zod@3.25.76';
import { DOCUMENTARY_FIELDS } from './documentarySuggestions.ts';

const CANONICAL = 'https://swzpzcwiasxmjutrmvkm.supabase.co';
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
export async function handle(req: Request) {
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
    const schema = z.object({ identity: z.object({entity:z.enum(['produto','microrganismo']),id:z.string().uuid().optional(),name:z.string().trim().min(1).max(500),manufacturer:z.string().max(500),registration:z.string().max(200),scientificName:z.string().max(500).optional(),strain:z.string().max(500).optional(),purpose:z.string().max(2000).optional(),synonyms:z.string().max(2000).optional(),concentration:z.string().max(500).optional(),presentation:z.string().max(500).optional(),researchScope:z.enum(['species','product_strain']).optional()}).strict(),fields:z.array(z.enum(DOCUMENTARY_FIELDS)).min(1).max(20)}).strict();
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) return json({error:'invalid_request'},400);
    const body=parsed.data;const id=body.identity;
    // Existing catalog authority is evaluated on the server, not inferred from a readable product/JWT role.
    const { data: capability, error } = await client.rpc('tenant_catalog_documentary_capability_v1', { p_entity: id.entity, p_id: id.id ?? null });
    if (error || capability?.allowed !== true || capability?.actor_id !== user.user.id) return json({ error: 'catalog_authority_unavailable' }, 403);
    const result = await researchProduct(id, body.fields, req.signal);
    const { data: after, error: afterError } = await client.rpc('tenant_catalog_documentary_capability_v1', { p_entity: id.entity, p_id: id.id ?? null });
    if (afterError || after?.allowed !== true || after.actor_id !== capability.actor_id || after.organization_id !== capability.organization_id) return json({ error: 'catalog_context_changed' }, 403);
    return json(result); // No database writes, versions, approvals, published fields or provenance invented.
  } catch (e) {
    if (e instanceof GatewayError) return json({ error: e.httpStatus === 429 ? 'documentary_rate_limit' : e.httpStatus === 402 ? 'documentary_credit_limit' : 'documentary_provider_unavailable', code: e.code, outcome: e.outcome }, e.httpStatus === 429 || e.httpStatus === 402 ? e.httpStatus : 502);
    return json({ error: 'invalid_documentary_response' }, 422);
  }
}
if (import.meta.main) Deno.serve(handle);