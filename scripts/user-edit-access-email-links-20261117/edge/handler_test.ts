// deno test edge/handler_test.ts — portas falsas; NÃO é prova de JWT hosted (assinatura real fica com getClaims/getUser).
import { handle as adminHandle } from "./tenant-user-admin/handler.ts";
import { handle as syncHandle } from "./user-email-change-sync/handler.ts";
const assert = (c: unknown, m: string) => { if (!c) throw new Error(m); };
const SUB = "11111111-1111-4111-8111-111111111111", TGT = "22222222-2222-4222-8222-222222222222", KEY = "33333333-3333-4333-8333-333333333333";
const now = Math.floor(Date.now() / 1000);
const b64 = (o: unknown) => btoa(JSON.stringify(o)).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
const forge = (p: Record<string, unknown>) => `${b64({ alg: "none" })}.${b64(p)}.sig`;
const GOOD = "eyJ.good.token", VALID = { sub: SUB, iat: now - 10, exp: now + 600, role: "authenticated" };
type Calls = { rpc: Array<[string, Record<string, unknown>]> };
function deps(o: { claims?: Record<string, unknown> | null; user?: Record<string, unknown> | null; enabled?: boolean; urlOk?: boolean; rpcErr?: { code: string; message: string } } = {}, calls: Calls = { rpc: [] }) {
  return {
    enabled: o.enabled ?? true, urlOk: o.urlOk ?? true,
    auth: {
      // Só o token "assinado" (GOOD) é aceito: getClaims verifica assinatura; payload forjado nunca é decodificado pelo handler.
      getClaims: async (t: string) => t === GOOD && o.claims !== null ? { data: { claims: o.claims ?? VALID }, error: null } : { data: null, error: new Error("invalid signature") },
      getUser: async (t: string) => t === GOOD && o.user !== null ? { data: { user: (o.user ?? { id: SUB }) as never }, error: null } : { data: { user: null }, error: new Error("bad") },
    },
    rpc: async (fn: string, args: Record<string, unknown>) => { calls.rpc.push([fn, args]); return o.rpcErr ? { data: null, error: o.rpcErr } : { data: { ok: true }, error: null }; },
    cors: () => ({}), trusted: (x: string | null) => x === "https://app.cultivofarm.com.br",
  };
}
const req = (body: unknown, h: Record<string, string> = {}) => new Request("http://x/fn", { method: "POST",
  headers: { "Content-Type": "application/json", Authorization: `Bearer ${GOOD}`, ...h }, body: typeof body === "string" ? body : JSON.stringify(body) });
const okBody = { op: "change_access_type", args: { user_id: TGT, target: "internal", roles: ["gestor"], idempotency_key: KEY, reason: "motivo válido" } };

Deno.test("gate desligado", async () => { const c = { rpc: [] } as Calls; const r = await adminHandle(req(okBody), deps({ enabled: false }, c)); assert(r.status === 503 && c.rpc.length === 0, "gate"); });
Deno.test("alvo diferente do ref canônico", async () => { assert((await adminHandle(req(okBody), deps({ urlOk: false }))).status === 503, "url"); });
Deno.test("origem não confiável", async () => { assert((await adminHandle(req(okBody, { Origin: "https://evil.example" }), deps())).status === 403, "origin"); });
Deno.test("sem Authorization / esquema errado / token malformado", async () => {
  for (const h of [{ Authorization: "" }, { Authorization: `Basic ${GOOD}` }, { Authorization: "Bearer a.b" }, { Authorization: "Bearer a b.c.d" }]) {
    const c = { rpc: [] } as Calls; const r = await adminHandle(req(okBody, h), deps({}, c)); assert(r.status === 401 && c.rpc.length === 0, JSON.stringify(h));
  }
});
Deno.test("JWT forjado (alg none / payload plausível) é rejeitado sem decodificação", async () => {
  const c = { rpc: [] } as Calls; const r = await adminHandle(req(okBody, { Authorization: `Bearer ${forge(VALID)}` }), deps({}, c));
  assert(r.status === 401 && c.rpc.length === 0, "forged");
});
Deno.test("claims inválidas: service_role, anon, anônimo, sem iat, expirado, iat futuro, sub não-UUID", async () => {
  for (const cl of [{ ...VALID, role: "service_role" }, { ...VALID, role: "anon" }, { ...VALID, is_anonymous: true }, { ...VALID, iat: undefined },
                    { ...VALID, exp: now - 1 }, { ...VALID, iat: now + 3600 }, { ...VALID, sub: "admin" }]) {
    const c = { rpc: [] } as Calls; const r = await adminHandle(req(okBody), deps({ claims: cl }, c)); assert(r.status === 401 && c.rpc.length === 0, JSON.stringify(cl));
  }
});
Deno.test("getUser: usuário diferente, inexistente, banido, excluído", async () => {
  for (const u of [{ id: TGT }, null, { id: SUB, banned_until: new Date(Date.now() + 864e5).toISOString() }, { id: SUB, deleted_at: "2026-01-01" }]) {
    const c = { rpc: [] } as Calls; const r = await adminHandle(req(okBody), deps({ user: u as never }, c)); assert(r.status === 401 && c.rpc.length === 0, JSON.stringify(u));
  }
});
Deno.test("cabeçalhos/corpo não definem identidade", async () => {
  const c = { rpc: [] } as Calls;
  await adminHandle(req(okBody, { "x-user-id": TGT, "x-forwarded-user": TGT, apikey: "x" }), deps({}, c));
  assert(c.rpc.length === 1 && c.rpc[0][1].p_actor === SUB && c.rpc[0][1].p_actor_iat === VALID.iat, "actor from claims");
  const c2 = { rpc: [] } as Calls;
  const r = await adminHandle(req({ ...okBody, args: { ...okBody.args, p_actor: TGT } }), deps({}, c2));
  assert(r.status === 400 && c2.rpc.length === 0, "p_actor in args rejected");
  const r3 = await adminHandle(req({ ...okBody, actor: TGT }), deps({}, c2)); assert(r3.status === 400 && c2.rpc.length === 0, "extra top-level");
});
Deno.test("ações não enumeradas / argumentos inválidos / corpo grande / content-type", async () => {
  const c = { rpc: [] } as Calls;
  for (const b of [{ op: "grant_superadmin", args: {} }, { op: "__proto__", args: {} }, { op: "toString", args: {} }, { op: "change_access_type", args: [] },
                   { op: "change_access_type", args: { ...okBody.args, target: "superadmin" } }, { op: "change_access_type", args: { ...okBody.args, roles: ["x'); drop"] } },
                   { op: "consultor_link", args: { user_id: TGT, action: "delete_all", cliente_id: TGT, idempotency_key: KEY } },
                   { op: "change_access_type", args: { user_id: TGT, target: "internal" } }]) {
    const r = await adminHandle(req(b), deps({}, c)); assert(r.status === 400, JSON.stringify(b));
  }
  assert((await adminHandle(req("x".repeat(9000)), deps({}, c))).status === 413, "big");
  assert((await adminHandle(req("{not json"), deps({}, c))).status === 400, "json");
  assert((await adminHandle(req(okBody, { "Content-Type": "text/plain" }), deps({}, c))).status === 415, "ct");
  assert((await adminHandle(new Request("http://x", { method: "GET", headers: { Authorization: `Bearer ${GOOD}` } }), deps({}, c))).status === 405, "method");
  assert(c.rpc.length === 0, "no rpc");
});
Deno.test("ator inativo/sem autoridade: SQL nega, Edge devolve 403 com código fixo", async () => {
  const r = await adminHandle(req(okBody), deps({ rpcErr: { code: "42501", message: "forbidden" } })); const j = await r.json();
  assert(r.status === 403 && j.error === "forbidden", "inactive");
  const r2 = await adminHandle(req(okBody), deps({ rpcErr: { code: "XX000", message: "relation secret_table at /internal/path" } }));
  assert((await r2.json()).error === "failed", "free message never echoed");
});
Deno.test("caminho válido", async () => { const c = { rpc: [] } as Calls; const r = await adminHandle(req(okBody), deps({}, c)); assert(r.status === 200 && c.rpc[0][0] === "tenant_admin_user_access_exec_v1", "ok"); });
Deno.test("sync: gate, JWT forjado, sem alvo no corpo, titular = sub", async () => {
  assert((await syncHandle(req({}), deps({ enabled: false }))).status === 503, "gate");
  const c = { rpc: [] } as Calls;
  assert((await syncHandle(req({}, { Authorization: `Bearer ${forge(VALID)}` }), deps({}, c))).status === 401, "forged");
  assert((await syncHandle(req({}), deps({ claims: { ...VALID, role: "service_role" } }, c))).status === 401, "svc");
  assert((await syncHandle(req({ p_holder: TGT }), deps({}, c))).status === 400, "body target");
  assert(c.rpc.length === 0, "none");
  const r = await syncHandle(req({}, { "x-user-id": TGT }), deps({}, c)); assert(r.status === 200 && c.rpc[0][1].p_holder === SUB, "holder=sub");
  const r2 = await syncHandle(req({}), deps({ rpcErr: { code: "42501", message: "forbidden" } })); assert(r2.status === 403, "inactive holder");
});
