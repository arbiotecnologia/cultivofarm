// Edge Function: communication-health
// - POST-only
// - Autorização: INTERNAL_FUNCTION_SECRET OU service_role JWT OU JWT com role
//   administrador (checagem via user_roles). NUNCA anon.
// - Fonte primária: rpc_service_load_provider_runtime_config; fallback env
//   apenas quando não há linha configurada; erro → fail-closed.
// - Retorna EXCLUSIVAMENTE booleans configured/enabled + contagens + source. Sem segredos.

import { json, requirePost, serviceClient } from "../_shared/auth-guard.ts";
import { healthBooleans } from "../_shared/comunicacao/adapters.ts";
import { readWorkerEnv } from "../_shared/comunicacao/adapters.ts";
import { loadRuntimeConfig } from "../_shared/comunicacao/runtime-config.ts";

const INTERNAL_SECRET = Deno.env.get("INTERNAL_FUNCTION_SECRET") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

async function authorize(req: Request): Promise<{ ok: true } | { ok: false; res: Response }> {
  const secret = req.headers.get("x-internal-secret") ?? "";
  if (INTERNAL_SECRET.length > 0 && secret === INTERNAL_SECRET) return { ok: true };

  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) {
    return { ok: false, res: json(401, { ok: false, error: "unauthorized" }) };
  }
  const token = auth.slice("Bearer ".length).trim();
  if (token === SERVICE_KEY && SERVICE_KEY.length > 0) return { ok: true };

  const sb = serviceClient();
  const { data, error } = await sb.auth.getUser(token);
  if (error || !data?.user) return { ok: false, res: json(401, { ok: false, error: "invalid_token" }) };
  const { data: roles } = await sb.from("user_roles").select("role").eq("user_id", data.user.id);
  const isAdmin = (roles ?? []).some((r: { role: string }) => r.role === "administrador");
  if (!isAdmin) return { ok: false, res: json(403, { ok: false, error: "forbidden" }) };
  return { ok: true };
}

Deno.serve(async (req: Request) => {
  const pre = requirePost(req);
  if (pre) return pre;
  const az = await authorize(req);
  if (!az.ok) return az.res;

  const sb = serviceClient();
  const cfg = await loadRuntimeConfig(sb, readWorkerEnv);
  return json(200, {
    ok: true,
    source: cfg.source,   // "db" | "env" | "fail_closed"
    ...healthBooleans(cfg),
  });
});
