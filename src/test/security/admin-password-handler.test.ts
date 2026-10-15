import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { senhaValida } from "@/lib/configuracoes/usuariosValidation";

const source = readFileSync("supabase/functions/admin-update-user-password/index.ts", "utf8").replace(/^import .*createClient.*;\s*/m, "");
const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
const actor = "11111111-1111-4111-8111-111111111111";
const target = "22222222-2222-4222-8222-222222222222";
type Scenario = { role?: string; scope?: boolean | null; roleError?: boolean; scopeError?: boolean; thrown?: boolean; jwt?: "missing" | "invalid"; updateError?: boolean; auditError?: boolean };

async function run(s: Scenario = {}, password: unknown = "mockPass123", payload: Record<string, unknown> = {}) {
  const secret = "private-error-sentinel";
  const rpc = vi.fn(async (name: string) => {
    if (s.thrown) throw new Error(secret);
    return name === "has_role"
      ? { data: (s.role ?? "administrador") === "administrador", error: s.roleError ? { message: secret } : null }
      : { data: s.scope === undefined ? true : s.scope, error: s.scopeError ? { message: secret } : null };
  });
  const update = vi.fn(async () => ({ error: s.updateError ? { message: secret } : null }));
  const insert = vi.fn(async () => ({ error: s.auditError ? { code: secret, message: secret } : null }));
  const elevatedRpc = vi.fn(() => { throw new Error("service_must_not_authorize"); });
  const from = vi.fn(() => ({ insert }));
  const createClient = vi.fn((_url, _key, options) => options
    ? { rpc, auth: { getUser: async () => ({ data: { user: s.jwt === "invalid" ? null : { id: actor } }, error: s.jwt === "invalid" ? { message: secret } : null }) } }
    : { rpc: elevatedRpc, auth: { admin: { updateUserById: update } }, from });
  const log = vi.fn();
  let handler: ((req: Request) => Promise<Response>) | undefined;
  new Function("Deno", "createClient", "console", js)({
    env: { get: (key: string) => key === "SUPABASE_URL" ? "https://swzpzcwiasxmjutrmvkm.supabase.co" : "mock-key" },
    serve: (fn: typeof handler) => { handler = fn; },
  }, createClient, { error: log });
  if (!handler) throw new Error("missing_handler");
  const response = await handler(new Request("https://isolated.invalid", { method: "POST",
    headers: s.jwt === "missing" ? {} : { Authorization: "Bearer mock-jwt" },
    body: JSON.stringify({ user_id: target, new_password: password, ...payload }),
  }));
  const body = await response.json();
  const publicOutput = JSON.stringify([body, log.mock.calls, insert.mock.calls]);
  expect(publicOutput).not.toContain(secret);
  if (typeof password === "string" && password.length > 0) expect(publicOutput).not.toContain(password);
  expect(elevatedRpc).not.toHaveBeenCalled();
  return { response, body, rpc, update, insert, from, createClient, log };
}

describe("admin password — handler real, JWT/SDK isolados, zero rede", () => {
  it("admin no próprio tenant atualiza somente password e audita identidade", async () => {
    const r = await run();
    expect(r.response.status).toBe(200);
    expect(r.body).toEqual({ success: true });
    expect(r.rpc.mock.calls.map(([name]) => name)).toEqual(["has_role", "admin_can_update_user_password_server"]);
    expect(r.createClient.mock.calls[0]?.[2]).toEqual({ global: { headers: { Authorization: "Bearer mock-jwt" } } });
    expect(r.update).toHaveBeenCalledExactlyOnceWith(target, { password: "mockPass123" });
    expect(r.from).toHaveBeenCalledWith("audit_senha_log");
    expect(r.insert).toHaveBeenCalledExactlyOnceWith({ executor_id: actor, target_user_id: target });
  });
  it.each(["financeiro", "parceiro_b2b", "cliente_produtor", "superadmin"])("%s não pode atualizar", async (role) => {
    const r = await run({ role });
    expect(r.response.status).toBe(403);
    expect(r.update).not.toHaveBeenCalled();
    expect(r.insert).not.toHaveBeenCalled();
  });
  it.each(["outra empresa", "alvo superadmin", "ator inativo", "ator não pronto", "tenant revogado"])("scope negado: %s", async () => {
    // Existing server RPC owns these predicates; mocks prove Edge obeys its denial, not hosted RBAC.
    const r = await run({ scope: false });
    expect(r.response.status).toBe(403);
    expect(r.body.code).toBe("ADMIN_PASSWORD_FORBIDDEN");
    expect(r.update).not.toHaveBeenCalled();
    expect(r.insert).not.toHaveBeenCalled();
  });
  it.each(["missing", "invalid"] as const)("JWT %s fecha antes de RPC/Auth update", async (jwt) => {
    const r = await run({ jwt });
    expect(r.response.status).toBe(401);
    expect(r.rpc).not.toHaveBeenCalled();
    expect(r.update).not.toHaveBeenCalled();
  });
  it.each([{ roleError: true }, { scopeError: true }, { thrown: true }])("erro interno é distinguível, sem update: %j", async (s) => {
    const r = await run(s);
    expect(r.response.status).toBe(500);
    expect(r.body.code).toMatch(/^ADMIN_PASSWORD_(AUTHORIZATION_ERROR|INTERNAL_ERROR)$/);
    expect(r.update).not.toHaveBeenCalled();
    expect(r.insert).not.toHaveBeenCalled();
  });
  it("resposta scope NULL falha fechada", async () => {
    const r = await run({ scope: null });
    expect(r.response.status).toBe(403);
    expect(r.update).not.toHaveBeenCalled();
  });
  it.each(["Abc1234", "abcdefgh", "12345678", "a1" + "x".repeat(127), "", null, 12345678])("senha inválida %j impede escrita", async (password) => {
    const r = await run({}, password);
    expect(r.response.status).toBe(400);
    expect(r.body.code).toBe("ADMIN_PASSWORD_INVALID_PASSWORD");
    expect(r.update).not.toHaveBeenCalled();
  });
  it.each(["Abc12345", "á1234567", "a1" + "x".repeat(126)])("8–128 letra+número coerente com frontend %j", async (password) => {
    expect(senhaValida(password)).toBe(true);
    expect((await run({}, password)).response.status).toBe(200);
  });
  it("alvo inválido não chega ao scope nem Auth", async () => {
    const r = await run({}, "mockPass123", { user_id: "bad-id" });
    expect(r.response.status).toBe(400);
    expect(r.update).not.toHaveBeenCalled();
    expect(r.rpc).toHaveBeenCalledTimes(1);
  });
  it("falha Auth não audita sucesso nem devolve erro bruto", async () => {
    const r = await run({ updateError: true });
    expect(r.response.status).toBe(500);
    expect(r.body.code).toBe("ADMIN_PASSWORD_UPDATE_FAILED");
    expect(r.insert).not.toHaveBeenCalled();
  });
  it("mantém sucesso após atualização se auditoria falha, log fixo seguro", async () => {
    const r = await run({ auditError: true });
    expect(r.response.status).toBe(200);
    expect(r.log).toHaveBeenCalledExactlyOnceWith("admin_password_audit_failed");
  });
});