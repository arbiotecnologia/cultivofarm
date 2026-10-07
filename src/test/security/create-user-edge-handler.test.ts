import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import ts from "typescript";

// Executes the real entrypoint with isolated SDK/Deno mocks. No network/Auth calls.
const source = readFileSync("supabase/functions/create-user/index.ts", "utf8")
  .replace(/^import .*createClient.*;\s*/m, "");
const javascript = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText;

type Scenario = {
  authorized?: boolean; authorizationError?: boolean; oldJwt?: boolean;
  invalidJwt?: boolean; profileFailure?: boolean; roleFailure?: boolean;
  unexpected?: boolean; compensationFailure?: "returned" | "thrown";
  providerFailure?: string;
};

async function invoke(scenario: Scenario = {}, payload: Record<string, unknown> = {}) {
  const sentinel = "private-test-sentinel";
  const rpc = vi.fn(async () => ({
    data: !scenario.oldJwt && scenario.authorized !== false,
    error: scenario.authorizationError ? new Error(sentinel) : null,
  }));
  const createUser = vi.fn(async () => ({
    data: { user: { id: "created-user" } },
    error: scenario.providerFailure ? {
      code: scenario.providerFailure, message: sentinel,
      details: { email: sentinel, token: sentinel },
    } : null,
  }));
  const deleteUser = vi.fn(async () => {
    if (scenario.compensationFailure === "thrown") throw new Error(sentinel);
    return { error: scenario.compensationFailure === "returned" ? { code: sentinel, message: sentinel } : null };
  });
  const update = vi.fn(() => ({ eq: () => ({ select: async () => {
    if (scenario.unexpected) throw new Error(sentinel);
    return { data: scenario.profileFailure ? [] : [{ user_id: "created-user" }], error: null };
  } }) }));
  const insert = vi.fn(async () => ({ error: scenario.roleFailure ? new Error(sentinel) : null }));
  const elevatedRpc = vi.fn(() => { throw new Error("must-not-authorize-with-service-role"); });
  const scoped = {
    rpc,
    auth: { getClaims: vi.fn(async () => ({
      data: scenario.invalidJwt ? null : { claims: { sub: "actor", role: "authenticated", iat: scenario.oldJwt ? 1 : 2 } },
      error: scenario.invalidJwt ? new Error(sentinel) : null,
    })) },
  };
  const elevated = {
    rpc: elevatedRpc, auth: { admin: { createUser, deleteUser } },
    from: (table: string) => table === "profiles" ? {
      select: () => ({ eq: () => ({ maybeSingle: async () => ({
        data: { organization_id: "actor-org", ativo: true }, error: null,
      }) }) }), update,
    } : { insert },
  };
  const createClient = vi.fn((_url, _key, options) => options ? scoped : elevated);
  let handler: ((req: Request) => Promise<Response>) | undefined;
  const deno = { env: { get: () => "isolated-value" }, serve: (fn: typeof handler) => { handler = fn; } };
  const errorLog = vi.fn();
  new Function("Deno", "createClient", "console", javascript)(deno, createClient, { error: errorLog });
  if (!handler) throw new Error("handler_not_registered");
  const token = scenario.oldJwt ? "mock-old-jwt" : "mock-valid-jwt";
  const response = await handler(new Request("https://isolated.invalid", {
    method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ email: "test@example.invalid", password: "mock-password", nome: "Teste", role: "gestor", ...payload }),
  }));
  const body = await response.json();
  expect(JSON.stringify(body)).not.toContain(sentinel);
  expect(JSON.stringify(errorLog.mock.calls)).not.toContain(sentinel);
  expect(elevatedRpc).not.toHaveBeenCalled();
  expect(createClient.mock.calls[0]?.[2]).toEqual({ global: { headers: { Authorization: `Bearer ${token}` } } });
  return { response, body, rpc, createUser, deleteUser, update, insert, errorLog };
}

describe("create-user — handler real, SDK e Auth isolados", () => {
  it("erro sensível do provedor retorna somente código genérico e log fixo", async () => {
    const r = await invoke({ providerFailure: "private-test-sentinel" });
    expect(r.response.status).toBe(400);
    expect(r.body).toEqual({ error: "user_creation_failed" });
    expect(r.errorLog).toHaveBeenCalledExactlyOnceWith("create_user_auth_failed");
    expect(r.update).not.toHaveBeenCalled();
    expect(r.deleteUser).not.toHaveBeenCalled();
  });
  it.each(["email_exists", "user_already_exists"])("preserva código seguro de e-mail duplicado: %s", async (providerFailure) => {
    const r = await invoke({ providerFailure });
    expect(r.response.status).toBe(400);
    expect(r.body).toEqual({ error: "email_exists" });
    expect(r.errorLog).toHaveBeenCalledExactlyOnceWith("create_user_email_exists");
  });
  it("admin válido passa; sucesso só depois de profile/roles e não compensa", async () => {
    const r = await invoke();
    expect(r.response.status).toBe(200);
    expect(r.rpc).toHaveBeenCalledWith("has_role", { _user_id: "actor", _role: "administrador" });
    expect(r.createUser).toHaveBeenCalledOnce();
    expect(r.update).toHaveBeenCalledOnce();
    expect(r.insert).toHaveBeenCalledWith([{ user_id: "created-user", role: "gestor" }]);
    expect(r.deleteUser).not.toHaveBeenCalled();
  });
  it.each([{ oldJwt: true }, { authorized: false }, { authorizationError: true }])("nega fencing/false/erro antes de Auth: %j", async (scenario) => {
    const r = await invoke(scenario);
    expect(r.response.status).toBe(403);
    expect(r.createUser).not.toHaveBeenCalled();
  });
  it("JWT inválido é negado antes de has_role", async () => {
    const r = await invoke({ invalidJwt: true });
    expect(r.response.status).toBe(401);
    expect(r.rpc).not.toHaveBeenCalled();
    expect(r.createUser).not.toHaveBeenCalled();
  });
  it("organization_id forjado não altera organização derivada", async () => {
    const r = await invoke({}, { organization_id: "foreign-org" });
    expect(r.update).toHaveBeenCalledWith(expect.objectContaining({ organization_id: "actor-org" }));
    expect(r.response.status).toBe(200);
  });
  it.each(["superadmin", "unknown", "cliente_produtor", "parceiro_b2b"])("nega papel %s", async (role) => {
    const r = await invoke({}, { role });
    expect(r.response.status).toBe(403);
    expect(r.createUser).not.toHaveBeenCalled();
  });
  it.each([{ partner_id: "foreign-partner" }, { cliente_ids: ["foreign-client"] }])("vínculo fora do escopo falha fechado: %j", async (payload) => {
    const r = await invoke({}, payload);
    expect(r.body.error).toBe("tenant_link_scope_unavailable");
    expect(r.createUser).not.toHaveBeenCalled();
  });
  it.each([{ profileFailure: true }, { roleFailure: true }, { unexpected: true }])("falha após Auth compensa: %j", async (scenario) => {
    const r = await invoke(scenario);
    expect(r.response.status).toBe(scenario.unexpected ? 500 : 400);
    expect(r.deleteUser).toHaveBeenCalledExactlyOnceWith("created-user");
    if (scenario.unexpected) expect(r.body.error).toBe("user_creation_failed");
  });
  it.each(["returned", "thrown"] as const)("falha de compensação %s tem resposta/log seguro", async (compensationFailure) => {
    const r = await invoke({ unexpected: true, compensationFailure });
    expect(r.response.status).toBe(500);
    expect(r.body).toEqual({ error: "user_creation_failed" });
    expect(r.errorLog).toHaveBeenCalledWith("create_user_compensation_failed");
  });
});