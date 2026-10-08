// Edge Function: communication-health
// POST-only. Autorização: INTERNAL_FUNCTION_SECRET OU service_role JWT OU
// Usuários HTTP não têm contrato para leitura global (NOTIF-3).
// Retorna EXCLUSIVAMENTE o snapshot consolidado do RPC admin
// `rpc_admin_communication_health_snapshot` — sem secrets, sem PII,
// sem valores/UUIDs de credenciais. Não invoca worker nem altera flags.

import { json, requirePost, serviceClient } from "../_shared/auth-guard.ts";

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
  return { ok: false, res: json(403, { ok: false, error: "NOTIF3_GLOBAL_CONTRACT_UNAVAILABLE" }) };
}

type Snapshot = Record<string, unknown> & { ok?: boolean };

function sanitize(snap: Snapshot): Snapshot {
  // Defesa em profundidade: bloqueia qualquer chave sensível caso o RPC seja
  // alterado no futuro. Retorna somente contadores/booleanos/timestamps.
  const forbidden = /(password|secret|token|api_key|access_token|dsn|smtp_user|smtp_host|smtp_from|phone_number_id|verify_token)/i;
  const walk = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
        if (forbidden.test(k)) continue;
        out[k] = walk(val);
      }
      return out;
    }
    return v;
  };
  return walk(snap) as Snapshot;
}

Deno.serve(async (req: Request) => {
  const pre = requirePost(req);
  if (pre) return pre;
  const az = await authorize(req);
  if (!az.ok) return az.res;

  // Also fail closed for internal callers, before global aggregation.
  const globalContractAvailable = false;
  if (!globalContractAvailable) return json(503, { ok: false, error: "NOTIF3_GLOBAL_CONTRACT_UNAVAILABLE" });

  const sb = serviceClient();
  const { data, error } = await sb.rpc("rpc_admin_communication_health_snapshot", {});
  if (error) return json(500, { ok: false, error: "snapshot_failed" });
  return json(200, sanitize((data ?? {}) as Snapshot));
});
