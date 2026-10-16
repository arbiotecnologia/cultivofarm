import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { f4RequestSchema } from "../../../scripts/smtp-tenant-candidate/f4/contract";
import { f4bRequestSchema, laneJobSchema, type LaneJob } from "../../../scripts/smtp-tenant-candidate/f4b/contract";
import { runTenantLane, sendLaneMessage, type LaneRpc } from "../../../scripts/smtp-tenant-candidate/f4b/lane";
import { TENANT_SMTP_F4B_PHASE, type F4bStatus, type SenderResult } from "@/lib/configuracoes/tenantSmtp";
import TenantSenderVerification from "@/pages/configuracoes/TenantSenderVerification";

const OUT = "11111111-1111-4111-8111-111111111111", FENCE = "22222222-2222-4222-8222-222222222222";
const job = (o: Record<string, unknown> = {}) => ({ outbox_id: OUT, fence: FENCE, version: 2, recipient: "consultor@tenant-a.test", subject: "Nova solicitação atribuída", text: "corpo",
 config: { host: "smtpi.example.test", port: 465, tls_mode: "implicit_tls", username: "u", from_email: "sender@tenant-a.test" }, password: "synthetic-only", ...o });
const rpc = (claims: unknown[], finish: (a: Record<string, unknown>) => { data: unknown; error: unknown } = () => ({ data: { state: "sent" }, error: null })) => {
 const calls: Array<[string, Record<string, unknown>]> = [];
 const client: LaneRpc = { rpc: async (name, args) => { calls.push([name, args]);
  if (name === "tenant_smtp_lane_claim") return { data: claims.length ? claims.shift() : null, error: null };
  return finish(args) as { data: unknown; error: null }; } };
 return { client, calls };
};
const deps = {} as never;

describe("F4b flags stay closed", () => {
 it("frontend F4b phase false", () => expect(TENANT_SMTP_F4B_PHASE).toBe(false));
 it("worker lane and edge F4b review flags false; NOTIF3 global containment intact", () => {
  const w = readFileSync("scripts/smtp-tenant-candidate/f4b/worker-index.ts.review", "utf8");
  expect(w).toContain("export const TENANT_SMTP_LANE_REVIEWED = false;");
  expect(w).toContain("const deliveryContractAvailable = false;");
  const e = readFileSync("scripts/smtp-tenant-candidate/f2f3/deploy/supabase/functions/tenant-email-settings/index.ts", "utf8");
  expect(e).toContain("TENANT_SMTP_F4B_REVIEWED=false");
  expect(readFileSync("supabase/functions/process-communication-outbox/index.ts", "utf8")).not.toContain("tenant_smtp");
 });
});

describe("F4b contract", () => {
 it("F4a contract still refuses activation true", () => expect(f4RequestSchema.safeParse({ op: "activation", expected_version: 1, active: true, confirm: true }).success).toBe(false));
 it("F4b accepts explicit activation", () => expect(f4bRequestSchema.safeParse({ op: "activation", expected_version: 1, active: true, confirm: true }).success).toBe(true));
 it.each(["organization_id", "recipient", "host", "password"])("F4b rejects forged %s", k =>
  expect(f4bRequestSchema.safeParse({ op: "activation", expected_version: 1, active: true, confirm: true, [k]: "x" }).success).toBe(false));
 it("lane job rejects port 587, extra tenant field and plaintext TLS", () => {
  expect(laneJobSchema.safeParse(job({ config: { ...job().config, port: 587 } })).success).toBe(false);
  expect(laneJobSchema.safeParse(job({ organization_id: OUT })).success).toBe(false);
  expect(laneJobSchema.safeParse(job({ config: { ...job().config, tls_mode: "starttls" } })).success).toBe(false);
 });
});

describe("F4b worker lane", () => {
 it("empty queue: no send", async () => { const r = rpc([]); const send = vi.fn(); expect((await runTenantLane(r.client, "w", deps, send)).stopped).toBe("empty"); expect(send).not.toHaveBeenCalled(); });
 it("forged claim shape: no IO, stop", async () => {
  const r = rpc([job({ recipient: "x@evil.test", organization_id: "forged" })]); const send = vi.fn();
  const s = await runTenantLane(r.client, "w", deps, send); expect(s.stopped).toBe("claim_error"); expect(send).not.toHaveBeenCalled();
  expect(r.calls.some(([n]) => n === "tenant_smtp_lane_finish")).toBe(false);
 });
 it("busy/quota stop without IO; skipped continues", async () => {
  for (const flag of ["busy", "quota"] as const) { const r = rpc([{ [flag]: true }, job()]); const send = vi.fn(); expect((await runTenantLane(r.client, "w", deps, send)).stopped).toBe(flag); expect(send).not.toHaveBeenCalled(); }
  const r = rpc([{ skipped: true }, job()]); const send = vi.fn(async () => "sent" as const); const s = await runTenantLane(r.client, "w", deps, send); expect(s.skipped).toBe(1); expect(s.sent).toBe(1);
 });
 it("send exception is ambiguous, finished once, never retried", async () => {
  const r = rpc([job()]); const send = vi.fn(async () => { throw new Error("socket reset after DATA"); });
  const s = await runTenantLane(r.client, "w", deps, send); expect(send).toHaveBeenCalledTimes(1); expect(s.ambiguous).toBe(1);
  expect(r.calls.filter(([n]) => n === "tenant_smtp_lane_finish")).toEqual([["tenant_smtp_lane_finish", { p_outbox: OUT, p_fence: FENCE, p_outcome: "ambiguous" }]]);
 });
 it("finish error (fence lost / uncertain ledger) stops the run, no further claim", async () => {
  const r = rpc([job(), job()], () => ({ data: null, error: { code: "40001", message: "SMTP_CONFLICT" } })); const send = vi.fn(async () => "sent" as const);
  const s = await runTenantLane(r.client, "w", deps, send); expect(s.stopped).toBe("finish_error"); expect(send).toHaveBeenCalledTimes(1);
  expect(r.calls.filter(([n]) => n === "tenant_smtp_lane_claim").length).toBe(1);
 });
 it("password scrubbed after IO and never sent to finish", async () => {
  let seen: LaneJob | undefined; const r = rpc([job()]);
  await runTenantLane(r.client, "w", deps, async j => { seen = j; return "sent"; });
  expect(seen?.password).toBe(""); expect(JSON.stringify(r.calls)).not.toContain("synthetic-only");
 });
 it("connect failure before DATA is failed, not ambiguous", async () => {
  const out = await sendLaneMessage(laneJobSchema.parse(job()), { connectTls: async () => { throw new Error("smtp_dns_blocked"); } } as never);
  expect(out).toBe("failed");
 });
});

const st = (o: Partial<F4bStatus> = {}): F4bStatus => ({ version: 2, sender_verified: true, active: false, dispatch_enabled: false, challenge: null, ...o });
describe("F4b panel", () => {
 it("hidden while phase off", async () => {
  render(<TenantSenderVerification version={2} connectionReady blocked={false} send={async () => ({ code: "F4_STATUS", status: st() })} />);
  await screen.findByText("Remetente verificado; envio operacional ainda indisponível.");
  expect(screen.queryByRole("button", { name: /Ativar email/ })).toBeNull();
 });
 it("activate: single request on double click, real status shown", async () => {
  const send = vi.fn(async (i: { op: string; active?: boolean }): Promise<SenderResult> => i.op === "activation" ? { code: "F4_STATUS", status: st({ active: true, dispatch_enabled: true }) } : { code: "F4_STATUS", status: st() });
  render(<TenantSenderVerification version={2} connectionReady blocked={false} send={send} activationEnabled />);
  const btn = await screen.findByRole("button", { name: /Ativar email/ });
  fireEvent.click(btn); fireEvent.click(btn);
  await screen.findByText("Email da empresa ativado.");
  expect(send.mock.calls.filter(([i]) => i.op === "activation")).toEqual([[{ op: "activation", expected_version: 2, active: true, confirm: true }]]);
  expect(screen.getByRole("button", { name: /Pausar/ })).toBeTruthy();
 });
 it("activation needs fresh connection", async () => {
  render(<TenantSenderVerification version={2} connectionReady={false} blocked={false} send={async () => ({ code: "F4_STATUS", status: st() })} activationEnabled />);
  expect((await screen.findByRole("button", { name: /Ativar email/ })).hasAttribute("disabled")).toBe(true);
 });
 it("late activation response dropped after version/identity change", async () => {
  let resolve!: (r: SenderResult) => void;
  const send = vi.fn((i: { op: string }) => i.op === "activation" ? new Promise<SenderResult>(r => { resolve = r; }) : Promise.resolve({ code: "F4_STATUS" as const, status: st() }));
  const { rerender } = render(<TenantSenderVerification version={2} connectionReady blocked={false} send={send} activationEnabled />);
  fireEvent.click(await screen.findByRole("button", { name: /Ativar email/ }));
  rerender(<TenantSenderVerification version={3} connectionReady blocked={false} send={vi.fn(async () => ({ code: "F4_STATUS" as const, status: st({ version: 3, sender_verified: false }) }))} activationEnabled />);
  await act(async () => resolve({ code: "F4_STATUS", status: st({ active: true, dispatch_enabled: true }) }));
  await waitFor(() => expect(screen.queryByText("Email da empresa ativado.")).toBeNull());
  expect(screen.queryByText(/avisos de solicitação atribuída/)).toBeNull();
 });
 it("server refusal shows safe message only", async () => {
  const send = vi.fn(async (i: { op: string }): Promise<SenderResult> => i.op === "activation" ? { code: "SMTP_FORBIDDEN" } : { code: "F4_STATUS", status: st() });
  render(<TenantSenderVerification version={2} connectionReady blocked={false} send={send} activationEnabled />);
  fireEvent.click(await screen.findByRole("button", { name: /Ativar email/ }));
  await screen.findByText("Não foi possível concluir. Recarregue para verificar o estado.");
 });
});
