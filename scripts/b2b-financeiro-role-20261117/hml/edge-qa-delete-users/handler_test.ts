// Clientes falsos, sem rede. NÃO prova JWT/Auth hospedados.
import { handler, TARGETS, EXPIRES_AT } from "./handler.ts";
const FA = "7d15eddb-38b6-43dd-bbf5-43936155321d", FC = "c3ed723f-1017-478e-99b2-25b48b3ab77e";
const EM: Record<string, string> = {}; Object.keys(TARGETS).forEach((k, i) => { EM[k] = `qa-fin-${i}@exemplo.test`; });
const fill = () => Object.entries(EM).forEach(([k, e]) => { TARGETS[k].email = e; });
const env = (o: Record<string, string>) => Object.entries(o).forEach(([k, v]) => Deno.env.set(k, v));
const base = { SUPABASE_URL: "https://vrlcdwmlytukrjezrrnf.supabase.co", SUPABASE_ANON_KEY: "anon", SUPABASE_SERVICE_ROLE_KEY: "svc-secret", QA_DELETE_USERS_ENABLED: "true" };
type W = { sub?: string; admin?: boolean; org?: string; exists?: boolean; authEmail?: string; claimsErr?: boolean };
const NOW = EXPIRES_AT - 1000;
async function call(w: W, body: unknown, now = NOW, authH = "Bearer header.payload.signature") {
  const log: string[] = [];
  // deno-lint-ignore no-explicit-any
  const mk = (_u: string, key: string): any => ({
    auth: {
      getClaims: () => Promise.resolve(w.claimsErr ? { data: null, error: { message: "bad" } } : { data: { claims: { sub: w.sub ?? "aaaaaaaa-0000-4000-8000-00000000000a" } }, error: null }),
      admin: {
        getUserById: (id: string) => { log.push(`${key}:get:${id}`); return Promise.resolve(w.exists === false ? { data: { user: null }, error: { message: "User not found" } } : { data: { user: { id, email: w.authEmail ?? EM[id] } }, error: null }); },
        deleteUser: (id: string) => { log.push(`${key}:delete:${id}`); return Promise.resolve({ error: null }); },
      },
    },
    rpc: (fn: string) => { log.push(`${key}:rpc:${fn}`); return Promise.resolve(fn === "has_role" ? { data: w.admin ?? true, error: null } : { data: w.org ?? "525fea87-e27e-43f7-af7b-a30064188332", error: null }); },
  });
  const r = await handler(new Request("http://x", { method: "POST", headers: authH ? { Authorization: authH } : {}, body: JSON.stringify(body) }), mk, now);
  const txt = await r.text(); if (txt.includes("svc-secret")) throw new Error("vazou chave");
  return { s: r.status, code: JSON.parse(txt).code, log };
}
const ok = (c: { s: number; code: string; log: string[] }, s: number, code: string) => { if (c.s !== s || c.code !== code) throw new Error(`${c.s}/${c.code} != ${s}/${code}`); };
const noDelete = (c: { log: string[] }) => { if (c.log.some((l) => l.includes(":delete:"))) throw new Error("deleteUser chamado"); };
const body = (id = FA) => ({ user_id: id, email: EM[id] });

Deno.test("recusa sem e-mails preenchidos (allowlist incompleta)", async () => { env(base); const c = await call({}, body()); ok(c, 503, "not_configured"); noDelete(c); });
Deno.test("fluxo positivo: admin A apaga FIN A, usa service só p/ Admin API", async () => { env(base); fill(); const c = await call({}, body()); ok(c, 200, "deleted");
  if (!c.log.includes(`svc-secret:delete:${FA}`) || c.log.some((l) => l.startsWith("svc-secret:rpc"))) throw new Error(c.log.join()); });
Deno.test("projeto diferente do HML (produção) recusa", async () => { fill(); env({ ...base, SUPABASE_URL: "https://swzpzcwiasxmjutrmvkm.supabase.co" }); const c = await call({}, body()); ok(c, 503, "wrong_project"); noDelete(c); env(base); });
Deno.test("desativado recusa", async () => { fill(); env({ ...base, QA_DELETE_USERS_ENABLED: "false" }); const c = await call({}, body()); ok(c, 503, "disabled"); env(base); });
Deno.test("expirado recusa", async () => { fill(); env(base); const c = await call({}, body(), EXPIRES_AT); ok(c, 410, "expired"); noDelete(c); });
Deno.test("alvo fora da allowlist recusa", async () => { fill(); env(base); ok(await call({}, { user_id: "30000000-0000-4000-8000-000000000009", email: "real@cliente.com" }), 403, "target_not_allowlisted"); });
Deno.test("e-mail divergente da allowlist recusa", async () => { fill(); env(base); ok(await call({}, { user_id: FA, email: "outro@x.com" }), 403, "target_not_allowlisted"); });
Deno.test("campos extras recusam", async () => { fill(); env(base); ok(await call({}, { ...body(), extra: 1 }), 400, "invalid_body"); });
Deno.test("sem bearer / JWT inválido recusa", async () => { fill(); env(base); ok(await call({}, body(), NOW, ""), 401, "unauthorized"); ok(await call({ claimsErr: true }, body()), 401, "unauthorized"); });
Deno.test("chamador não admin recusa", async () => { fill(); env(base); const c = await call({ admin: false }, body()); ok(c, 403, "caller_not_admin"); noDelete(c); });
Deno.test("chamador é alvo recusa", async () => { fill(); env(base); ok(await call({ sub: FA }, body("5db79a8e-82af-419d-ae66-87a98c02fbec")), 403, "caller_is_target"); });
Deno.test("tenant diferente recusa (admin A não apaga FIN C)", async () => { fill(); env(base); const c = await call({}, body(FC)); ok(c, 403, "tenant_mismatch"); noDelete(c); });
Deno.test("admin B apaga FIN C", async () => { fill(); env(base); ok(await call({ org: "85ba8b71-8514-4ec9-90d3-bfc7ab3ed214" }, body(FC)), 200, "deleted"); });
Deno.test("identidade Auth divergente não apaga", async () => { fill(); env(base); const c = await call({ authEmail: "trocado@x.com" }, body()); ok(c, 409, "identity_mismatch"); noDelete(c); });
Deno.test("já ausente é idempotente", async () => { fill(); env(base); const c = await call({ exists: false }, body()); ok(c, 200, "already_absent"); noDelete(c); });
