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
  ready_for_controlled_test: boolean;
};

export function buildSmtpReadiness(row: SettingsRow | null): SmtpReadiness {
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
  return {
    ...readiness,
    blocking_code: smtpPortConfigured && !smtpPortRuntimeCompatible ? "smtp_port_blocked_by_edge_runtime" : null,
    ready_for_controlled_test: Object.values(readiness).every((item) =>
      typeof item === "number" ? item > 0 : item === true
    ),
  };
}