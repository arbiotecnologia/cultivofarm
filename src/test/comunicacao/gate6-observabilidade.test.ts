/**
 * Gate 6 — validações estáticas de observabilidade, matriz canônica e checklist.
 * Sem I/O de rede; sem envio real.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { classifyDeepLink } from "@/lib/notificacoes/deepLinkAllowlist";

const ROOT = process.cwd();

describe("Gate 6 · Matriz canônica de eventos", () => {
  const matriz = readFileSync(path.join(ROOT, "restoration/comunicacao-gate6/matriz-eventos.md"), "utf8");

  it("cobre todos os módulos obrigatórios", () => {
    for (const modulo of [
      "Solicitações do produtor",
      "Ordens de serviço",
      "Estoque",
      "Financeiro",
      "Agenda / visitas",
      "Administração",
    ]) {
      expect(matriz).toContain(modulo);
    }
  });

  it("reafirma flags OFF e regras disabled", () => {
    for (const flag of [
      "COMMUNICATION_DELIVERY_ENABLED=false",
      "EMAIL_DELIVERY_ENABLED=false",
      "WHATSAPP_DELIVERY_ENABLED=false",
      "COMMUNICATION_INAPP_ADAPTER_ENABLED=false",
      "WHATSAPP_WEBHOOK_ENABLED=false",
    ]) {
      expect(matriz).toContain(flag);
    }
  });

  it("deep links internos citados são autorizados para pelo menos um perfil", () => {
    // Amostra representativa; se a matriz mudar, este subset guarda o mínimo.
    const amostras: Array<[string, string[]]> = [
      ["/solicitacoes", ["tecnico_agronomo"]],
      ["/portal/solicitacoes/x", ["cliente_produtor"]],
      ["/producao/os/x", ["producao"]],
      ["/financeiro/faturas/x", ["financeiro"]],
      ["/agenda/consultor", ["consultor_tecnico"]],
      ["/notificacoes", ["cliente_produtor"]],
      ["/fluxo-tecnico/checkin/x", ["tecnico_agronomo"]],
    ];
    for (const [rota, perfis] of amostras) {
      const r = classifyDeepLink(rota, perfis);
      expect(r.ok, `rota ${rota} deveria ser autorizada para ${perfis.join(",")}`).toBe(true);
    }
  });

  it("rejeita rotas do portal para perfil interno sem permissão", () => {
    const r = classifyDeepLink("/portal/financeiro", ["producao"]);
    expect(r.ok).toBe(false);
  });
});

describe("Gate 6 · Checklist de homologação", () => {
  const cl = readFileSync(path.join(ROOT, "restoration/comunicacao-gate6/checklist-homologacao.md"), "utf8");

  it("distingue 'pronto para homologação' de 'homologado externamente'", () => {
    expect(cl).toMatch(/pronto para homologação/i);
    expect(cl).toMatch(/homologado externamente/i);
  });

  it("cobre SMTP, Meta/WABA, templates, opt-in, perfis, DLQ e encerramento", () => {
    for (const secao of [
      "SMTP sandbox / allowlist",
      "Credenciais Meta / WhatsApp",
      "Templates WhatsApp aprovados",
      "Telefones e consentimento",
      "Perfis de teste",
      "DLQ / Observabilidade",
      "Encerramento da janela",
    ]) {
      expect(cl).toContain(secao);
    }
  });

  it("obriga desligar flags e restaurar test_mode ao fim", () => {
    expect(cl).toMatch(/Desligar todas as flags de delivery/);
    expect(cl).toMatch(/test_mode_enabled=true/);
  });
});

describe("Gate 6 · Snapshot documental do RPC health/DLQ", () => {
  it("shape esperado do health snapshot está declarado no data-access", () => {
    const src = readFileSync(path.join(ROOT, "src/features/comunicacao/api.ts"), "utf8");
    expect(src).toContain("rpc_admin_communication_health_snapshot");
    expect(src).toMatch(/oldest_pending_age_seconds/);
    expect(src).toMatch(/success_rate_pct/);
    expect(src).toMatch(/realtime: \{ ready: boolean \}/);
  });
});
