import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { createHash } from "node:crypto";
import { f4RequestSchema, mapRpcError } from "../../../scripts/smtp-tenant-candidate/f4/contract";
import { createF4Handler, type F4Deps } from "../../../scripts/smtp-tenant-candidate/f4/handler";
import { dispatchF4 } from "../../../scripts/smtp-tenant-candidate/f4/dispatch";
import { generateCode, hashCode } from "../../../scripts/smtp-tenant-candidate/f4/challenge-code";
import { TENANT_SMTP_F4_PHASE, tenantSmtpTransport, type F4Result, type F4Status, type F4Request } from "@/lib/configuracoes/tenantSmtp";
import TenantSenderVerification from "@/pages/configuracoes/TenantSenderVerification";

const ID = "11111111-1111-4111-8111-111111111111", FENCE = "22222222-2222-4222-8222-222222222222", KEY = "33333333-3333-4333-8333-333333333333";
const status = (o: Partial<F4Status> = {}): F4Status => ({ version: 1, sender_verified: false, active: false, dispatch_enabled: false, challenge: null, ...o });
const deps = (): F4Deps => ({ canonicalUrl: "https://swzpzcwiasxmjutrmvkm.supabase.co", reviewed: true, transportProven: true,
 client: () => ({ auth: { getUser: vi.fn(async () => ({ data: { user: { id: "actor" } }, error: null })) }, rpc: vi.fn(async () => ({ data: { version: 1 }, error: null })) }),
 trustedOrigin: o => o === "https://app.cultivofarm.com.br", cors: () => ({}), execute: vi.fn(async () => ({ code: "F4_STATUS" as const, status: status() })) });
const req = (body: unknown, q = "?op=sender") => new Request("https://local.test/" + q, { method: "POST", headers: { Authorization: "Bearer synthetic", Origin: "https://app.cultivofarm.com.br" }, body: JSON.stringify(body) });

describe("F4 contract/handler", () => {
 it("production phase closed and transport absent", () => { expect(TENANT_SMTP_F4_PHASE).toBe(false); expect(tenantSmtpTransport.sender).toBeUndefined(); });
 it.each(["organization_id", "tenant", "to", "recipient", "host", "from_email", "password", "actor"])("rejects forged %s", async k => {
  const d = deps(); const r = await createF4Handler(d)(req({ op: "challenge", expected_version: 1, idempotency_key: KEY, [k]: "x" })); expect(r.status).toBe(400); expect(d.execute).not.toHaveBeenCalled(); });
 it("code never accepted in query string", async () => { const d = deps(); expect((await createF4Handler(d)(req({ op: "status" }, "?op=sender&code=12345678"))).status).toBe(400); expect(d.execute).not.toHaveBeenCalled(); });
 it("activation requires explicit confirm", () => { expect(f4RequestSchema.safeParse({ op: "activation", expected_version: 1, active: true }).success).toBe(false); });
 it("code must be exactly 8 digits", () => { for (const c of ["1234567", "123456789", "abcdefgh"]) expect(f4RequestSchema.safeParse({ op: "confirm", expected_version: 1, challenge_id: ID, code: c }).success).toBe(false); });
 it("closed review returns 503 before auth", async () => { const d = { ...deps(), reviewed: false }; expect((await createF4Handler(d)(req({ op: "status" }))).status).toBe(503); expect(d.execute).not.toHaveBeenCalled(); });
 it.each(["superadmin", "financeiro", "consultor", "b2b", "produtor"])("scope denied %s", async () => {
  const d = deps(); d.client = () => ({ auth: { getUser: async () => ({ data: { user: { id: "a" } }, error: null }) }, rpc: async () => ({ data: null, error: { code: "42501", message: "raw" } }) });
  expect((await createF4Handler(d)(req({ op: "status" }))).status).toBe(403); expect(d.execute).not.toHaveBeenCalled(); });
 it("revoked actor gets no late result", async () => { const d = deps(); const rpc = vi.fn().mockResolvedValueOnce({ data: { v: 1 }, error: null }).mockResolvedValueOnce({ data: { v: 2 }, error: null });
  d.client = () => ({ auth: { getUser: async () => ({ data: { user: { id: "a" } }, error: null }) }, rpc }); expect((await createF4Handler(d)(req({ op: "status" }))).status).toBe(403); });
 it("raw exceptions sanitized", async () => { const d = deps(); d.execute = async () => { throw new Error("AUTH secret 12345678"); }; const r = await createF4Handler(d)(req({ op: "status" })); expect(await r.text()).toBe('{"code":"SMTP_INTERNAL"}'); });
 it("raw RPC messages never surface", () => { expect(mapRpcError({ message: "duplicate key secret" })).toBe("SMTP_INTERNAL"); expect(mapRpcError({ message: "SMTP_QUOTA" })).toBe("SMTP_QUOTA"); });
});

describe("F4 challenge code", () => {
 it("hash matches SQL construction", async () => { const salt = "ab".repeat(16); expect(await hashCode(salt, ID, "12345678")).toBe(createHash("sha256").update(`${salt}:${ID}:12345678`).digest("hex")); });
 it("rejection sampling avoids bias region", () => { const seq = [4_100_000_000, 7]; let i = 0; expect(generateCode(b => { b[0] = seq[i++]; return b; })).toBe("00000007"); });
});

describe("F4 dispatch", () => {
 const mk = (claimData: unknown, extra: Record<string, unknown> = {}) => {
  const client = { auth: { getUser: vi.fn() }, rpc: vi.fn(async (n: string) => n === "tenant_smtp_sender_challenge_claim" ? { data: claimData, error: null } : { data: extra[n] ?? null, error: null }) };
  const service = { auth: { getUser: vi.fn() }, rpc: vi.fn(async (n: string) => n === "tenant_smtp_sender_challenge_prepare" ? { data: { version: 1, recipient: "sender@provider.com", config: { host: "smtp.provider.com", port: 465, tls_mode: "implicit_tls", username: "u", from_email: "sender@provider.com", reply_to: "", from_name: "X" }, password: "synthetic" }, error: null } : { data: { code: "challenge_sent", version: 1, dispatch_enabled: false }, error: null }) };
  return { client, service };
 };
 it("replay never prepares or sends", async () => { const { client, service } = mk({ replay: true, challenge_id: ID, state: "sent", version: 1 }); const send = vi.fn();
  expect((await dispatchF4("actor", client, service, { op: "challenge", expected_version: 1, idempotency_key: KEY }, {} as never, send)).code).toBe("challenge_sent"); expect(service.rpc).not.toHaveBeenCalled(); expect(send).not.toHaveBeenCalled(); });
 it("sends to server recipient; only hash reaches DB; code absent from result", async () => {
  const { client, service } = mk({ replay: false, challenge_id: ID, fence: FENCE }); let sent = "";
  const send = vi.fn(async (j: { recipient: string; code: string }) => { sent = j.code; expect(j.recipient).toBe("sender@provider.com"); return "challenge_sent" as const; });
  const r = await dispatchF4("actor", client, service, { op: "challenge", expected_version: 1, idempotency_key: KEY }, {} as never, send);
  expect(r).toEqual({ code: "challenge_sent" }); expect(JSON.stringify(service.rpc.mock.calls)).not.toContain(sent); expect(JSON.stringify(r)).not.toContain(sent); });
 it("ambiguous is recorded once, never retried", async () => { const { client, service } = mk({ replay: false, challenge_id: ID, fence: FENCE }); const send = vi.fn(async () => "challenge_ambiguous" as const);
  expect((await dispatchF4("actor", client, service, { op: "challenge", expected_version: 1, idempotency_key: KEY }, {} as never, send)).code).toBe("challenge_ambiguous"); expect(send).toHaveBeenCalledTimes(1);
  expect(service.rpc.mock.calls.filter(c => c[0] === "tenant_smtp_sender_challenge_finish")).toHaveLength(1); });
 it("thrown transport counts as ambiguous, not resend", async () => { const { client, service } = mk({ replay: false, challenge_id: ID, fence: FENCE }); const send = vi.fn(async () => { throw new Error("x"); });
  expect((await dispatchF4("actor", client, service, { op: "challenge", expected_version: 1, idempotency_key: KEY }, {} as never, send)).code).toBe("challenge_ambiguous"); expect(send).toHaveBeenCalledTimes(1); });
 it("confirm passes code only as RPC arg", async () => { const { client, service } = mk(null, { tenant_smtp_sender_challenge_confirm: { code: "SENDER_CHALLENGE_MISMATCH", attempts_left: 3 } });
  expect(await dispatchF4("actor", client, service, { op: "confirm", expected_version: 1, challenge_id: ID, code: "00000000" }, {} as never)).toEqual({ code: "SENDER_CHALLENGE_MISMATCH", attempts_left: 3 }); expect(service.rpc).not.toHaveBeenCalled(); });
 it("activation status cannot claim dispatch", async () => { const { client, service } = mk(null, { tenant_smtp_activation_set: { ...status({ active: true, sender_verified: true }), dispatch_enabled: true as unknown as false } });
  await expect(dispatchF4("actor", client, service, { op: "activation", expected_version: 1, active: true, confirm: true }, {} as never)).rejects.toThrow(); });
});

describe("F4 UI", () => {
 const sent = status({ challenge: { id: ID, state: "sent", expires_at: null, attempts_left: 5 } });
 it("code cleared before IO and double click single request", async () => {
  let resolve!: (v: F4Result) => void; const send = vi.fn(async (i: F4Request) => i.op === "confirm" ? new Promise<F4Result>(r => { resolve = r; }) : { code: "F4_STATUS" as const, status: sent });
  render(<TenantSenderVerification version={1} connectionReady blocked={false} send={send} />);
  const input = await screen.findByLabelText("Código recebido"); fireEvent.change(input, { target: { value: "12345678" } });
  const btn = screen.getByRole("button", { name: "Confirmar código" }); fireEvent.click(btn); fireEvent.click(btn);
  expect((input as HTMLInputElement).value).toBe(""); expect(send.mock.calls.filter(c => c[0].op === "confirm")).toHaveLength(1);
  await act(async () => resolve({ code: "SENDER_VERIFIED" })); });
 it("late response after unmount (identity change) is discarded", async () => {
  let resolve!: (v: F4Result) => void; const send = vi.fn(() => new Promise<F4Result>(r => { resolve = r; }));
  const { unmount } = render(<TenantSenderVerification version={1} connectionReady blocked={false} send={send} />); unmount();
  await act(async () => resolve({ code: "F4_STATUS", status: status({ sender_verified: true }) })); expect(screen.queryByText("Remetente verificado")).toBeNull(); });
 it("challenge needs connection pass of same version", async () => { const send = vi.fn(async () => ({ code: "F4_STATUS" as const, status: status() }));
  render(<TenantSenderVerification version={1} connectionReady={false} blocked={false} send={send} />); await waitFor(() => expect(screen.getByRole("button", { name: "Enviar código ao remetente" })).toBeDisabled()); });
 it("activation requires verified + checkbox", async () => { const send = vi.fn(async () => ({ code: "F4_STATUS" as const, status: status({ sender_verified: true }) }));
  render(<TenantSenderVerification version={1} connectionReady blocked={false} send={send} />); const b = await screen.findByRole("button", { name: "Ativar email da empresa" });
  await waitFor(() => expect(b).toBeDisabled()); fireEvent.click(screen.getByLabelText("Confirmo a ativação desta configuração")); expect(b).not.toBeDisabled(); });
});
