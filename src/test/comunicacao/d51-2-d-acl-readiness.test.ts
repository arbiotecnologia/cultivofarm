import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  buildSmtpReadiness,
  CONTROLLED_TEST_EMAIL,
} from "../../../supabase/functions/_shared/comunicacao/smtp-readiness";

const migrationPath =
  "supabase/migrations/20261002021548_3e72386c-e049-42b4-8022-39f99b4d4cab.sql";
const functionPath = "supabase/functions/communication-provider-settings/index.ts";

const sql = readFileSync(migrationPath, "utf8");
const source = readFileSync(functionPath, "utf8");

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
      "smtp_user_configured",
      "smtp_password_configured",
      "smtp_from_configured",
      "ready_for_controlled_test",
    ]) expect(source).toContain(field);
  });

  it("só fica pronto com flags, test mode, allowlist e SMTP completos", () => {
    const allConfigured = {
      delivery_enabled: true,
      email_delivery_enabled: true,
      test_mode_enabled: true,
      allowed_emails: [" TESTE@REFILINFORMATICA.COM.BR "],
      smtp_host: "smtp.example.test",
      smtp_port: 587,
      smtp_user: "user",
      smtp_from: "from@example.test",
      secret_smtp_password: "00000000-0000-0000-0000-000000000001",
    };
    expect(buildSmtpReadiness(allConfigured).ready_for_controlled_test).toBe(true);
    expect(buildSmtpReadiness({ ...allConfigured, test_mode_enabled: false }).ready_for_controlled_test).toBe(false);
    expect(buildSmtpReadiness({ ...allConfigured, allowed_emails: [] }).ready_for_controlled_test).toBe(false);
    expect(buildSmtpReadiness({ ...allConfigured, secret_smtp_password: null }).ready_for_controlled_test).toBe(false);
    expect(buildSmtpReadiness(null)).toMatchObject({
      singleton_exists: false,
      ready_for_controlled_test: false,
    });
  });

  it("mantém autorização administrativa antes da leitura e não abre conexão SMTP", () => {
    const authorization = source.indexOf("await authorizeAdmin(req, origin)");
    const publicViewCall = source.indexOf("await loadPublicView(sb)");
    expect(authorization).toBeGreaterThan(-1);
    expect(publicViewCall).toBeGreaterThan(authorization);
    expect(source).not.toMatch(/new\s+SmtpClient|connectTls|sendMail|sendEmail/);
  });
});