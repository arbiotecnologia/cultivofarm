import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Gate 4 UI · auditoria estática do painel de consentimento e do painel de templates.
 * Não invoca rede nem banco; garante que os arquivos existem e mantêm invariantes de segurança.
 */

const PANEL = "src/features/comunicacao/ui/ConsentimentoWhatsappPanel.tsx";
const ADMIN = "src/features/comunicacao/ui/ComunicacaoAdminPage.tsx";

function read(p: string) {
  return readFileSync(path.join(process.cwd(), p), "utf8");
}

describe("Gate 4 UI · painel de consentimento", () => {
  const src = read(PANEL);
  it("chama rpc_admin_set_whatsapp_consent, nunca acessa comunicacao_preferencias direto para mutação", () => {
    expect(src).toMatch(/rpc_admin_set_whatsapp_consent/);
    expect(src).not.toMatch(/from\(["']comunicacao_preferencias["']\)[^;]*\.update\(/);
    expect(src).not.toMatch(/from\(["']comunicacao_preferencias["']\)[^;]*\.insert\(/);
    expect(src).not.toMatch(/from\(["']comunicacao_consent_log["']\)[^;]*\.(insert|update|delete)\(/);
  });

  it("mascara telefone completo (mostra só últimos 4 dígitos)", () => {
    expect(src).toMatch(/slice\(-4\)/);
    expect(src).toMatch(/••••••/);
  });

  it("exige justificativa para opt_out", () => {
    expect(src).toMatch(/opt_out[\s\S]{0,200}Justificativa/i);
    expect(src).toMatch(/justificativa\.trim\(\)\.length\s*<\s*8/);
  });

  it("respeita canMutate — modo somente leitura para não-admin", () => {
    expect(src).toMatch(/canMutate/);
    expect(src).toMatch(/Somente administradores/);
  });

  it("exibe histórico de consentimento a partir de comunicacao_consent_log", () => {
    expect(src).toMatch(/from\(["']comunicacao_consent_log["']\)/);
    expect(src).toMatch(/order\(["']created_at["'],\s*\{\s*ascending:\s*false\s*\}\)/);
  });
});

describe("Gate 4 UI · painel de templates WhatsApp", () => {
  const src = read(ADMIN);
  it("mantém aba de consentimentos exclusiva para admin", () => {
    expect(src).toMatch(/"consentimentos"/);
    expect(src).toMatch(/aba === "consentimentos" && isAdmin/);
  });

  it("gate de ativação exige provider_template_status='approved' antes de mutar", () => {
    expect(src).toMatch(/provider_template_status !== "approved"/);
  });

  it("declara que sync Meta é server-side e indisponível nesta rodada", () => {
    expect(src).toMatch(/Sincronização automática do status Meta[\s\S]{0,120}indispon[íi]vel/i);
  });

  it("não expõe token Meta na UI", () => {
    expect(src).not.toMatch(/access_token/i);
    expect(src).not.toMatch(/WHATSAPP_ACCESS_TOKEN/);
  });
});

describe("Gate 4 · snapshot documental da RPC admin de consentimento", () => {
  const p = path.join(process.cwd(), "restoration/comunicacao-gate4/rpc_admin_set_whatsapp_consent.sql");
  const sql = readFileSync(p, "utf8");
  it("RPC restrita a administrador e revoga público/anon", () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.rpc_admin_set_whatsapp_consent/);
    expect(sql).toMatch(/SECURITY DEFINER/);
    expect(sql).toMatch(/has_role\([^,]+,\s*'administrador'/);
    expect(sql).toMatch(/REVOKE ALL[\s\S]{0,120}FROM PUBLIC/i);
    expect(sql).toMatch(/REVOKE ALL[\s\S]{0,120}anon/);
    expect(sql).toMatch(/GRANT EXECUTE[\s\S]{0,120}authenticated/);
  });
});

