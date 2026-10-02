import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import type { WorkerEnv } from "../../../supabase/functions/_shared/comunicacao/adapters-types";
import {
  evaluateControlledSmtpTest,
  sanitizeSmtpTestResult,
} from "../../../supabase/functions/_shared/comunicacao/controlled-smtp-test";

const ui = readFileSync("src/pages/configuracoes/ComunicacaoConfigTab.tsx", "utf8");
const edge = readFileSync("supabase/functions/test-communication-email/index.ts", "utf8");

const readyEnv: WorkerEnv = {
  DELIVERY_ENABLED: true,
  EMAIL_ENABLED: true,
  WHATSAPP_ENABLED: false,
  INAPP_ENABLED: false,
  WHATSAPP_WEBHOOK_ENABLED: false,
  TEST_MODE_ENABLED: true,
  TEST_ALLOWED_EMAILS: ["teste@refilinformatica.com.br"],
  TEST_ALLOWED_PHONES: [],
  SMTP_HOST: "smtp.example.test",
  SMTP_PORT: "587",
  SMTP_USER: "user",
  SMTP_PASSWORD: "secret-value",
  SMTP_FROM: "from@example.test",
};

describe("D51.2-E — UX e segurança do teste SMTP", () => {
  it("renderiza checklist completo e estados finais do preflight", () => {
    expect(ui).toContain("Prontidão SMTP para homologação");
    for (const label of [
      "Singleton presente", "Host configurado", "Porta configurada", "Usuário configurado",
      "Senha configurada", "Remetente configurado", "Test mode ativo",
      "CONTROLLED_TEST_EMAIL} na allowlist", "Entrega global ativa", "Entrega por e-mail ativa",
    ]) expect(ui).toContain(label);
    expect(ui).toContain("Pronto para teste controlado");
    expect(ui).toContain("Não pronto");
    expect(ui).toContain("Configuração preservada; envio bloqueado.");
  });

  it("fixa o único destinatário e bloqueia o botão quando readiness é falso", () => {
    expect(ui).toContain('const CONTROLLED_TEST_EMAIL = "teste@refilinformatica.com.br"');
    expect(ui).toMatch(/value=\{testEmailTo\}[\s\S]{0,80}readOnly/);
    expect(ui).toContain("!view.smtp_readiness.ready_for_controlled_test");
  });

  it("bloqueia destinatário externo e preflight incompleto antes do adapter", () => {
    expect(evaluateControlledSmtpTest(readyEnv, "outro@example.test")).toEqual({
      allowed: false,
      code: "recipient_not_allowed",
    });
    expect(evaluateControlledSmtpTest({ ...readyEnv, DELIVERY_ENABLED: false }, "teste@refilinformatica.com.br"))
      .toEqual({ allowed: false, code: "smtp_not_ready" });
    expect(evaluateControlledSmtpTest(readyEnv, " TESTE@REFILINFORMATICA.COM.BR ")).toEqual({
      allowed: true,
      recipient: "teste@refilinformatica.com.br",
    });
    expect(edge.indexOf("evaluateControlledSmtpTest(env, to)")).toBeLessThan(edge.indexOf("await sendEmail("));
  });

  it("não devolve nem registra diagnóstico bruto, host, porta ou credenciais", () => {
    for (const forbidden of ["rawBody", "console.log", "console.error", "parsed.host", "parsed.port", "parsed.detail"])
      expect(ui).not.toContain(forbidden);
    expect(edge).not.toMatch(/detail:|cause:|exception:|sent_to:|host,|port,|from,/);
    expect(sanitizeSmtpTestResult({ outcome: "transient_error", code: "private provider detail", message: "secret" }))
      .toBe("smtp_test_failed");
  });

  it("valida admin, rate limit, test mode e allowlist no servidor", () => {
    expect(edge).toContain('r.role === "administrador"');
    expect(edge).toContain('p_action: "test_smtp"');
    expect(edge).toContain("loadRuntimeConfig(sb, readWorkerEnv)");
    expect(edge).toContain("evaluateControlledSmtpTest(env, to)");
  });
});