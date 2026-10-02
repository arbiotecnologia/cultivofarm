import { describe, expect, it, vi } from "vitest";
import { deliverInviteEmail, type InviteEmailDeliveryDeps } from "../../../supabase/functions/_shared/comunicacao/invite-email-delivery.ts";
import type { AdapterResult, WorkerEnv } from "../../../supabase/functions/_shared/comunicacao/adapters-types.ts";

const env = {} as WorkerEnv;
const claim = {
  job_id: "job",
  lease_token: "lease",
  idempotency_key: "event-key",
  recipient_email: "controlado@example.com",
  recipient_name: "TESTE D51.2",
};

const deps = (over: Partial<InviteEmailDeliveryDeps> = {}): InviteEmailDeliveryDeps => ({
  claim: vi.fn(async () => claim),
  send: vi.fn(async (): Promise<AdapterResult> => ({ outcome: "sent", code: "sent", message: "ok" })),
  accept: vi.fn(async () => undefined),
  fail: vi.fn(async () => undefined),
  ...over,
});

describe("D51.2-A — envio de convite com SMTP mockado", () => {
  it("reserva, envia e confirma aceite sem devolver link", async () => {
    const d = deps();
    await expect(deliverInviteEmail("job", "https://app/reset#token", env, d)).resolves.toEqual({ status: "accepted", code: "accepted" });
    expect(d.send).toHaveBeenCalledOnce();
    expect(d.accept).toHaveBeenCalledWith("job", "lease");
    expect(d.fail).not.toHaveBeenCalled();
  });

  it("falha do provider deixa o job retomável", async () => {
    const d = deps({ send: vi.fn(async (): Promise<AdapterResult> => ({ outcome: "transient_error", code: "email_network_error", message: "network" })) });
    await expect(deliverInviteEmail("job", "https://app/reset#token", env, d)).resolves.toEqual({ status: "failed", code: "email_network_error" });
    expect(d.fail).toHaveBeenCalledWith("job", "lease", "email_network_error");
    expect(d.accept).not.toHaveBeenCalled();
  });

  it("crash antes do envio é registrado como falha retomável", async () => {
    const d = deps({ send: vi.fn(async () => { throw new Error("crash"); }) });
    await expect(deliverInviteEmail("job", "https://app/reset#token", env, d)).resolves.toEqual({ status: "failed", code: "email_send_crash" });
    expect(d.fail).toHaveBeenCalledWith("job", "lease", "email_send_crash");
  });

  it("crash após aceite SMTP e antes da persistência fica ambíguo", async () => {
    const d = deps({ accept: vi.fn(async () => { throw new Error("db unavailable"); }) });
    await expect(deliverInviteEmail("job", "https://app/reset#token", env, d)).resolves.toEqual({ status: "ambiguous", code: "email_accept_persistence_failed" });
    expect(d.fail).not.toHaveBeenCalled();
  });

  it("destinatário sempre vem do claim server-side", async () => {
    const d = deps();
    await deliverInviteEmail("job", "https://app/reset#token", env, d);
    expect(d.send).toHaveBeenCalledWith(expect.objectContaining({ recipientEmail: claim.recipient_email, idempotencyKey: claim.idempotency_key }));
  });
});