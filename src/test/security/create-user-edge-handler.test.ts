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
  preflightFailure?: boolean; preflightOrg?: string;
  b2bOpen?: boolean; claimFailure?: boolean; claimStatus?: string; acquired?: boolean;
  finishFailure?: boolean; finishThrown?: boolean; uncertainCompleted?: boolean;
  compensationRpcFailure?: boolean; compensationFinishFailure?: boolean;
  authLookupMismatch?: boolean;
};

async function invoke(scenario: Scenario = {}, payload: Record<string, unknown> = {}) {
  const sentinel = "private-test-sentinel";
  const rpc = vi.fn(async (name: string, args: Record<string, string>) => name === "b2b_claim_provisioning" ? ({
    data: { claim_id: "receipt", fence: "fence", user_id: "created-user", organization_id: "actor-org",
      status: scenario.claimStatus ?? "claimed", lease_valid: true, acquired: scenario.acquired !== false },
    error: scenario.claimFailure ? new Error(sentinel) : null,
  }) : name === "b2b_provisioning_preflight" ? ({
    data: { organization_id: scenario.preflightOrg ?? "actor-org", partner_id: args.p_partner, role: args.p_role, papel: args.p_papel, enabled: true },
    error: scenario.preflightFailure ? new Error(sentinel) : null,
  }) : ({
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
  const elevatedRpc = vi.fn(async (name: string) => {
    if (name === "b2b_finish_provisioning") {
      if (scenario.finishThrown) throw new Error(sentinel);
      return { data: { success: !scenario.finishFailure }, error: scenario.finishFailure ? new Error(sentinel) : null };
    }
    if (name === "b2b_prepare_provisioning_compensation") return {
      data: scenario.uncertainCompleted ? "completed" : "compensating",
      error: scenario.compensationRpcFailure ? new Error(sentinel) : null,
    };
    if (name === "b2b_complete_provisioning_compensation") return {
      data: !scenario.compensationFinishFailure, error: scenario.compensationFinishFailure ? new Error(sentinel) : null,
    };
    throw new Error("must-not-authorize-with-service-role");
  });
  const scoped = {
    rpc,
    auth: { getClaims: vi.fn(async () => ({
      data: scenario.invalidJwt ? null : { claims: { sub: "actor", role: "authenticated", iat: scenario.oldJwt ? 1 : 2 } },
      error: scenario.invalidJwt ? new Error(sentinel) : null,
    })) },
  };
  const elevated = {
    rpc: elevatedRpc, auth: { admin: { createUser, deleteUser, getUserById: vi.fn(async () => ({
      data: { user: { id: scenario.authLookupMismatch ? "foreign" : "created-user", email: "test@example.invalid",
        user_metadata: { b2b_provisioning_receipt: "receipt" } } }, error: null,
    })) } },
    from: (table: string) => table === "profiles" ? {
      select: () => ({ eq: () => ({ maybeSingle: async () => ({
        data: { organization_id: "actor-org", ativo: true }, error: null,
      }) }) }), update,
    } : { insert },
  };
  const createClient = vi.fn((_url, _key, options) => options ? scoped : elevated);
  let handler: ((req: Request) => Promise<Response>) | undefined;
  const deno = { env: { get: (name: string) => name === "SUPABASE_URL" ? "https://swzpzcwiasxmjutrmvkm.supabase.co" : "isolated-value" }, serve: (fn: typeof handler) => { handler = fn; } };
  const errorLog = vi.fn();
  new Function("Deno", "createClient", "console", scenario.b2bOpen
    ? javascript.replace("const B2B_PROVISIONING_CHANNELS_REVIEWED = false", "const B2B_PROVISIONING_CHANNELS_REVIEWED = true")
    : javascript)(deno, createClient, { error: errorLog });
  if (!handler) throw new Error("handler_not_registered");
  const token = scenario.oldJwt ? "mock-old-jwt" : "mock-valid-jwt";
  const response = await handler(new Request("https://isolated.invalid", {
    method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ email: "test@example.invalid", password: "mock-password1", nome: "Teste", role: "gestor", ...payload }),
  }));
  const body = await response.json();
  expect(JSON.stringify(body)).not.toContain(sentinel);
  expect(JSON.stringify(errorLog.mock.calls)).not.toContain(sentinel);
  expect(elevatedRpc.mock.calls.every(([name]) => name.startsWith("b2b_"))).toBe(true);
  expect(createClient.mock.calls[0]?.[2]).toEqual({ global: { headers: { Authorization: `Bearer ${token}` } } });
  return { response, body, rpc, elevatedRpc, createUser, deleteUser, update, insert, errorLog };
}

describe("create-user — handler real, SDK e Auth isolados", () => {
  const partnerId = "11111111-1111-4111-8111-111111111111";
  it("validates commercial preflight with caller bearer but never opens Auth via a remote flag", async () => {
    const r = await invoke({}, { role: "parceiro_b2b", partner_id: partnerId, password: undefined });
    expect(r.rpc).toHaveBeenCalledWith("b2b_provisioning_preflight", { p_partner: partnerId, p_role: "parceiro_b2b", p_papel: "gestor" });
    expect(r.response.status).toBe(503);
    expect(r.createUser).not.toHaveBeenCalled();
  });
  it.each([{ preflightFailure: true }, { preflightOrg: "foreign" }])("rejects unauthorized owner preflight: %j", async (scenario) => {
    const r = await invoke(scenario, { role: "parceiro_b2b", partner_id: partnerId });
    expect(r.response.status).toBe(403); expect(r.createUser).not.toHaveBeenCalled();
  });
  it.each([
    { role: "parceiro_b2b", roles: ["parceiro_b2b", "gestor"] },
    { role: "parceiro_b2b", roles: ["parceiro_b2b", "parceiro_b2b"] },
    { role: "parceiro_b2b", partner_papel: "tecnico" },
    { role: "gestor", roles: ["parceiro_b2b"] },
    { role: "parceiro_b2b", cliente_ids: ["other"] },
  ])("rejects extras/mismatch before preflight: %j", async (payload) => {
    const r = await invoke({}, { partner_id: partnerId, ...payload });
    expect(r.response.status).toBe(403);
    expect(r.rpc.mock.calls.map(c => c[0])).toEqual(["has_role"]);
    expect(r.createUser).not.toHaveBeenCalled();
  });
  it.each([
    ["seis letras", "abcdef"],
    ["oito letras sem número", "abcdefgh"],
    ["oito números sem letra", "12345678"],
    ["130 caracteres", "a1".repeat(65)],
    ["sete caracteres com letra e número", "abcde12"],
    ["129 caracteres", "a1".repeat(64) + "a"],
  ])("nega senha inválida antes de createUser: %s", async (_label, password) => {
    const r = await invoke({}, { password });
    expect(r.response.status).toBe(400);
    expect(r.createUser).not.toHaveBeenCalled();
    expect(r.update).not.toHaveBeenCalled();
    expect(r.insert).not.toHaveBeenCalled();
    expect(r.deleteUser).not.toHaveBeenCalled();
    expect(JSON.stringify(r.body)).not.toContain(password);
    expect(JSON.stringify(r.errorLog.mock.calls)).not.toContain(password);
  });
  it.each([
    ["limite inferior 8", "abcdefg1"],
    ["limite superior 128", "a1".repeat(64)],
    ["letra acentuada da regra existente", "á2345678"],
  ])("aceita a regra existente: %s", async (_label, password) => {
    const r = await invoke({}, { password });
    expect(r.response.status).toBe(200);
    expect(r.createUser).toHaveBeenCalledOnce();
    expect(r.createUser).toHaveBeenCalledWith(expect.objectContaining({ password }));
    expect(JSON.stringify(r.body)).not.toContain(password);
    expect(JSON.stringify(r.errorLog.mock.calls)).not.toContain(password);
  });
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
  const b2bPayload = { role: "parceiro_b2b", partner_id: partnerId, password: undefined,
    idempotency_key: "55555555-5555-4555-8555-555555555555" };
  it("executes claim → reserved Auth without password/send → transactional finish in an isolated open gate", async () => {
    const r = await invoke({ b2bOpen: true }, b2bPayload);
    expect(r.response.status).toBe(200);
    expect(r.createUser).toHaveBeenCalledExactlyOnceWith({ id: "created-user", email: "test@example.invalid",
      email_confirm: false, user_metadata: { nome: "Teste", b2b_provisioning_receipt: "receipt" } });
    expect(r.elevatedRpc).toHaveBeenCalledExactlyOnceWith("b2b_finish_provisioning", { p_claim: "receipt", p_fence: "fence", p_user: "created-user" });
    expect(r.update).not.toHaveBeenCalled(); expect(r.insert).not.toHaveBeenCalled();
    expect(r.deleteUser).not.toHaveBeenCalled();
    expect(r.body).toEqual({ success: true, user_id: "created-user", first_access_pending: true });
  });
  it.each([{ claimFailure: true }, { acquired: false }, { claimStatus: "compensating" }])("claim conflict/busy prevents Auth: %j", async scenario => {
    const r = await invoke({ b2bOpen: true, ...scenario }, b2bPayload);
    expect(r.response.status).toBe(409); expect(r.createUser).not.toHaveBeenCalled();
  });
  it("completed idempotent replay never creates Auth again", async () => {
    const r = await invoke({ b2bOpen: true, claimStatus: "completed" }, b2bPayload);
    expect(r.response.status).toBe(200); expect(r.createUser).not.toHaveBeenCalled();
    expect(r.body.replay).toBe(true);
  });
  it.each([{ finishFailure: true }, { finishThrown: true }])("finish failure compensates only after fenced reconciliation: %j", async scenario => {
    const r = await invoke({ b2bOpen: true, ...scenario }, b2bPayload);
    expect(r.response.status).toBe(409); expect(r.deleteUser).toHaveBeenCalledExactlyOnceWith("created-user");
    expect(r.elevatedRpc.mock.calls.map(([name]) => name)).toEqual([
      "b2b_finish_provisioning", "b2b_prepare_provisioning_compensation", "b2b_complete_provisioning_compensation",
    ]);
  });
  it("lost finish response with completed receipt must not delete committed identity", async () => {
    const r = await invoke({ b2bOpen: true, finishFailure: true, uncertainCompleted: true }, b2bPayload);
    expect(r.response.status).toBe(200); expect(r.deleteUser).not.toHaveBeenCalled();
  });
  it("uncertain compensation state never deletes Auth", async () => {
    const r = await invoke({ b2bOpen: true, finishFailure: true, compensationRpcFailure: true }, b2bPayload);
    expect(r.response.status).toBe(503); expect(r.deleteUser).not.toHaveBeenCalled();
  });
  it.each([{ compensationFailure: "returned" as const }, { compensationFinishFailure: true }])("failed cleanup remains pending: %j", async scenario => {
    const r = await invoke({ b2bOpen: true, finishFailure: true, ...scenario }, b2bPayload);
    expect(r.response.status).toBe(503);
  });
  it("never adopts or deletes unrelated Auth on create conflict", async () => {
    const r = await invoke({ b2bOpen: true, providerFailure: "email_exists", authLookupMismatch: true }, b2bPayload);
    expect(r.response.status).toBe(409); expect(r.deleteUser).not.toHaveBeenCalled();
    expect(r.elevatedRpc).not.toHaveBeenCalled();
  });
  it("converges on reserved identity after uncertain create response", async () => {
    const r = await invoke({ b2bOpen: true, providerFailure: "user_already_exists" }, b2bPayload);
    expect(r.response.status).toBe(200); expect(r.deleteUser).not.toHaveBeenCalled();
  });
  it.each([{ password: "operator-password1" }, { role: "parceiro_b2b_tecnico" }, { idempotency_key: null }])("denies operator password/technical role/missing key: %j", async payload => {
    const r = await invoke({ b2bOpen: true }, { ...b2bPayload, ...payload });
    expect(r.response.status).toBe(payload.role ? 403 : 400); expect(r.createUser).not.toHaveBeenCalled();
  });
});