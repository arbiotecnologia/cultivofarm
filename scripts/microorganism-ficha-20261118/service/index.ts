// REVIEW ONLY. Assemble imports locally inside a future Edge directory, after authorization review.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import { GatewayError } from "npm:@lovable.dev/ai-gateway@0.1.11";
import { researchProduct } from "./inference.ts";
import { z } from "npm:zod@3.25.76";
import { DOCUMENTARY_FIELDS } from "./documentarySuggestions.ts";

const PROJECT_REFS = new Set(["swzpzcwiasxmjutrmvkm", "vrlcdwmlytukrjezrrnf"]);
const MAX_BODY_BYTES = 24000;
const SERVER_TIMEOUT_MS = 75000;
async function boundedBody(req: Request, signal: AbortSignal) {
  if (Number(req.headers.get("content-length")) > MAX_BODY_BYTES)
    throw new Error("body_too_large");
  const reader = req.body?.getReader();
  if (!reader) throw new Error("invalid_request");
  let bytes = 0;
  const chunks: Uint8Array[] = [];
  const abort = () => {
    void reader.cancel();
  };
  signal.addEventListener("abort", abort, { once: true });
  try {
    while (true) {
      if (signal.aborted) throw new Error("request_timeout");
      const next = await reader.read();
      if (signal.aborted) throw new Error("request_timeout");
      if (next.done) break;
      bytes += next.value.byteLength;
      if (bytes > MAX_BODY_BYTES) throw new Error("body_too_large");
      chunks.push(next.value);
    }
    const body = new Uint8Array(bytes);
    let offset = 0;
    for (const chunk of chunks) {
      body.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return JSON.parse(new TextDecoder().decode(body));
  } finally {
    signal.removeEventListener("abort", abort);
    void reader.cancel();
  }
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
export async function handle(req: Request) {
  if (req.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const ref = Deno.env.get("CATALOG_DOCUMENTARY_PROJECT_REF");
  const canonical =
    ref && PROJECT_REFS.has(ref) ? `https://${ref}.supabase.co` : null;
  if (!canonical || Deno.env.get("SUPABASE_URL") !== canonical)
    return json({ error: "canonical_binding_required" }, 503);
  const key = Deno.env.get("SUPABASE_ANON_KEY");
  const bearer = req.headers.get("Authorization");
  if (!key || !bearer?.startsWith("Bearer "))
    return json({ error: "unauthorized" }, 401);
  const deadline = AbortSignal.timeout(SERVER_TIMEOUT_MS);
  const signal = AbortSignal.any([req.signal, deadline]);
  const client = createClient(canonical, key, {
    global: { headers: { Authorization: bearer }, fetch: (input, init) => fetch(input, {...init, signal}) },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  let lease: string | undefined;
  try {
    const { data: user, error: authError } = await client.auth.getUser();
    if (authError || !user.user) return json({ error: 'unauthorized' }, 401);
    const schema = z
      .object({
        identity: z
          .object({
            entity: z.enum(["produto", "microrganismo"]),
            id: z.string().uuid().optional(),
            name: z.string().trim().min(1).max(500),
            manufacturer: z.string().max(500),
            registration: z.string().max(200),
            scientificName: z.string().max(500).optional(),
            strain: z.string().max(500).optional(),
            purpose: z.string().max(2000).optional(),
            synonyms: z.string().max(2000).optional(),
            concentration: z.string().max(500).optional(),
            presentation: z.string().max(500).optional(),
            researchScope: z.enum(["species", "product_strain"]).optional(),
          })
          .strict(),
        fields: z.array(z.enum(DOCUMENTARY_FIELDS)).min(1).max(20),
      })
      .strict();
    const parsed = schema.safeParse(await boundedBody(req, signal));
    if (!parsed.success) return json({ error: "invalid_request" }, 400);
    const body = parsed.data;
    const id = body.identity;
    // Existing catalog authority is evaluated on the server, not inferred from a readable product/JWT role.
    const { data: capability, error } = await client.rpc(
      "tenant_catalog_documentary_capability_v1",
      { p_entity: id.entity, p_id: id.id ?? null },
    );
    if (
      error ||
      capability?.allowed !== true ||
      capability?.actor_id !== user.user.id
    )
      return json({ error: "catalog_authority_unavailable" }, 403);
    const reservation = await client.rpc(
      "tenant_catalog_documentary_reserve_v1",
      { p_entity: id.entity, p_id: id.id ?? null },
    );
    if (reservation.error)
      return json(
        {
          error:
            reservation.error.code === "PT429"
              ? "documentary_rate_limit"
              : "catalog_authority_unavailable",
        },
        reservation.error.code === "PT429" ? 429 : 403,
      );
    if (
      typeof reservation.data?.lease !== "string" ||
      reservation.data.actor_id !== capability.actor_id ||
      reservation.data.organization_id !== capability.organization_id
    )
      return json({ error: "invalid_quota_response" }, 503);
    lease = reservation.data.lease;
    if (signal.aborted) return json({ error: "documentary_timeout" }, 504);
    const result = await researchProduct(id, body.fields, signal);
    if (signal.aborted) return json({ error: "documentary_timeout" }, 504);
    const { data: after, error: afterError } = await client.rpc(
      "tenant_catalog_documentary_capability_v1",
      { p_entity: id.entity, p_id: id.id ?? null },
    );
    if (
      afterError ||
      after?.allowed !== true ||
      after.actor_id !== capability.actor_id ||
      after.organization_id !== capability.organization_id
    )
      return json({ error: "catalog_context_changed" }, 403);
    return json(result); // No database writes, versions, approvals, published fields or provenance invented.
  } catch (e) {
    if (signal.aborted) return json({ error: "documentary_timeout" }, 504);
    if (e instanceof Error && e.message === "body_too_large")
      return json({ error: "body_too_large" }, 413);
    if (e instanceof SyntaxError)
      return json({ error: "invalid_request" }, 400);
    if (e instanceof GatewayError)
      return json(
        {
          error:
            e.httpStatus === 429
              ? "documentary_rate_limit"
              : e.httpStatus === 402
                ? "documentary_credit_limit"
                : "documentary_provider_unavailable",
          code: e.code,
          outcome: e.outcome,
        },
        e.httpStatus === 429 || e.httpStatus === 402 ? e.httpStatus : 502,
      );
    return json({ error: "invalid_documentary_response" }, 422);
  } finally {
    if (lease) {
      // Cleanup is caller-bound, deny-only and cannot refund quota or authorize inference.
      await Promise.resolve(
        client.rpc("tenant_catalog_documentary_finish_v1", { p_lease: lease }),
      ).catch(() => undefined);
    }
  }
}
if (import.meta.main) Deno.serve(handle);
