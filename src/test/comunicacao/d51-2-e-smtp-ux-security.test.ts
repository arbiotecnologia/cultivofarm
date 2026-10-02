import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import type { WorkerEnv } from "../../../supabase/functions/_shared/comunicacao/adapters-types";
import {
  evaluateControlledSmtpTest,
  sanitizeSmtpTestResult,
} from "../../../supabase/functions/_shared/comunicacao/controlled-smtp-test";

const ui = readFileSync("src/pages/configuracoes/ComunicacaoConfigTab.tsx", "utf8");
const platformHome = readFileSync("src/pages/plataforma/PlataformaHome.tsx", "utf8");
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
  SMTP_PORT: "465",
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
    for (const port of ["25", "587"]) {
      expect(evaluateControlledSmtpTest({ ...readyEnv, SMTP_PORT: port }, "teste@refilinformatica.com.br"))
        .toEqual({ allowed: false, code: "smtp_port_blocked_by_edge_runtime" });
    }
    expect(edge.indexOf("evaluateControlledSmtpTest(env, to)")).toBeLessThan(edge.indexOf("await sendEmail("));
  });

  it("mostra orientação genérica de incompatibilidade sem credenciais", () => {
    expect(ui).toContain("Porta SMTP incompatível com o runtime");
    expect(ui).toContain("integração HTTP");
  });

  it("não devolve nem registra diagnóstico bruto, host, porta ou credenciais", () => {
    for (const forbidden of ["rawBody", "console.log", "console.error", "parsed.host", "parsed.port", "parsed.detail"])
      expect(ui).not.toContain(forbidden);
    expect(edge).not.toMatch(/detail:|cause:|exception:|sent_to:|host,|port,|from,/);
    expect(sanitizeSmtpTestResult({ outcome: "transient_error", code: "private provider detail", message: "secret" }))
      .toBe("smtp_test_failed");
  });

  it("valida superadmin de plataforma, rate limit, test mode e allowlist no servidor", () => {
    expect(edge).toContain('sb.rpc("is_platform_superadmin"');
    expect(edge).not.toContain('r.role === "administrador"');
    expect(edge).toContain('mode === "connection" ? "test_smtp_connection" : "test_smtp"');
    expect(edge).toContain("loadRuntimeConfig(sb, readWorkerEnv)");
    expect(edge).toContain("evaluateControlledSmtpTest(env, to)");
  });

  it("separa conexão sem envio do envio real confirmado", () => {
    expect(ui).toContain('{ mode: "connection" }');
    expect(ui).toContain("Testar conexão do provedor");
    expect(ui).toContain("Não envia e-mail e funciona com as entregas global e de e-mail desativadas.");
    expect(ui).toContain("Confirmar envio real de teste?");
    expect(ui).toContain('{ mode: "send", to');
    expect(ui).toContain("O sucesso confirma apenas o aceite pelo servidor SMTP, não a entrega na caixa postal.");
  });

  it("exibe as duas etapas na aba real de plataforma sem depender das flags de entrega", () => {
    expect(platformHome).toContain('import ComunicacaoConfigTab from "@/pages/configuracoes/ComunicacaoConfigTab"');
    expect(platformHome).toContain('<TabsContent value="comunicacao">');
    expect(platformHome).toContain("<ComunicacaoConfigTab />");
    expect(ui).toContain("Diagnóstico do provedor de e-mail");
    expect(ui).toContain("Testar conexão do provedor");
    expect(ui).toContain("Enviar teste");
    expect(ui).not.toMatch(/view\.smtp\.password_configured\s*&&\s*\([\s\S]{0,300}Diagnóstico do provedor de e-mail/);
    expect(ui).toContain("!connectionConfigReady");
    expect(ui).toContain("!view.smtp_readiness.ready_for_controlled_test");
    expect(ui).toContain("funciona com as entregas global e de e-mail desativadas");
    expect(ui).toContain("Envio bloqueado até que toda a prontidão SMTP");
    expect(ui).toContain("flex flex-col gap-3 rounded-md border p-3 sm:flex-row");
  });

  it("preserva proteção contra clique duplo nos dois diagnósticos", () => {
    expect(ui).toContain("if (testingConnection || testingEmail) return;");
    expect(ui).toContain("testingEmail || testingConnection");
  });
});