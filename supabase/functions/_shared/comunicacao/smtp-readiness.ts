export const CONTROLLED_TEST_EMAIL = "teste@refilinformatica.com.br";
export const EDGE_RUNTIME_BLOCKED_SMTP_PORTS = new Set([25, 587]);

type SettingsRow = Record<string, unknown>;

export type SmtpReadiness = {
  singleton_exists: boolean;
  delivery_enabled: boolean;
  email_delivery_enabled: boolean;
  test_mode_enabled: boolean;
  allowed_email_count: number;
  test_email_allowlisted: boolean;
  smtp_host_configured: boolean;
  smtp_port_configured: boolean;
  smtp_port_runtime_compatible: boolean;
  blocking_code: "smtp_port_blocked_by_edge_runtime" | null;
  smtp_user_configured: boolean;
  smtp_password_configured: boolean;
  smtp_from_configured: boolean;
  connection_ready: boolean;
  connection_pass_recent: boolean;
  connection_pass_at: string | null;
  controlled_test_send_ready: boolean;
  operational_email_ready: boolean;
  controlled_test_send_blocking_code:
    | "smtp_config_invalid"
    | "test_mode_required"
    | "controlled_allowlist_required"
    | "smtp_connection_required"
    | "smtp_connection_stale"
    | "smtp_configuration_changed"
    | null;
  /** @deprecated Alias temporário para compatibilidade de clientes publicados. */
  ready_for_controlled_test: boolean;
};

export type SmtpConnectionEvidence = {
  action?: unknown;
  outcome?: unknown;
  safe_code?: unknown;
  stage?: unknown;
  created_at?: unknown;
} | null;

export const SMTP_CONNECTION_PASS_TTL_MS = 30 * 60 * 1000;

function normalizedHost(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase().replace(/\.$/, "") : "";
}

export function buildSmtpReadiness(
  row: SettingsRow | null,
  connectionEvidence: SmtpConnectionEvidence = null,
  nowMs = Date.now(),
): SmtpReadiness {
  const singletonExists = row !== null;
  const value = row ?? {};
  const strings = (key: string): string[] => Array.isArray(value[key])
    ? (value[key] as unknown[]).filter((item): item is string => typeof item === "string")
    : [];
  const configuredString = (key: string) =>
    typeof value[key] === "string" && (value[key] as string).trim().length > 0;
  const enabled = (key: string) => value[key] === true;
  const allowedEmails = strings("allowed_emails");
  const smtpPort = typeof value["smtp_port"] === "number" ? value["smtp_port"] as number : null;
  const smtpPortConfigured = smtpPort !== null && Number.isInteger(smtpPort) && smtpPort >= 1 && smtpPort <= 65535;
  const smtpPortRuntimeCompatible = smtpPortConfigured && !EDGE_RUNTIME_BLOCKED_SMTP_PORTS.has(smtpPort);
  const testEmailAllowlisted = allowedEmails.some(
    (email) => email.trim().toLowerCase() === CONTROLLED_TEST_EMAIL,
  );
  const controlledAllowlistExclusive = allowedEmails.length === 1 && testEmailAllowlisted;
  const readiness = {
    singleton_exists: singletonExists,
    delivery_enabled: enabled("delivery_enabled"),
    email_delivery_enabled: enabled("email_delivery_enabled"),
    test_mode_enabled: enabled("test_mode_enabled"),
    allowed_email_count: allowedEmails.length,
    test_email_allowlisted: testEmailAllowlisted,
    smtp_host_configured: configuredString("smtp_host"),
    smtp_port_configured: smtpPortConfigured,
    smtp_port_runtime_compatible: smtpPortRuntimeCompatible,
    smtp_user_configured: configuredString("smtp_user"),
    smtp_password_configured: Boolean(value["secret_smtp_password"]),
    smtp_from_configured: configuredString("smtp_from"),
  };
  const connectionReady =
    readiness.singleton_exists &&
    readiness.smtp_host_configured &&
    readiness.smtp_port_configured &&
    readiness.smtp_port_runtime_compatible &&
    readiness.smtp_user_configured &&
    readiness.smtp_password_configured &&
    readiness.smtp_from_configured;
  const passAt = typeof connectionEvidence?.created_at === "string" ? connectionEvidence.created_at : null;
  const passMs = passAt ? Date.parse(passAt) : Number.NaN;
  const updatedAtMs = typeof value["updated_at"] === "string" ? Date.parse(value["updated_at"] as string) : Number.NaN;
  const action = connectionEvidence?.action;
  const normalPass = action === "smtp_connection_test";
  const candidatePassMatchesActiveRoute = action === "smtp_connection_candidate_test" &&
    ["smtpi.kinghost.net", "smtpi.uni5.net"].includes(normalizedHost(value["smtp_host"]));
  const passContractValid =
    connectionEvidence?.outcome === "success" &&
    connectionEvidence?.safe_code === "smtp_connection_ok" &&
    connectionEvidence?.stage === "quit" &&
    (normalPass || candidatePassMatchesActiveRoute) &&
    Number.isFinite(passMs);
  const configurationChanged = passContractValid && Number.isFinite(updatedAtMs) && updatedAtMs > passMs;
  const passStale = passContractValid && nowMs - passMs > SMTP_CONNECTION_PASS_TTL_MS;
  const connectionPassRecent = passContractValid && !configurationChanged && !passStale && passMs <= nowMs;
  const controlledReady = connectionReady && readiness.test_mode_enabled && controlledAllowlistExclusive && connectionPassRecent;
  const operationalReady = controlledReady && readiness.delivery_enabled && readiness.email_delivery_enabled;
  const blockingCode = !connectionReady
    ? "smtp_config_invalid"
    : !readiness.test_mode_enabled
      ? "test_mode_required"
      : !controlledAllowlistExclusive
        ? "controlled_allowlist_required"
        : !passContractValid
          ? "smtp_connection_required"
          : configurationChanged
            ? "smtp_configuration_changed"
            : passStale || passMs > nowMs
              ? "smtp_connection_stale"
              : null;
  return {
    ...readiness,
    blocking_code: smtpPortConfigured && !smtpPortRuntimeCompatible ? "smtp_port_blocked_by_edge_runtime" : null,
    connection_ready: connectionReady,
    connection_pass_recent: connectionPassRecent,
    connection_pass_at: passAt,
    controlled_test_send_ready: controlledReady,
    operational_email_ready: operationalReady,
    controlled_test_send_blocking_code: blockingCode,
    ready_for_controlled_test: controlledReady,
  };
}