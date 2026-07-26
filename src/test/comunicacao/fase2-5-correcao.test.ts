/**
 * Testes contratuais — Fase 2.5 (correção pontual).
 * Sem rede. Lê artefatos TS diretamente do repositório.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const apiSrc = readFileSync(join(ROOT, "src/features/comunicacao/api.ts"), "utf8");
const uiSrc = readFileSync(
  join(ROOT, "src/features/comunicacao/ui/ComunicacaoAdminPage.tsx"),
  "utf8",
);

describe("Fase 2.5 · api.ts hardening", () => {
  it("remove cast 'null as unknown as string' de p_source_type", () => {
    expect(apiSrc).not.toMatch(/null as unknown as string/);
    expect(apiSrc).toMatch(/administrative_important_update[\s\S]{0,300}p_source_type:\s*null,/);
  });

  it("fetchCommunicationHealth só devolve códigos allowlisted", () => {
    expect(apiSrc).toMatch(/CommunicationHealthErrorCode/);
    expect(apiSrc).toMatch(/"function_unavailable"/);
    expect(apiSrc).toMatch(/"unauthorized"/);
    expect(apiSrc).toMatch(/"unexpected_error"/);
    // Nunca retorna message/name bruto ao chamador.
    expect(apiSrc).not.toMatch(/error:\s*error\.message/);
    expect(apiSrc).not.toMatch(/error:\s*\(e as Error\)\.message/);
    expect(apiSrc).not.toMatch(/error:\s*error\.message\s*\?\?\s*"invoke_error"/);
  });

  it("mapHealthError mapeia 401/403 para unauthorized e 404/501 etc. para function_unavailable", () => {
    expect(apiSrc).toMatch(/status === 401 \|\| status === 403[\s\S]{0,80}"unauthorized"/);
    expect(apiSrc).toMatch(/404[\s\S]{0,80}"function_unavailable"/);
  });
});

describe("Fase 2.5 · CanalVerificacaoPanel", () => {
  it("restringe canal a email e whatsapp (sem in_app/push)", () => {
    const idx = uiSrc.indexOf("function CanalVerificacaoPanel");
    const block = uiSrc.slice(idx, idx + 4000);
    expect(block).toMatch(/type CanalVerificavel = "email" \| "whatsapp"/);
    // Nenhuma <option> in_app/push dentro do painel.
    expect(block).not.toMatch(/<option[^>]*value="in_app"/);
    expect(block).not.toMatch(/<option[^>]*value="push"/);
  });

  it("canal determina as flags (mutuamente adequadas) e não há checkboxes ambíguos", () => {
    const idx = uiSrc.indexOf("function CanalVerificacaoPanel");
    const block = uiSrc.slice(idx, idx + 4000);
    expect(block).toMatch(/p_email_verificado:\s*canal === "email" \? true : null/);
    expect(block).toMatch(/p_telefone_verificado:\s*canal === "whatsapp" \? true : null/);
    expect(block).not.toMatch(/setEmailV/);
    expect(block).not.toMatch(/setFoneV/);
  });

  it("mensagem de confirmação indica canal e sujeito marcados", () => {
    const idx = uiSrc.indexOf("function CanalVerificacaoPanel");
    const block = uiSrc.slice(idx, idx + 4000);
    expect(block).toMatch(/marcado[\s\S]{0,20}como[\s\S]{0,20}verificado/i);
    expect(block).toMatch(/lastMarked\.canal/);
    expect(block).toMatch(/lastMarked\.id/);
  });

  it("erro não exibe message bruta", () => {
    const idx = uiSrc.indexOf("function CanalVerificacaoPanel");
    const block = uiSrc.slice(idx, idx + 4000);
    expect(block).not.toMatch(/mut\.error as Error\)\.message/);
    expect(block).toMatch(/Não foi possível registrar a verificação\./);
  });

  it("continua admin-only na UI (gestor não vê os painéis)", () => {
    // Ambos os painéis só renderizam quando isAdmin.
    expect(uiSrc).toMatch(/isAdmin[\s\S]{0,120}CanalHealthPanel[\s\S]{0,120}CanalVerificacaoPanel/);
    // Ramo !isAdmin exibe apenas mensagem informativa (sem painéis).
    expect(uiSrc).toMatch(/!isAdmin[\s\S]{0,400}Diagnóstico e verificação de canais/);
  });
});

describe("Fase 2.5 · CanalHealthPanel", () => {
  it("renderiza mensagens genéricas por código, sem message bruta", () => {
    const idx = uiSrc.indexOf("function CanalHealthPanel");
    const block = uiSrc.slice(idx, idx + 4000);
    expect(block).toMatch(/d\.error === "unauthorized"/);
    expect(block).toMatch(/d\.error === "function_unavailable"/);
    // Nunca imprime d.error diretamente como texto.
    expect(block).not.toMatch(/\{d\.error \?\? "erro desconhecido"\}/);
  });
});
