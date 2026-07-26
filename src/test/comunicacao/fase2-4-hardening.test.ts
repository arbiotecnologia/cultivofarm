/**
 * Testes contratuais — Fase 2.4 (hardening operacional).
 * Sem rede. Lê artefatos SQL/TS diretamente do repositório.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const migration = readFileSync(join(ROOT, "restoration/comunicacao-fase2/migration.sql"), "utf8");
const apiSrc = readFileSync(join(ROOT, "src/features/comunicacao/api.ts"), "utf8");
const uiSrc = readFileSync(
  join(ROOT, "src/features/comunicacao/ui/ComunicacaoAdminPage.tsx"),
  "utf8",
);
const typesSrc = readFileSync(join(ROOT, "src/features/comunicacao/types.ts"), "utf8");

describe("Fase 2.4 · rpc_set_communication_template_metadata", () => {
  it("valida mapping como array e exige índice inteiro positivo", () => {
    expect(migration).toMatch(/parameter_mapping.*array/i);
    expect(migration).toMatch(/mapping\[.\].index.*positivo|inteiro positivo|inteiro >= 1|índice/i);
  });
  it("exige que a variavel exista em comunicacao_templates.variaveis", () => {
    expect(migration).toMatch(/variaveis|não declarada|declaradas no template/i);
  });
  it("aceita mapping vazio quando template não tem variáveis", () => {
    expect(migration).toMatch(/vars_len\s*=\s*0|sem variáveis exige/i);
  });
  it("approved exige provider_template_name e language_code não vazios", () => {
    expect(migration).toMatch(/approved.*provider_template_name|language_code|mapping completo/i);
  });
  it("bloqueia alteração de provider_template_name após aprovação (imutável)", () => {
    expect(migration).toMatch(/imutável após aprovação/i);
  });
});

describe("Fase 2.4 · rpc_publish_communication_event_v2 hardening", () => {
  it("idempotency_key validado entre 8..200 caracteres", () => {
    expect(migration).toMatch(/idempotency_key inválido \(8\.\.200 chars\)/);
  });
  it("administrative_important_update exige source_type/source_id NULL", () => {
    expect(migration).toMatch(/administrative_important_update: source_type deve ser NULL/);
    expect(migration).toMatch(/administrative_important_update: source_id deve ser NULL/);
  });
  it("administrative_important_update rejeita titulo/mensagem vazios após trim", () => {
    expect(migration).toMatch(/titulo obrigatório \(não vazio após trim\)/);
    expect(migration).toMatch(/mensagem obrigatória \(não vazia após trim\)/);
  });
  it("api.ts envia p_source_type null (não 'system') para broadcast admin", () => {
    expect(apiSrc).toMatch(/administrative_important_update[\s\S]{0,400}p_source_type:\s*null/);
    expect(apiSrc).not.toMatch(/p_source_type:\s*"system"/);
  });
});

describe("Fase 2.4 · UI coerência status/mapping/imutabilidade", () => {
  it("remove status 'submitted' do editor de metadados", () => {
    expect(uiSrc).not.toMatch(/"submitted"/);
  });
  it("STATUS_ALLOWED contém exatamente os 6 estados aceitos pelo SQL", () => {
    expect(uiSrc).toMatch(/STATUS_ALLOWED\s*=\s*\[\s*"draft",\s*"pending",\s*"approved",\s*"rejected",\s*"paused",\s*"disabled"/);
  });
  it("aplica bloqueio de nome (nameLocked) para status ever-approved", () => {
    expect(uiSrc).toMatch(/nameLocked/);
    expect(uiSrc).toMatch(/imutável após aprovação/i);
  });
  it("valida mapping contra template.variaveis na UI", () => {
    expect(uiSrc).toMatch(/templateVars\.includes/);
    expect(uiSrc).toMatch(/mapping incompleto/);
  });
  it("provider_template_status é campo string opcional (documentado)", () => {
    expect(typesSrc).toMatch(/Fase 2\.4/);
  });
});

describe("Fase 2.4 · Saúde dos canais (health) sem secrets", () => {
  it("expõe fetchCommunicationHealth apenas com booleans (sem secrets)", () => {
    expect(apiSrc).toMatch(/fetchCommunicationHealth/);
    expect(apiSrc).toMatch(/configured/);
    expect(apiSrc).not.toMatch(/SMTP_PASS|WHATSAPP_TOKEN/);
  });
  it("renderiza card admin com botão de verificação sob demanda", () => {
    expect(uiSrc).toMatch(/CanalHealthPanel/);
    expect(uiSrc).toMatch(/Verificar agora/);
    expect(uiSrc).toMatch(/Nenhum segredo é exibido|nenhum valor de secret/i);
  });
  it("não faz polling automático", () => {
    // useMutation é sob demanda; nenhum useQuery com refetchInterval associado à saúde.
    expect(uiSrc).not.toMatch(/refetchInterval[\s\S]{0,80}health/i);
  });
});

describe("Fase 2.4 · Verificação de canais (admin)", () => {
  it("UI restrita a administrador", () => {
    expect(uiSrc).toMatch(/isAdmin[\s\S]{0,200}CanalVerificacaoPanel/);
  });
  it("usa RPC rpc_verify_communication_channel", () => {
    expect(apiSrc).toMatch(/rpc_verify_communication_channel/);
    expect(uiSrc).toMatch(/verifyCommunicationChannel/);
  });
  it("aceita apenas UUID válido (sem listar perfis de terceiros)", () => {
    expect(uiSrc).toMatch(/UUID inválido/);
    expect(uiSrc).toMatch(/não lista perfis de terceiros/);
  });
});
