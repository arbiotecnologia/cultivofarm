// Testes do candidato HML create-user rev.1 com clientes falsos (sem rede/Auth real). NÃO prova JWT/RLS hospedados.
import { handler } from "./candidate.index.ts";
const eq = (a: unknown, b: unknown, m: string) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${m}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`); };
Deno.env.set("SUPABASE_URL", "https://vrlcdwmlytukrjezrrnf.supabase.co"); Deno.env.set("SUPABASE_ANON_KEY", "anon"); Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "svc");
type W = { callerAdmin?: boolean | null; callerAdminErr?: boolean; serviceAdmin?: boolean; callerOrg?: string | null; profileOrg?: string; profAtivo?: boolean; updRows?: number; roleErr?: boolean };
function setup(w: W) {
  const log: string[] = [];
  const mk = ((_u: string, key: string, _o?: unknown) => {
    const who = key === "anon" ? "caller" : "service";
    const q = (t: string) => { const st: Record<string, unknown> = { t };
      const c: any = { select: () => c, eq: () => c, update: (v: unknown) => { st.upd = v; log.push(`${who}:update:${t}`); return c; },
        insert: (v: unknown) => { log.push(`${who}:insert:${t}:${JSON.stringify(v)}`); return Promise.resolve({ error: w.roleErr ? { message: "x" } : null }); },
        maybeSingle: () => Promise.resolve({ data: { organization_id: w.profileOrg ?? "org-a", ativo: w.profAtivo ?? true }, error: null }),
        then: (r: any) => r({ data: Array.from({ length: w.updRows ?? 1 }, () => ({ user_id: "new" })), error: null }) }; return c; };
    return {
      auth: { getClaims: () => Promise.resolve({ data: { claims: { sub: "admin-a" } }, error: null }),
        admin: { createUser: (b: any) => { log.push(`${who}:createUser:${b.email_confirm}`); return Promise.resolve({ data: { user: { id: "new" } }, error: null }); },
                 deleteUser: () => { log.push(`${who}:deleteUser`); return Promise.resolve({ error: null }); } } },
      rpc: (fn: string) => { log.push(`${who}:rpc:${fn}`);
        if (fn === "has_role") return Promise.resolve(who === "caller" ? (w.callerAdminErr ? { data: null, error: { message: "e" } } : { data: w.callerAdmin ?? true, error: null }) : { data: w.serviceAdmin ?? false, error: null });
        if (fn === "h15_actor_organization") return Promise.resolve({ data: w.callerOrg === undefined ? "org-a" : w.callerOrg, error: null });
        return Promise.resolve({ data: null, error: { message: "unexpected" } }); },
      from: q,
    };
  }) as any;
  return { log, mk };
}
const body = { email: "qa@qa-fin.invalid", password: "Abcdef123456", nome: "QA", roles: ["aplicador"] };
const call = async (w: W, b: unknown = body, auth = "Bearer jwt") => { const s = setup(w);
  const r = await handler(new Request("http://x", { method: "POST", headers: auth ? { Authorization: auth } : {}, body: JSON.stringify(b) }), s.mk);
  return { status: r.status, j: await r.json(), log: s.log }; };
Deno.test("admin verificado no contexto do chamador mesmo com service has_role=false (bug HML)", async () => {
  const r = await call({ serviceAdmin: false }); eq(r.status, 200, "status");
  eq(r.log.filter((l) => l.includes("rpc:has_role")), ["caller:rpc:has_role"], "has_role só no chamador");
  eq(r.log.includes("caller:rpc:h15_actor_organization"), true, "h15 no chamador");
  eq(r.log.includes("service:createUser:true"), true, "auth criado sem e-mail (email_confirm)");
  eq(r.log.includes("service:update:profiles"), true, "profile org"); eq(r.log.some((l) => l.startsWith('service:insert:user_roles:[{"user_id":"new","role":"aplicador"}]')), true, "papel");
});
Deno.test("não-admin negado antes de criar Auth", async () => { const r = await call({ callerAdmin: false }); eq([r.status, r.j.error], [403, "Apenas administradores podem criar usuários"], "neg"); eq(r.log.some((l) => l.includes("createUser")), false, "sem auth"); });
Deno.test("erro de has_role falha fechado", async () => { const r = await call({ callerAdminErr: true }); eq(r.status, 403, "s"); eq(r.log.some((l) => l.includes("createUser")), false, "sem auth"); });
Deno.test("tenant do JWT divergente do perfil nega", async () => { const r = await call({ callerOrg: "org-b" }); eq([r.status, r.j.error], [403, "tenant_scope_required"], "neg"); eq(r.log.some((l) => l.includes("createUser")), false, "sem auth"); });
Deno.test("tenant do JWT ausente nega", async () => { const r = await call({ callerOrg: null }); eq(r.status, 403, "s"); });
Deno.test("perfil do ator inativo nega", async () => { const r = await call({ profAtivo: false }); eq([r.status, r.j.error], [403, "tenant_scope_required"], "neg"); });
for (const roles of [["parceiro_b2b"], ["parceiro_b2b_tecnico"], ["parceiro_b2b_financeiro"], ["cliente_produtor"]])
  Deno.test(`papel externo ${roles} continua negado`, async () => { const r = await call({}, { ...body, roles }); eq([r.status, r.j.error], [403, "tenant_role_unavailable"], "neg"); eq(r.log.some((l) => l.includes("createUser")), false, "sem auth"); });
Deno.test("superadmin reservado", async () => { const r = await call({}, { ...body, roles: ["superadmin"] }); eq([r.status, r.j.error], [403, "superadmin_role_reserved"], "neg"); });
Deno.test("partner_id em papel interno negado", async () => { const r = await call({}, { ...body, partner_id: "p" }); eq([r.status, r.j.error], [403, "tenant_link_scope_unavailable"], "neg"); });
Deno.test("sem bearer 401", async () => { const r = await call({}, body, ""); eq(r.status, 401, "s"); });
Deno.test("perfil não atualizado compensa Auth", async () => { const r = await call({ updRows: 0 }); eq([r.status, r.j.error], [400, "user_profile_provision_failed"], "s"); eq(r.log.includes("service:deleteUser"), true, "comp"); });
Deno.test("falha no papel compensa Auth", async () => { const r = await call({ roleErr: true }); eq([r.status, r.j.error], [400, "user_role_provision_failed"], "s"); eq(r.log.includes("service:deleteUser"), true, "comp"); });
