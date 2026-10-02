import type { AdapterResult, WorkerEnv } from "./adapters-types.ts";

export type InviteEmailClaim = {
  job_id: string;
  lease_token: string;
  idempotency_key: string;
  recipient_email: string;
  recipient_name: string;
};

export type InviteEmailDeliveryResult =
  | { status: "accepted"; code: "accepted" }
  | { status: "failed"; code: string }
  | { status: "ambiguous"; code: "email_accept_persistence_failed" };

export type InviteEmailDeliveryDeps = {
  claim: (jobId: string) => Promise<InviteEmailClaim>;
  send: (input: {
    env: WorkerEnv;
    recipientEmail: string;
    recipientName: string;
    actionLink: string;
    idempotencyKey: string;
  }) => Promise<AdapterResult>;
  accept: (jobId: string, leaseToken: string) => Promise<void>;
  fail: (jobId: string, leaseToken: string, code: string) => Promise<void>;
};

const safeCode = (value: string) =>
  (value || "email_failed").replace(/[^a-zA-Z0-9_:-]/g, "").slice(0, 80) || "email_failed";

/**
 * Orquestra o efeito externo sem expor destinatário, link ou credenciais.
 *
 * SMTP não oferece idempotência forte. Se o provedor aceitar a mensagem e a
 * confirmação local falhar, o estado fica ambíguo para retomada após o lease;
 * por isso esta função não promete exactly-once.
 */
export async function deliverInviteEmail(
  jobId: string,
  actionLink: string,
  env: WorkerEnv,
  deps: InviteEmailDeliveryDeps,
): Promise<InviteEmailDeliveryResult> {
  const claim = await deps.claim(jobId);
  let result: AdapterResult;
  try {
    result = await deps.send({
      env,
      recipientEmail: claim.recipient_email,
      recipientName: claim.recipient_name,
      actionLink,
      idempotencyKey: claim.idempotency_key,
    });
  } catch {
    await deps.fail(jobId, claim.lease_token, "email_send_crash");
    return { status: "failed", code: "email_send_crash" };
  }

  if (result.outcome !== "sent") {
    const code = safeCode(result.code);
    await deps.fail(jobId, claim.lease_token, code);
    return { status: "failed", code };
  }

  try {
    await deps.accept(jobId, claim.lease_token);
    return { status: "accepted", code: "accepted" };
  } catch {
    return { status: "ambiguous", code: "email_accept_persistence_failed" };
  }
}