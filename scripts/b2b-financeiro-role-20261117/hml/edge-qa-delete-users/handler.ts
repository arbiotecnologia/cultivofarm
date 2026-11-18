// UTILITÁRIO TEMPORÁRIO HML-ONLY (vrlcdwmlytukrjezrrnf) — remove SOMENTE as 5 contas Auth QA-FIN-20261117.
// Fora de supabase/functions (sem deploy automático). Root revisa, preenche os e-mails, implanta pontualmente, usa e remove.
// service_role só no servidor (Deno.env); nunca retornado nem logado. Sem SQL em auth.*: apenas auth.admin.deleteUser.
export const HML_REF = "vrlcdwmlytukrjezrrnf";
export const EXPIRES_AT = Date.parse("2026-11-19T00:20:00Z"); // 24h após a preparação; depois disso recusa sempre.
const ORG_A = "525fea87-e27e-43f7-af7b-a30064188332", ORG_B = "85ba8b71-8514-4ec9-90d3-bfc7ab3ed214";
// Allowlist literal: UUID -> {e-mail, tenant}. Root substitui __EMAIL_*__ pelos e-mails exatos (DPAPI) antes do deploy.
export const TARGETS: Record<string, { email: string; org: string }> = {
  "7d15eddb-38b6-43dd-bbf5-43936155321d": { email: "__EMAIL_FIN_A__", org: ORG_A },
  "5db79a8e-82af-419d-ae66-87a98c02fbec": { email: "__EMAIL_FIN_B__", org: ORG_A },
  "c3ed723f-1017-478e-99b2-25b48b3ab77e": { email: "__EMAIL_FIN_C__", org: ORG_B },
  "1d0ea582-1d46-4152-8fbe-f425c74942c1": { email: "__EMAIL_GESTOR_A__", org: ORG_A },
  "51652ab6-da23-4a3d-8f29-417af15cc761": { email: "__EMAIL_TECNICO_A__", org: ORG_A },
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const out = (status: number, code: string, extra: Record<string, unknown> = {}) =>
  new Response(JSON.stringify({ code, ...extra }), { status, headers: { ...cors, "Content-Type": "application/json" } });
// deno-lint-ignore no-explicit-any
type Mk = (url: string, key: string, opts?: any) => any;
export async function handler(req: Request, mk: Mk, now = Date.now()): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return out(405, "method_not_allowed");
  const url = Deno.env.get("SUPABASE_URL") ?? "", anon = Deno.env.get("SUPABASE_ANON_KEY") ?? "", svc = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  // Fail-closed: alvo, liga/desliga explícito, validade e allowlist completa.
  if (new URL(url || "http://x").hostname !== `${HML_REF}.supabase.co`) return out(503, "wrong_project");
  if (Deno.env.get("QA_DELETE_USERS_ENABLED") !== "true") return out(503, "disabled");
  if (!(now < EXPIRES_AT)) return out(410, "expired");
  if (!anon || !svc || Object.values(TARGETS).some((t) => !/^[^@\s_]+[^@\s]*@[^@\s]+\.[^@\s]+$/.test(t.email) || t.email.startsWith("__"))) return out(503, "not_configured");
  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ") || auth.length < 20) return out(401, "unauthorized");
  let body: { user_id?: unknown; email?: unknown };
  try { body = await req.json(); } catch { return out(400, "invalid_body"); }
  if (!body || typeof body !== "object" || Object.keys(body).sort().join() !== "email,user_id") return out(400, "invalid_body");
  const uid = String(body.user_id ?? "").toLowerCase(), email = String(body.email ?? "").toLowerCase();
  const target = UUID.test(uid) ? TARGETS[uid] : undefined;
  if (!target || target.email.toLowerCase() !== email) return out(403, "target_not_allowlisted");
  // Chamador: JWT verificado, administrador pelo PRÓPRIO JWT, tenant h15 igual ao tenant do alvo, e nunca um alvo.
  const caller = mk(url, anon, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
  const { data: cl, error: ce } = await caller.auth.getClaims(auth.slice(7));
  const sub = cl?.claims?.sub;
  if (ce || typeof sub !== "string" || !UUID.test(sub)) return out(401, "unauthorized");
  if (TARGETS[sub]) return out(403, "caller_is_target");
  const { data: isAdmin, error: re } = await caller.rpc("has_role", { _user_id: sub, _role: "administrador" });
  if (re || isAdmin !== true) return out(403, "caller_not_admin");
  const { data: org, error: oe } = await caller.rpc("h15_actor_organization");
  if (oe || org !== target.org) return out(403, "tenant_mismatch");
  // Confirma identidade Auth do alvo (id+e-mail) antes de excluir; ausente = idempotente.
  const admin = mk(url, svc, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: got, error: ge } = await admin.auth.admin.getUserById(uid);
  if (ge || !got?.user) {
    if (ge && !/not.?found/i.test(String(ge.message ?? ""))) return out(502, "lookup_failed");
    return out(200, "already_absent", { user_id: uid });
  }
  if (String(got.user.id) !== uid || String(got.user.email ?? "").toLowerCase() !== email) return out(409, "identity_mismatch");
  const { error: de } = await admin.auth.admin.deleteUser(uid);
  if (de) return out(502, "delete_failed");
  console.log(JSON.stringify({ qa_delete: "ok", target: uid, caller: sub }));
  return out(200, "deleted", { user_id: uid });
}
