import { getSmtpConfigError, type AdapterResult, type WorkerEnv } from "./adapters-types.ts";
import { CONTROLLED_TEST_EMAIL } from "./smtp-readiness.ts";

export type ControlledSmtpTestGate =
  | { allowed: true; recipient: string }
  | { allowed: false; code: "smtp_not_ready" | "smtp_port_blocked_by_edge_runtime" | "recipient_not_allowed" };

export function evaluateControlledSmtpTest(
  env: WorkerEnv,
  recipient: string,
): ControlledSmtpTestGate {
  const normalizedRecipient = recipient.trim().toLowerCase();
  if (normalizedRecipient !== CONTROLLED_TEST_EMAIL) {
    return { allowed: false, code: "recipient_not_allowed" };
  }

  const allowlisted = (env.TEST_ALLOWED_EMAILS ?? []).some(
    (email) => email.trim().toLowerCase() === CONTROLLED_TEST_EMAIL,
  );
  const smtpConfigError = getSmtpConfigError(env);
  if (smtpConfigError === "smtp_port_blocked_by_edge_runtime") {
    return { allowed: false, code: smtpConfigError };
  }

  if (
    !env.DELIVERY_ENABLED ||
    !env.EMAIL_ENABLED ||
    env.TEST_MODE_ENABLED !== true ||
    !allowlisted ||
    smtpConfigError !== null
  ) {
    return { allowed: false, code: "smtp_not_ready" };
  }
  return { allowed: true, recipient: CONTROLLED_TEST_EMAIL };
}

const ALLOWED_RESULT_CODES = new Set([
  "sent",
  "smtp_send_accepted",
  "email_send_ambiguous",
  "email_smtp_4xx",
  "email_smtp_5xx",
  "email_connect_timeout",
  "email_connect_network",
  "email_send_timeout",
  "email_config_invalid",
  "smtp_port_blocked_by_edge_runtime",
  "email_disabled",
  "test_mode_allowlist_empty",
  "test_mode_not_allowlisted",
  "email_missing_subject",
  "email_subject_too_long",
  "email_header_injection_subject",
  "email_header_injection_from",
  "email_header_injection_to",
  "email_address_too_long",
  "email_body_too_large",
  "invalid_address",
]);

export function sanitizeSmtpTestResult(result: AdapterResult): string {
  return ALLOWED_RESULT_CODES.has(result.code) ? result.code : "smtp_test_failed";
}