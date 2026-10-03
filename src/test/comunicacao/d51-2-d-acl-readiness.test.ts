import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  buildSmtpReadiness,
  CONTROLLED_TEST_EMAIL,
} from "../../../supabase/functions/_shared/comunicacao/smtp-readiness";
import { isSecretReferenceConfigured } from "../../../supabase/functions/communication-provider-settings/secret-status";

const migrationPath =
  "supabase/migrations/20261002021548_3e72386c-e049-42b4-8022-39f99b4d4cab.sql";
const functionPath = "supabase/functions/communication-provider-settings/index.ts";
const readinessPath = "supabase/functions/_shared/comunicacao/smtp-readiness.ts";

const sql = readFileSync(migrationPath, "utf8");
const source = readFileSync(functionPath, "utf8");
const readinessSource = readFileSync(readinessPath, "utf8");

describe("D51.2-D — ACL e preflight SMTP sem envio", () => {
  it("revoga acesso direto público/anon/authenticated e preserva service_role", () => {
    expect(sql).toMatch(
      /REVOKE ALL PRIVILEGES ON TABLE public\.communication_provider_settings\s+FROM PUBLIC, anon, authenticated;/i,
    );
    expect(sql).toMatch(
      /GRANT ALL PRIVILEGES ON TABLE public\.communication_provider_settings\s+TO service_role;/i,
    );
    expect(sql).toContain("ARRAY['anon'::name, 'authenticated'::name]");
  });

  it("trata eventual sequência legada sem criar uma nova", () => {
    expect(sql).toContain("to_regclass('public.communication_provider_settings_id_seq')");
    expect(sql).toMatch(/REVOKE ALL PRIVILEGES ON SEQUENCE/i);
    expect(sql).not.toMatch(/CREATE\s+SEQUENCE/i);
  });

  it("expõe somente sinais sanitizados de prontidão para o destinatário autorizado", () => {
    expect(CONTROLLED_TEST_EMAIL).toBe("teste@refilinformatica.com.br");
    for (const field of [
      "singleton_exists",
      "delivery_enabled",
      "email_delivery_enabled",
      "test_mode_enabled",
      "allowed_email_count",
      "test_email_allowlisted",
      "smtp_host_configured",
      "smtp_port_configured",
      "smtp_port_runtime_compatible",
      "blocking_code",
      "smtp_user_configured",
      "smtp_password_configured",
      "smtp_from_configured",
      "connection_ready",
      "connection_pass_recent",
      "controlled_test_send_ready",
      "operational_email_ready",
      "ready_for_controlled_test",
    ]) expect(readinessSource).toContain(field);
    expect(source).toContain("smtp_readiness: buildSmtpReadiness(");
  });

  it("deriva status de segredo somente pela presença da referência", () => {
    const secretReference = "00000000-0000-0000-0000-000000000001";
    const row = {
      secret_smtp_password: secretReference,
      secret_whatsapp_access_token: secretReference,
      secret_whatsapp_app_secret: secretReference,
      secret_whatsapp_verify_token: secretReference,
      delivery_enabled: true,
      email_delivery_enabled: false,
    };

    for (const key of [
      "secret_smtp_password",
      "secret_whatsapp_access_token",
      "secret_whatsapp_app_secret",
      "secret_whatsapp_verify_token",
    ]) {
      expect(isSecretReferenceConfigured(row, key)).toBe(true);
      expect(isSecretReferenceConfigured({ ...row, [key]: null }, key)).toBe(false);
      expect(isSecretReferenceConfigured({ ...row, [key]: "  " }, key)).toBe(false);
    }

    expect(row.delivery_enabled === true).toBe(true);
    expect(row.email_delivery_enabled === true).toBe(false);
  });

  it("mantém paridade SMTP e usa presença nos quatro indicadores sanitizados", () => {
    const secretReference = "00000000-0000-0000-0000-000000000001";
    const row = { secret_smtp_password: secretReference };
    expect(isSecretReferenceConfigured(row, "secret_smtp_password")).toBe(
      buildSmtpReadiness(row).smtp_password_configured,
    );
    expect(isSecretReferenceConfigured({ secret_smtp_password: null }, "secret_smtp_password")).toBe(
      buildSmtpReadiness({ secret_smtp_password: null }).smtp_password_configured,
    );
    expect(source).toContain('password_configured: secretConfigured("secret_smtp_password")');
    expect(source).toContain('access_token_configured: secretConfigured("secret_whatsapp_access_token")');
    expect(source).toContain('app_secret_configured: secretConfigured("secret_whatsapp_app_secret")');
    expect(source).toContain('verify_token_configured: secretConfigured("secret_whatsapp_verify_token")');
    expect(source).toContain('const bool = (k: string) => row[k] === true');
  });

  it("separa conexão, teste controlado e prontidão operacional", () => {
    const allConfigured = {
      delivery_enabled: true,
      email_delivery_enabled: true,
      test_mode_enabled: true,
      allowed_emails: [" TESTE@REFILINFORMATICA.COM.BR "],
      smtp_host: "smtp.example.test",
      smtp_port: 465,
      smtp_user: "user",
      smtp_from: "from@example.test",
      secret_smtp_password: "00000000-0000-0000-0000-000000000001",
    };
    const passAt = "2026-10-03T16:59:02.720Z";
    const currentNow = Date.parse("2026-10-03T17:10:00.000Z");
    const pass = {
      action: "smtp_connection_test",
      outcome: "success",
      safe_code: "smtp_connection_ok",
      stage: "quit",
      created_at: passAt,
    };
    const configuredAfterPass = { ...allConfigured, updated_at: "2026-10-03T16:58:41.000Z" };
    expect(buildSmtpReadiness(configuredAfterPass, pass, currentNow)).toMatchObject({
      connection_ready: true,
      connection_pass_recent: true,
      controlled_test_send_ready: true,
      operational_email_ready: true,
      ready_for_controlled_test: true,
    });
    expect(buildSmtpReadiness({ ...configuredAfterPass, delivery_enabled: false, email_delivery_enabled: false }, pass, currentNow)).toMatchObject({
      controlled_test_send_ready: true,
      operational_email_ready: false,
    });
    expect(buildSmtpReadiness(configuredAfterPass, pass, Date.parse("2026-10-03T17:30:00.000Z"))).toMatchObject({
      connection_pass_recent: false,
      controlled_test_send_ready: false,
      controlled_test_send_blocking_code: "smtp_connection_stale",
    });
    expect(buildSmtpReadiness({ ...configuredAfterPass, updated_at: "2026-10-03T17:00:00.000Z" }, pass, currentNow)).toMatchObject({
      connection_pass_recent: false,
      controlled_test_send_ready: false,
      controlled_test_send_blocking_code: "smtp_configuration_changed",
    });
    for (const port of [25, 587]) {
      expect(buildSmtpReadiness({ ...configuredAfterPass, smtp_port: port }, pass, currentNow)).toMatchObject({
        smtp_port_runtime_compatible: false,
        blocking_code: "smtp_port_blocked_by_edge_runtime",
        ready_for_controlled_test: false,
      });
    }
    expect(buildSmtpReadiness({ ...configuredAfterPass, test_mode_enabled: false }, pass, currentNow).ready_for_controlled_test).toBe(false);
    expect(buildSmtpReadiness({ ...configuredAfterPass, allowed_emails: [] }, pass, currentNow).ready_for_controlled_test).toBe(false);
    expect(buildSmtpReadiness({ ...configuredAfterPass, allowed_emails: [CONTROLLED_TEST_EMAIL, "other@example.test"] }, pass, currentNow).ready_for_controlled_test).toBe(false);
    expect(buildSmtpReadiness({ ...configuredAfterPass, secret_smtp_password: null }, pass, currentNow).ready_for_controlled_test).toBe(false);
    expect(buildSmtpReadiness(null)).toMatchObject({
      singleton_exists: false,
      ready_for_controlled_test: false,
    });
  });

  it("mantém autorização administrativa antes da leitura e não abre conexão SMTP", () => {
    const authorization = source.indexOf("await authorizePlatformSuperadmin(req, origin)");
    const publicViewCall = source.indexOf("await loadPublicView(sb)");
    expect(authorization).toBeGreaterThan(-1);
    expect(publicViewCall).toBeGreaterThan(authorization);
    expect(source).not.toMatch(/new\s+SmtpClient|connectTls|sendMail|sendEmail/);
  });
});