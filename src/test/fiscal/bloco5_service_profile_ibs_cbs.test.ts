/**
 * Fase Corretiva — Bloco 5 (final).
 * Auditoria estática do backend aditivo (RPCs por p_profile_id) e do
 * consumo tipado no frontend. Sem banco, sem RLS, sem deploy.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const MIG = readFileSync(
  resolve("supabase/migrations/20260727000000_fiscal_fase3_19_rtc_2026.sql"),
  "utf8",
);
const HOOK = readFileSync(resolve("src/hooks/useFiscalRtc.ts"), "utf8");
const CARD = readFileSync(resolve("src/components/fiscal/IbsCbsItemCard.tsx"), "utf8");
const PAGE = readFileSync(resolve("src/pages/configuracoes/FiscalServicos.tsx"), "utf8");

describe("Bloco 5 — migration canônica (aditiva, ainda não aplicada)", () => {
  it("mantém transação única BEGIN/COMMIT", () => {
    expect((MIG.match(/^BEGIN;/gm) ?? []).length).toBe(1);
    expect((MIG.match(/^COMMIT;/gm) ?? []).length).toBe(1);
  });

  it("preserva as RPCs antigas por p_service_id (retrocompatíveis)", () => {
    expect(MIG).toMatch(/CREATE OR REPLACE FUNCTION public\.rpc_fiscal_service_ibs_cbs_get\(p_service_id uuid\)/);
    expect(MIG).toMatch(/CREATE OR REPLACE FUNCTION public\.rpc_fiscal_service_ibs_cbs_save\(\s*p_service_id uuid/);
    expect(MIG).toMatch(/CREATE OR REPLACE FUNCTION public\.rpc_fiscal_product_ibs_cbs_get\(p_product_id uuid\)/);
  });

  it("adiciona RPCs profile-id com autorização, payload validado, revisão e conflito", () => {
    const getFn = /CREATE OR REPLACE FUNCTION public\.rpc_fiscal_service_profile_ibs_cbs_get\(p_profile_id uuid\)[\s\S]*?END; \$F\$;/;
    const saveFn = /CREATE OR REPLACE FUNCTION public\.rpc_fiscal_service_profile_ibs_cbs_save\([\s\S]*?END; \$F\$;/;
    const gm = MIG.match(getFn)?.[0] ?? "";
    const sm = MIG.match(saveFn)?.[0] ?? "";
    expect(gm).not.toBe("");
    expect(sm).not.toBe("");
    // GET: leitura restrita pelo mesmo helper das RPCs atuais
    expect(gm).toMatch(/_fiscal_rtc_can_read\(v_uid\)/);
    expect(gm).toMatch(/FROM public\.service_fiscal_profiles[\s\S]*WHERE id = p_profile_id AND is_active = true/);
    // SAVE: exige autenticação + admin OU financeiro (idêntico às atuais)
    expect(sm).toMatch(/FISCAL_UNAUTHENTICATED/);
    expect(sm).toMatch(/has_role\(v_uid,'administrador'::app_role\)[\s\S]*has_role\(v_uid,'financeiro'::app_role\)/);
    expect(sm).toMatch(/_fiscal_rtc_assert_payload\(payload,'item'\)/);
    // Concorrência otimista + FISCAL_CONFLICT
    expect(sm).toMatch(/expected_revision IS NOT NULL AND expected_revision <> v_current/);
    expect(sm).toMatch(/FISCAL_CONFLICT/);
    expect(sm).toMatch(/FISCAL_ITEM_NOT_FOUND/);
    // Filtro por id + is_active — não aceita service_id/source_reference do cliente
    expect(sm).toMatch(/WHERE id = p_profile_id AND is_active = true/);
    expect(sm).not.toMatch(/WHERE service_id = p_profile_id/);
    expect(sm).not.toMatch(/source_reference\s*=\s*p_/);
  });

  it("grants estreitos: authenticated + revoga anon/PUBLIC nas duas novas RPCs", () => {
    expect(MIG).toMatch(/'rpc_fiscal_service_profile_ibs_cbs_get\(uuid\)'/);
    expect(MIG).toMatch(/'rpc_fiscal_service_profile_ibs_cbs_save\(uuid,jsonb,text\)'/);
    // O bloco DO que aplica REVOKE anon/PUBLIC + GRANT authenticated é único.
    expect((MIG.match(/REVOKE ALL ON FUNCTION public\.%s FROM anon/g) ?? []).length).toBe(1);
    expect((MIG.match(/GRANT EXECUTE ON FUNCTION public\.%s TO authenticated/g) ?? []).length).toBe(1);
  });
});

describe("Bloco 5 — hook useFiscalRtcItem (frontend tipado)", () => {
  it("expõe union tipada product | service | service_profile (sem `as any`)", () => {
    expect(HOOK).toMatch(/type FiscalRtcItemKind = "product" \| "service" \| "service_profile"/);
    // Sem UUID artificial nem coerção arriscada
    expect(HOOK).not.toMatch(/\bas any\b/);
    expect(HOOK).not.toMatch(/crypto\.randomUUID|uuidv4|00000000-0000-0000-0000-000000000000/);
  });

  it("mapeia service_profile → RPCs novas com p_profile_id", () => {
    expect(HOOK).toMatch(/rpc_fiscal_service_profile_ibs_cbs_get/);
    expect(HOOK).toMatch(/rpc_fiscal_service_profile_ibs_cbs_save/);
    expect(HOOK).toMatch(/"p_profile_id"/);
    // idKey tipado — sem ambiguidade
    expect(HOOK).toMatch(/idKey: "p_product_id" \| "p_service_id" \| "p_profile_id"/);
  });

  it("preserva mapeamento antigo para product/service", () => {
    expect(HOOK).toMatch(/rpc_fiscal_product_ibs_cbs_get[\s\S]*rpc_fiscal_service_ibs_cbs_get/);
    expect(HOOK).toMatch(/"p_product_id"/);
    expect(HOOK).toMatch(/"p_service_id"/);
  });

  it("mantém tratamento de FISCAL_CONFLICT e forbidden compartilhado", () => {
    expect(HOOK).toMatch(/FISCAL_CONFLICT/);
    expect(HOOK).toMatch(/FISCAL_FORBIDDEN/);
    expect(HOOK).toMatch(/expected_revision:/);
  });
});

describe("Bloco 5 — FiscalServicos passa o id real do perfil", () => {
  it("consumidor usa kind=service_profile e itemId=item.id (identidade estável)", () => {
    expect(PAGE).toMatch(/kind="service_profile"\s+itemId=\{item\.id \?\? null\}/);
    // Não deve mais passar service_id (que pode ser null legítimo).
    expect(PAGE).not.toMatch(/kind="service"\s+itemId=\{item\.service_id/);
  });
});

describe("Bloco 5 — IbsCbsItemCard aceita service_profile e mensagens contextuais", () => {
  it("union do prop kind inclui service_profile", () => {
    expect(CARD).toMatch(/kind: "product" \| "service" \| "service_profile"/);
  });

  it("estado vazio contextual pt-BR (carregando/indisponível), sem genérico enquanto carrega", () => {
    expect(CARD).toMatch(/Carregando o perfil fiscal…/);
    expect(CARD).toMatch(/Perfil fiscal indisponível para edição de IBS\/CBS\./);
    // O card ainda mostra "Selecione um item" para produto/serviço, mas
    // NÃO como texto padrão enquanto o perfil está carregando.
    expect(CARD).toMatch(/rtc\.loading\s*\n?\s*\?\s*"Carregando o perfil fiscal…"/);
  });

  it("desabilita edição para usuário sem canEdit (independente do kind)", () => {
    expect(CARD).toMatch(/const disabled = !canEdit \|\| rtc\.loading \|\| rtc\.saving \|\| !itemId/);
  });

  it("mantém título correto para serviço (product | service | service_profile)", () => {
    expect(CARD).toMatch(/const isService = kind === "service" \|\| kind === "service_profile"/);
  });
});
