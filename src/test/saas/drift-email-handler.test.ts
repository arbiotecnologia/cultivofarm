import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { authorizeSuperadmin } from "../../../supabase/functions/platform-org-admin-email-change/auth";
import { classifyBeginError, parseEmailChangeBody } from "../../../supabase/functions/platform-org-admin-email-change/policy";
import { corsHeadersFor, handlePreflight, isTrustedOrigin } from "../../../supabase/functions/_shared/comunicacao/cors";
import { getSmtpConfigError, isRecipientAllowedInTestMode } from "../../../supabase/functions/_shared/comunicacao/adapters-types";

const state = vi.hoisted(() => ({
  serve: vi.fn(), getUser: vi.fn(), rpc: vi.fn(), getUserById: vi.fn(),
  generateLink: vi.fn(), updateUserById: vi.fn(), send: vi.fn(), runtime: vi.fn(),
}));

const actor = "33333333-3333-4333-8333-333333333333";
const target = "44444444-4444-4444-8444-444444444444";
const body = {
  invite_id: "11111111-1111-4111-8111-111111111111",
  idempotency_key: "22222222-2222-4222-8222-222222222222",
  new_email: "new@example.invalid", reason: "", confirm: true,
};
let handler: (request: Request) => Promise<Response>;

beforeEach(async () => {
  vi.resetAllMocks();
  vi.resetModules();
  vi.stubGlobal("Deno", {
    serve: (fn: typeof handler) => { handler = fn; },
    env: { get: (key: string) => key === "SUPABASE_URL" ? "https://swzpzcwiasxmjutrmvkm.supabase.co" : key === "SUPABASE_SERVICE_ROLE_KEY" ? "mock-not-a-secret" : undefined },
  });
  state.getUser.mockResolvedValue({ data: { user: { id: actor } }, error: null });
  state.rpc.mockImplementation(async (name: string) => {
    if (name === "is_platform_superadmin") return { data: true, error: null };
    if (name === "platform_begin_org_admin_email_change") return { data: {
      op_id: "operation-mock", user_id: target, old_email: "old@example.invalid", status: "requested", idempotent: false,
    }, error: null };
    if (name === "platform_claim_email_confirmation") return { data: "lease-mock", error: null };
    return { data: { status: "completed" }, error: null };
  });
  state.getUserById.mockResolvedValue({ data: { user: { email: "old@example.invalid" } }, error: null });
  state.runtime.mockResolvedValue({ DELIVERY_ENABLED: false, EMAIL_ENABLED: false });
  const source = readFileSync("supabase/functions/platform-org-admin-email-change/index.ts", "utf8")
    .replace(/^import .*;\n/gm, "")
    .replace("body: unknown", "body");
  runInNewContext(source, {
    Deno: { serve: (fn: typeof handler) => { handler = fn; }, env: { get: (key: string) => key === "SUPABASE_URL" ? "https://swzpzcwiasxmjutrmvkm.supabase.co" : "mock-not-a-secret" } },
    Response, authorizeSuperadmin, classifyBeginError, parseEmailChangeBody,
    corsHeadersFor, handlePreflight, isTrustedOrigin, getSmtpConfigError, isRecipientAllowedInTestMode,
    readWorkerEnv: vi.fn(), loadRuntimeConfig: state.runtime, sendEmail: state.send,
    getPlatformInviteRedirectUrl: () => "https://app.cultivofarm.com.br/reset-password",
    createClient: () => ({ auth: { getUser: state.getUser, admin: { getUserById: state.getUserById, generateLink: state.generateLink, updateUserById: state.updateUserById } }, rpc: state.rpc }),
  });
});
afterAll(() => vi.unstubAllGlobals());

function request(payload: Record<string, unknown> = body, authorization: string | null = "Bearer mock-token") {
  const headers: Record<string, string> = { "Content-Type": "application/json", Origin: "https://app.cultivofarm.com.br" };
  if (authorization) headers.Authorization = authorization;
  return new Request("https://swzpzcwiasxmjutrmvkm.supabase.co/functions/v1/platform-org-admin-email-change", {
    method: "POST", headers, body: JSON.stringify(payload),
  });
}
function noEffects() {
  expect(state.generateLink).not.toHaveBeenCalled();
  expect(state.send).not.toHaveBeenCalled();
  expect(state.updateUserById).not.toHaveBeenCalled();
}

describe("DRIFT-EMAIL — handler real com serviços exclusivamente mockados", () => {
  it("nega ausência de bearer antes de qualquer RPC", async () => {
    expect((await handler(request(body, null))).status).toBe(401);
    expect(state.rpc).not.toHaveBeenCalled(); noEffects();
  });
  it("nega bearer inválido sem begin", async () => {
    state.getUser.mockResolvedValue({ data: { user: null }, error: new Error("invalid") });
    expect((await handler(request())).status).toBe(401);
    expect(state.rpc).not.toHaveBeenCalled(); noEffects();
  });
  it("nega administrador tenant que não é superadmin", async () => {
    state.rpc.mockResolvedValue({ data: false, error: null });
    expect((await handler(request())).status).toBe(403);
    expect(state.rpc).toHaveBeenCalledTimes(1); noEffects();
  });
  it.each(["user_id", "organization_id"])("nega alvo forjado %s", async (key) => {
    expect((await handler(request({ ...body, [key]: target }))).status).toBe(403);
    expect(state.rpc).toHaveBeenCalledTimes(1); noEffects();
  });
  it("entrega OFF retorna 503 sem claim, links, atualização Auth ou envio", async () => {
    const response = await handler(request());
    expect(response.status).toBe(503);
    expect((await response.json()).code).toBe("delivery_not_ready");
    expect(state.rpc.mock.calls.map(call => call[0])).toEqual(["is_platform_superadmin", "platform_begin_org_admin_email_change"]);
    noEffects();
  });
  it("reconcile pendente não gera links nem conclui", async () => {
    expect((await handler(request({ ...body, action: "reconcile" }))).status).toBe(200);
    expect(state.rpc.mock.calls.map(call => call[0])).not.toContain("platform_complete_org_admin_email_change");
    noEffects();
  });
  it("concilia somente Auth já confirmado e mantém complete RPC como barreira", async () => {
    state.getUserById.mockResolvedValue({ data: { user: { email: body.new_email, new_email: "" } }, error: null });
    expect((await handler(request({ ...body, action: "reconcile" }))).status).toBe(200);
    expect(state.rpc).toHaveBeenCalledWith("platform_complete_org_admin_email_change", { p_actor_id: actor, p_op_id: "operation-mock" });
    noEffects();
  });
  it("falha de confirmação no complete não vira sucesso", async () => {
    state.getUserById.mockResolvedValue({ data: { user: { email: body.new_email } }, error: null });
    state.rpc.mockImplementation(async (name: string) => name === "is_platform_superadmin"
      ? { data: true, error: null }
      : name === "platform_begin_org_admin_email_change"
        ? { data: { op_id: "operation-mock", user_id: target }, error: null }
        : { data: null, error: new Error("email_confirmation_required") });
    expect((await handler(request({ ...body, action: "reconcile" }))).status).toBe(409); noEffects();
  });
  it("cancel é não suportado sem begin ou alteração administrativa", async () => {
    expect((await handler(request({ ...body, action: "cancel" }))).status).toBe(409);
    expect(state.rpc).toHaveBeenCalledTimes(1); noEffects();
  });
});