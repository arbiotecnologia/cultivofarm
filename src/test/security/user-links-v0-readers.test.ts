import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import ts from "typescript";

const edgeSource = readFileSync("scripts/user-links-v0/list-portal-users.index.ts.review", "utf8").replace(/^import .*;\s*$/gm, "");
const edgeJs = ts.transpileModule(edgeSource, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
const actor = "00000000-0000-4000-8000-000000000001";
const client = "00000000-0000-4000-8000-000000000002";
type Link = { user_id: string; principal: boolean; is_active: boolean; revoked_at: string | null; valid_from: string | null; valid_until: string | null };
type Scenario = { changeTenant?: boolean; denyRole?: boolean; wrongClient?: boolean; revokeDuringIO?: boolean; foreignProfile?: boolean };

async function runEdge(link: Link, s: Scenario = {}) {
  let orgReads = 0;
  let linkReads = 0;
  const privileged = vi.fn();
  const makeQuery = (table: string, elevated: boolean) => {
    const filters: Array<(row: Record<string, unknown>) => boolean> = [];
    const query = {
      select: () => query,
      eq: (key: string, value: unknown) => { filters.push((row) => row[key] === value); return query; },
      is: (key: string, value: unknown) => { filters.push((row) => row[key] === value); return query; },
      in: (key: string, values: unknown[]) => { filters.push((row) => values.includes(row[key])); return query; },
      or: (expression: string) => {
        const [nullable, comparison] = expression.split(",");
        const [key, operation, ...stampParts] = comparison.split(".");
        const stamp = Date.parse(stampParts.join("."));
        if (nullable !== `${key}.is.null` || !Number.isFinite(stamp)) throw new Error("bad_temporal_filter");
        filters.push((row) => row[key] === null || (operation === "lte" ? Date.parse(String(row[key])) <= stamp : Date.parse(String(row[key])) >= stamp));
        return query;
      },
      maybeSingle: async () => ({ data: s.wrongClient ? null : { id: client }, error: null }),
      then: (resolve: (result: { data: Record<string, unknown>[]; error: null }) => unknown) => {
        if (elevated) privileged(table);
        let rows: Record<string, unknown>[] = [];
        if (table === "user_clientes") {
          linkReads += 1;
          rows = [{ ...link, cliente_id: client, revoked_at: s.revokeDuringIO && linkReads > 1 ? new Date().toISOString() : link.revoked_at }];
        }
        if (table === "profiles") rows = [{ id: actor, user_id: link.user_id, nome: "Fixture", email: "fixture@example.invalid", ativo: true, organization_id: s.foreignProfile ? "OTHER" : "AR" }];
        if (table === "user_roles") rows = [{ user_id: link.user_id, role: "cliente_produtor" }];
        return Promise.resolve(resolve({ data: rows.filter((row) => filters.every((filter) => filter(row))), error: null }));
      },
    };
    return query;
  };
  const anon = {
    auth: { getClaims: async () => ({ data: { claims: { sub: actor } }, error: null }) },
    rpc: async (name: string) => {
      if (name === "h15_actor_organization") { orgReads += 1; return { data: s.changeTenant && orgReads > 1 ? "OTHER" : "AR", error: null }; }
      return { data: !s.denyRole, error: null };
    },
    from: (table: string) => makeQuery(table, false),
  };
  const admin = { from: (table: string) => makeQuery(table, true), auth: { admin: { getUserById: async () => ({ data: { user: { last_sign_in_at: null } } }) } } };
  let handler: ((req: Request) => Promise<Response>) | undefined;
  new Function("Deno", "createClient", "corsHeadersFor", "handlePreflight", "isTrustedOrigin", "console", edgeJs)(
    { env: { get: (key: string) => key === "SUPABASE_URL" ? "https://swzpzcwiasxmjutrmvkm.supabase.co" : "mock-key" }, serve: (fn: typeof handler) => { handler = fn; } },
    (_url: string, _key: string, options: { global?: unknown }) => options.global ? anon : admin,
    () => ({}), () => new Response(null), () => true, { error: vi.fn() },
  );
  if (!handler) throw new Error("handler_missing");
  const response = await handler(new Request("https://isolated.invalid", { method: "POST", headers: { Authorization: "Bearer mock" }, body: JSON.stringify({ cliente_id: client, organization_id: "forged" }) }));
  return { status: response.status, body: await response.json(), privileged };
}

const valid: Link = { user_id: actor, principal: true, is_active: true, revoked_at: null, valid_from: "2020-01-01T00:00:00Z", valid_until: null };
describe("V0 — Edge candidata executada, SDK/identidade isolados", () => {
  it("aceita ativo vigente no tenant derivado, ignora tenant do payload", async () => {
    const result = await runEdge(valid);
    expect(result.status).toBe(200);
    expect(result.body.users.map((row: { user_id: string }) => row.user_id)).toEqual([actor]);
  });
  it.each([
    { is_active: false }, { revoked_at: "2020-01-01T00:00:00Z" },
    { valid_from: "2999-01-01T00:00:00Z" }, { valid_until: "2020-01-01T00:00:00Z" },
  ])("nega membership histórica %j antes de ler profiles/Auth", async (delta) => {
    const result = await runEdge({ ...valid, ...delta });
    expect(result.body.users).toEqual([]);
    expect(result.privileged.mock.calls.map(([table]) => table)).toEqual(["user_clientes"]);
  });
  it("nega cliente estrangeiro antes do serviço", async () => {
    const result = await runEdge(valid, { wrongClient: true });
    expect(result.status).toBe(404); expect(result.privileged).not.toHaveBeenCalled();
  });
  it("nega role não autorizada antes do serviço", async () => {
    const result = await runEdge(valid, { denyRole: true });
    expect(result.status).toBe(403); expect(result.privileged).not.toHaveBeenCalled();
  });
  it("revalida tenant depois do IO", async () => {
    expect((await runEdge(valid, { changeTenant: true })).status).toBe(403);
  });
  it("retira membership revogada durante IO da resposta", async () => {
    expect((await runEdge(valid, { revokeDuringIO: true })).body.users).toEqual([]);
  });
  it("não enriquece profile estrangeiro", async () => {
    const result = await runEdge(valid, { foreignProfile: true });
    expect(result.body.users).toEqual([]);
    expect(result.privileged).not.toHaveBeenCalledWith("user_roles");
  });
});

const page = ts.createSourceFile("ConsultorTecnico.tsx", readFileSync("src/pages/ConsultorTecnico.tsx", "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let queryFunction: ts.Node | undefined;
function visit(node: ts.Node) {
  if (ts.isObjectLiteralExpression(node) && node.properties.some((prop) => ts.isPropertyAssignment(prop) && prop.name.getText(page) === "queryKey" && prop.initializer.getText(page).includes('"consultor-clientes"'))) {
    const prop = node.properties.find((item) => ts.isPropertyAssignment(item) && item.name.getText(page) === "queryFn");
    if (prop && ts.isPropertyAssignment(prop)) queryFunction = prop.initializer;
  }
  ts.forEachChild(node, visit);
}
visit(page);
if (!queryFunction) throw new Error("consultor_query_not_found");
const queryJs = ts.transpileModule(`const fn = ${queryFunction.getText(page)};`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
describe("V0 — queryFn real usado pela tela ConsultorTecnico", () => {
  it("só consulta vínculos dos IDs autorizados pelo resolver live", async () => {
    const inIds = vi.fn();
    const from = vi.fn((table: string) => {
      const rows = table === "user_clientes" ? [{ cliente_id: client, principal: true }] : [{ id: client, nome: "Cliente", nome_fantasia: null }];
      const q = { select: () => q, eq: () => q, in: (_key: string, values: string[]) => { inIds(values); return q; }, order: () => q, then: (resolve: (value: unknown) => unknown) => Promise.resolve(resolve({ data: rows, error: null })) };
      return q;
    });
    const rpc = vi.fn(async function (this: unknown) { expect(this).toBe(sdk); return { data: [client], error: null }; });
    const sdk = { rpc, from };
    const fn = new Function("supabase", "selected", "idsUnicos", `${queryJs}; return fn;`)(sdk, { user_id: actor }, (ids: string[]) => [...new Set(ids)]);
    expect(await fn()).toEqual([{ id: client, nome: "Cliente", principal: true }]);
    expect(rpc).toHaveBeenCalledWith("get_cliente_ids_for_user", { _user_id: actor });
    expect(inIds.mock.calls).toEqual([[[client]], [[client]]]);
  });
  it.each([{ data: [], error: null }, { data: null, error: new Error("scope_failed") }])("vazio/erro do resolver nunca usa fallback histórico %j", async (result) => {
    const from = vi.fn();
    const fn = new Function("supabase", "selected", "idsUnicos", `${queryJs}; return fn;`)({ rpc: async () => result, from }, { user_id: actor }, () => []);
    if (result.error) await expect(fn()).rejects.toThrow("scope_failed"); else expect(await fn()).toEqual([]);
    expect(from).not.toHaveBeenCalled();
  });
});