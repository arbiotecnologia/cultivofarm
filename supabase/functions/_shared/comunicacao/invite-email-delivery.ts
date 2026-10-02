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
  | { status: "ambiguous"; code: string };

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
  ambiguous: (jobId: string, leaseToken: string, code: string) => Promise<void>;
};

const SAFE_EMAIL_CODES = new Set([
  "email_disabled",
  "email_config_invalid",
  "smtp_port_blocked_by_edge_runtime",
  "invalid_address",
  "test_mode_allowlist_empty",
  "test_mode_not_allowlisted",
  "email_missing_subject",
  "email_subject_too_long",
  "email_header_injection_subject",
  "email_header_injection_from",
  "email_header_injection_to",
  "email_address_too_long",
  "email_body_too_large",
  "email_connect_timeout",
  "email_connect_network",
  "email_smtp_4xx",
  "email_smtp_5xx",
  "email_send_ambiguous",
  "email_accept_persistence_failed",
]);

const safeCode = (value: string) => SAFE_EMAIL_CODES.has(value) ? value : "email_send_ambiguous";

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
    const code = "email_send_ambiguous";
    await deps.ambiguous(jobId, claim.lease_token, code);
    return { status: "ambiguous", code };
  }

  if (result.certainty === "ambiguous" || result.outcome === "ambiguous") {
    const code = safeCode(result.code || "email_send_ambiguous");
    await deps.ambiguous(jobId, claim.lease_token, code);
    return { status: "ambiguous", code };
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
    await deps.ambiguous(jobId, claim.lease_token, "email_accept_persistence_failed").catch(() => undefined);
    return { status: "ambiguous", code: "email_accept_persistence_failed" };
  }
}