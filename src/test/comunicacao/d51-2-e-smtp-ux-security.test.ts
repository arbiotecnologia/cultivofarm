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
  DELIVERY_ENABLED: false,
  EMAIL_ENABLED: false,
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
      "CONTROLLED_TEST_EMAIL} na allowlist", "Conexão confirmada nos últimos 30 minutos",
    ]) expect(ui).toContain(label);
    expect(ui).toContain("Pronto para teste controlado");
    expect(ui).toContain("Não pronto");
    expect(ui).toContain("Configuração preservada; teste diagnóstico bloqueado.");
  });

  it("fixa o único destinatário e bloqueia o botão quando readiness é falso", () => {
    expect(ui).toContain('const CONTROLLED_TEST_EMAIL = "teste@refilinformatica.com.br"');
    expect(ui).toMatch(/value=\{testEmailTo\}[\s\S]{0,80}readOnly/);
    expect(ui).toContain("!view.smtp_readiness.controlled_test_send_ready");
  });

  it("bloqueia destinatário externo e preflight incompleto antes do adapter", () => {
    expect(evaluateControlledSmtpTest(readyEnv, "outro@example.test")).toEqual({
      allowed: false,
      code: "recipient_not_allowed",
    });
    expect(evaluateControlledSmtpTest(readyEnv, "teste@refilinformatica.com.br", false))
      .toEqual({ allowed: false, code: "smtp_not_ready" });
    expect(evaluateControlledSmtpTest(readyEnv, " TESTE@REFILINFORMATICA.COM.BR ", true)).toEqual({
      allowed: true,
      recipient: "teste@refilinformatica.com.br",
    });
    for (const port of ["25", "587"]) {
      expect(evaluateControlledSmtpTest({ ...readyEnv, SMTP_PORT: port }, "teste@refilinformatica.com.br", true))
        .toEqual({ allowed: false, code: "smtp_port_blocked_by_edge_runtime" });
    }
    expect(edge.indexOf("evaluateControlledSmtpTest(env, controlledRecipient, readiness.controlled_test_send_ready)")).toBeLessThan(edge.indexOf("await sendEmail("));
  });

  it("mostra orientação genérica de incompatibilidade sem credenciais", () => {
    expect(ui).toContain("Porta SMTP incompatível com o runtime");
    expect(ui).toContain("integração HTTP");
  });

  it("não devolve nem registra diagnóstico bruto, host, porta ou credenciais", () => {
    for (const forbidden of ["rawBody", "console.log", "console.error", "parsed.host", "parsed.port", "parsed.detail"])
      expect(ui).not.toContain(forbidden);
    expect(edge).not.toMatch(/detail:|cause:|exception:|sent_to:|parsed\.host|parsed\.port|parsed\.from/);
    expect(sanitizeSmtpTestResult({ outcome: "transient_error", code: "private provider detail", message: "secret" }))
      .toBe("smtp_test_failed");
  });

  it("valida superadmin de plataforma, rate limit, test mode e allowlist no servidor", () => {
    expect(edge).toContain('sb.rpc("is_platform_superadmin"');
    expect(edge).not.toContain('r.role === "administrador"');
    expect(edge).toContain('route === "kinghost_smtpi" ? "test_smtp_connection_candidate" : baseRateAction');
    expect(edge).toContain("loadRuntimeConfig(sb, readWorkerEnv)");
    expect(edge).toContain("evaluateControlledSmtpTest(env, controlledRecipient, readiness.controlled_test_send_ready)");
    expect(edge).toContain("confirm_controlled_send: z.literal(true).optional()");
    expect(edge).toContain('const controlledRecipient = "teste@refilinformatica.com.br"');
    expect(edge).toContain("DELIVERY_ENABLED: true, EMAIL_ENABLED: true");
    expect(edge).toContain('.eq("outcome", "ambiguous")');
  });

  it("separa conexão sem envio do envio real confirmado", () => {
    expect(ui).toContain('{ mode: "connection" }');
    expect(ui).toContain("Testar conexão do provedor");
    expect(ui).toContain("Verifica rede, TLS, protocolo SMTP e autenticação. Nenhum e-mail é enviado.");
    expect(ui).toContain("Confirmar envio real de teste?");
    expect(ui).toContain('{ mode: "send", to, confirm_controlled_send: true }');
    expect(ui).toContain("O sucesso confirma apenas o aceite pelo servidor SMTP, não a entrega na caixa postal.");
    expect(ui).toContain("Servidor SMTP aceitou a mensagem. Verifique a caixa de entrada e spam.");
  });

  it("exibe as duas etapas na aba real de plataforma sem depender das flags de entrega", () => {
    expect(platformHome).toContain('import ComunicacaoConfigTab from "@/pages/configuracoes/ComunicacaoConfigTab"');
    expect(platformHome).toContain('<TabsContent value="comunicacao">');
    expect(platformHome).toContain("<ComunicacaoConfigTab />");
    expect(ui).toContain("Testar conexão do provedor");
    expect(ui).toContain("Enviar e-mail de teste");
    expect(ui).not.toContain("Diagnóstico do provedor de e-mail");
    expect(ui).toContain("!connectionConfigReady");
    expect(ui).toContain("!view.smtp_readiness.controlled_test_send_ready");
    expect(ui).toContain("Este teste ignora somente as flags operacionais de entrega.");
    expect(ui).toContain("Envio bloqueado:");
    const smtpCardStart = ui.indexOf("Provedor de e-mail (SMTP)");
    const smtpCardEnd = ui.indexOf("{/* WhatsApp */}");
    const smtpCard = ui.slice(smtpCardStart, smtpCardEnd);
    expect(smtpCard).toContain("Salvar provedor de e-mail");
    expect(smtpCard).toContain("Testar conexão do provedor");
    expect(smtpCard).toContain("Enviar e-mail de teste");
    expect(smtpCard.indexOf("Salvar provedor de e-mail")).toBeLessThan(smtpCard.indexOf("Testar conexão do provedor"));
    expect(smtpCard.indexOf("Testar conexão do provedor")).toBeLessThan(smtpCard.indexOf("Enviar e-mail de teste"));
    expect(ui).toContain('aria-live="polite"');
    expect(ui).toContain("grid-cols-1 gap-3 md:grid-cols");
  });

  it("preserva proteção contra clique duplo nos dois diagnósticos", () => {
    expect(ui).toContain("if (testingConnection || testingSmtpi || testingEmail) return;");
    expect(ui).toContain("testingEmail || testingConnection || testingSmtpi");
  });

  it("oferece SMTPi somente após recusa TCP e sem persistir durante o teste", () => {
    expect(ui).toContain('(connectionResult?.code ?? view.smtp.last_connection_code) === "smtp_tcp_refused"');
    expect(ui).toContain('candidate_provider_route: "kinghost_smtpi"');
    expect(ui).toContain("Nenhum e-mail será enviado e a configuração atual não será alterada.");
    expect(ui).toContain("Testar SMTPi");
    expect(edge).toContain("buildSmtpCandidateRuntime(env, route)");
    expect(edge).toContain("probeSmtpProviderInDeno(candidate.env)");
    expect(edge).not.toContain("smtp_host:");
  });

  it("habilita aplicação somente após PASS e altera apenas o host", () => {
    expect(ui).toContain("smtpiResult?.ok");
    expect(ui).toContain("Usar SMTPi como servidor");
    expect(ui).toContain("{ smtp: { host: candidateHost } }");
    expect(ui).toContain("Porta, usuário, remetente e senha serão preservados.");
    expect(ui).toContain("setConnectionResult(null)");
    expect(ui).toContain("setSmtpiResult(null)");
  });

  it("mantém auditoria candidata sanitizada e separada", () => {
    expect(edge).toContain('"smtp_connection_candidate_test"');
    expect(edge).toContain('route === "kinghost_smtpi"');
    expect(edge).not.toMatch(/safeLog\([^\n]*SMTP_HOST|safeLog\([^\n]*SMTP_USER|safeLog\([^\n]*SMTP_PASSWORD/);
  });
});