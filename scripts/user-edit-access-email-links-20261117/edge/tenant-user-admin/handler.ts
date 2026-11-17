// CANDIDATO NÃO IMPLANTADO. Destino: supabase/functions/tenant-user-admin/handler.ts
// Autoridade = JWT do ATOR verificado (verifyActor) e reautorizado no SQL (admin vigente, perfil/empresa ativos,
// mesma empresa, iat > épocas). service_role é só transporte; o corpo nunca carrega identidade.
import { type AuthPort, verifyActor } from "../_shared/user-admin/verify-actor.ts";

export interface Deps {
  enabled: boolean; urlOk: boolean; auth: AuthPort;
  rpc(fn: string, args: Record<string, unknown>): Promise<{ data: unknown; error: { code?: string; message?: string } | null }>;
  cors(origin: string | null): Record<string, string>; trusted(origin: string | null): boolean; log?(o: unknown): void;
}
const MAX_BODY = 8192;
const UUIDK = (v: unknown) => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);
const STR = (max: number) => (v: unknown) => typeof v === "string" && v.length <= max;
const ROLES = (v: unknown) => Array.isArray(v) && v.length <= 12 && v.every((x) => typeof x === "string" && /^[a-z_]{3,40}$/.test(x));
const ISO = (v: unknown) => v === null || (typeof v === "string" && v.length <= 40 && !Number.isNaN(Date.parse(v)));
type Spec = Record<string, { req: boolean; ok: (v: unknown) => boolean }>;
export const OPS: Record<string, Spec> = {
  change_access_type: {
    user_id: { req: true, ok: UUIDK }, target: { req: true, ok: (v) => v === "internal" || v === "b2b" || v === "producer" },
    roles: { req: false, ok: ROLES }, remove_roles: { req: false, ok: ROLES }, cliente_id: { req: false, ok: UUIDK },
    idempotency_key: { req: true, ok: UUIDK }, reason: { req: true, ok: STR(500) },
  },
  consultor_link: {
    user_id: { req: true, ok: UUIDK }, action: { req: true, ok: (v) => v === "add" || v === "replace" || v === "end" },
    cliente_id: { req: true, ok: UUIDK }, replace_cliente_id: { req: false, ok: UUIDK },
    access_level: { req: false, ok: (v) => v === "read" || v === "execute" || v === "manage" },
    valid_from: { req: false, ok: ISO }, valid_until: { req: false, ok: ISO },
    idempotency_key: { req: true, ok: UUIDK }, reason: { req: false, ok: STR(500) },
  },
};
// Códigos de negócio que o SQL pode emitir; qualquer outro vira "failed" (nada de mensagem livre).
export const CODES = new Set(["forbidden","self_change_denied","not_authenticated","invalid_target","invalid_access_type","reason_required",
  "invalid_roles","internal_roles_required","b2b_roles_required","internal_roles_not_allowed","admin_grant_requires_internal_user",
  "invalid_remove_roles","incompatible_roles","partner_link_required","no_change","cliente_required","cliente_not_allowed",
  "idempotency_key_required","idempotency_conflict","scope_unprovable","scope_postcondition_failed","not_internal_consultant",
  "invalid_period","invalid_replace","link_not_active","link_already_active","invalid_reason","invalid_args","unknown_op"]);

export async function handle(req: Request, d: Deps): Promise<Response> {
  const origin = req.headers.get("Origin");
  const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...d.cors(origin), "Content-Type": "application/json", "Cache-Control": "no-store, private" } });
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: d.cors(origin) });
  if (!d.enabled) return json({ error: "disabled" }, 503);                    // gate default OFF
  if (!d.urlOk) return json({ error: "unavailable" }, 503);                   // ref canônico do alvo
  if (origin && !d.trusted(origin)) return json({ error: "origin_forbidden" }, 403);
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (!(req.headers.get("Content-Type") ?? "").toLowerCase().startsWith("application/json")) return json({ error: "invalid_args" }, 415);
  const v = await verifyActor(req.headers.get("Authorization"), d.auth);
  if (!v.ok) return json({ error: v.error }, v.status);
  const raw = await req.text().catch(() => "");
  if (raw.length === 0 || raw.length > MAX_BODY) return json({ error: "invalid_args" }, 413);
  let body: unknown; try { body = JSON.parse(raw); } catch { return json({ error: "invalid_args" }, 400); }
  if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "invalid_args" }, 400);
  const { op, args, ...rest } = body as Record<string, unknown>;
  if (Object.keys(rest).length) return json({ error: "invalid_args" }, 400);
  if (typeof op !== "string" || !Object.hasOwn(OPS, op)) return json({ error: "unknown_op" }, 400);
  if (!args || typeof args !== "object" || Array.isArray(args)) return json({ error: "invalid_args" }, 400);
  const spec = OPS[op], a = args as Record<string, unknown>;
  for (const k of Object.keys(a)) if (!Object.hasOwn(spec, k) || !spec[k].ok(a[k])) return json({ error: "invalid_args" }, 400);
  for (const [k, s] of Object.entries(spec)) if (s.req && !(k in a)) return json({ error: "invalid_args" }, 400);
  const { data, error } = await d.rpc("tenant_admin_user_access_exec_v1", { p_actor: v.sub, p_actor_iat: v.iat, p_op: op, p_args: a });
  if (error) {
    d.log?.({ fn: "tenant-user-admin", op, code: error.code ?? null });
    const m = /([a-z_]+)$/.exec(error.message ?? "")?.[1] ?? "";
    const code = CODES.has(m) ? m : "failed";
    return json({ error: code }, error.code === "42501" ? 403 : error.code === "PT409" ? 409 : 400);
  }
  return json(data);
}
