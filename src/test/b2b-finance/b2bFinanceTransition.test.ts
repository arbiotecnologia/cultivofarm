import { describe, expect, it } from "vitest";
import { accessTargets, incompatibleRoles, needsLinkCas, parsePartnerLink, validateTransition } from "@/lib/configuracoes/userAdminRefinement";
import { b2bFinanceContextProbe } from "@/lib/authz/b2bFinanceContextProbe";
const P = "20000000-0000-4000-8000-000000000001";
const base = { actorId: "a", targetId: "t", from: "b2b", internalRoles: [] as string[], clienteId: null, reason: "motivo válido" };
describe("Financeiro B2B — transição no painel canônico", () => {
  it("destino só aparece com o gate; ON lista Financeiro B2B", () => {
    expect(accessTargets(false)).not.toContain("b2b_finance");
    expect(accessTargets(true)).toContain("b2b_finance");
  });
  it("gestor/técnico/produtor/interno são incompatíveis com Financeiro e vice-versa", () => {
    expect(incompatibleRoles(["parceiro_b2b", "parceiro_b2b_tecnico"], "b2b_finance")).toEqual(["parceiro_b2b", "parceiro_b2b_tecnico"]);
    expect(incompatibleRoles(["parceiro_b2b_financeiro"], "b2b")).toEqual(["parceiro_b2b_financeiro"]);
    expect(needsLinkCas("internal", ["parceiro_b2b_financeiro"])).toBe(true);
    expect(needsLinkCas("b2b", ["parceiro_b2b"])).toBe(false);
  });
  it("exige vínculo lido, parceiro quando não há vínculo, e recusa vínculo ambíguo/estrangeiro", () => {
    const v = (link: unknown, partnerId: string | null = null) => validateTransition({ ...base, to: "b2b_finance", currentRoles: ["parceiro_b2b"], removeRoles: ["parceiro_b2b"], link: link as never, partnerId });
    expect(v(null)).toMatch(/Aguarde/);
    expect(v({ contract: "PARTNER_LINK_V1", ambiguous: true, foreign: false, link: null })).toMatch(/inconsistente/);
    expect(v({ contract: "PARTNER_LINK_V1", ambiguous: false, foreign: true, link: null })).toMatch(/inconsistente/);
    expect(v({ contract: "PARTNER_LINK_V1", ambiguous: false, foreign: false, link: null })).toMatch(/Selecione o parceiro/);
    expect(v({ contract: "PARTNER_LINK_V1", ambiguous: false, foreign: false, link: null }, P)).toBeNull();
    expect(v({ contract: "PARTNER_LINK_V1", ambiguous: false, foreign: false, link: { partner_id: P, papel: "gestor", version: 2 } })).toBeNull();
    expect(validateTransition({ ...base, to: "b2b_finance", currentRoles: ["parceiro_b2b"], removeRoles: [], link: null })).toMatch(/Confirme a remoção/);
  });
  it("leitor de vínculo estrito", () => {
    expect(() => parsePartnerLink({ contract: "PARTNER_LINK_V1", ambiguous: false, foreign: false, link: { partner_id: P, papel: "diretor", version: 1 } })).toThrow();
    expect(() => parsePartnerLink({ contract: "PARTNER_LINK_V1", ambiguous: false, foreign: false, link: null, extra: 1 })).toThrow();
  });
});
describe("Financeiro B2B — sonda do monitor", () => {
  const cap = { contract: "B2B_FINANCE_ROLE_V1", allowed: true, partner_id: P, partner_name: "A", obligations_read: true, export: true, credit_read: true, writes: false };
  it("positivo gera fingerprint com parceiro; negação inelegível; inválido lança", () => {
    expect(b2bFinanceContextProbe(cap)).toEqual({ eligible: true, fingerprint: JSON.stringify(["B2B_FINANCE_ROLE_V1", P, true, true, true]) });
    expect(b2bFinanceContextProbe({ ...cap, partner_id: "20000000-0000-4000-8000-000000000002" }).fingerprint).not.toBe(b2bFinanceContextProbe(cap).fingerprint);
    expect(b2bFinanceContextProbe({ contract: "B2B_FINANCE_ROLE_V1", allowed: false, reason: "not_finance_actor" })).toEqual({ eligible: false, fingerprint: null });
    expect(() => b2bFinanceContextProbe({ ...cap, writes: true })).toThrow();
    expect(() => b2bFinanceContextProbe(null)).toThrow();
  });
});
