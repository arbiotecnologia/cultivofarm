/**
 * Fase Corretiva — Perfis Fiscais — Blocos 2 e 6.
 *
 * Testes por contrato/estrutura (sem executar rede):
 *  - Bloco 2: filtro de status é server-side (antes do range), não há
 *    filter local, count vem do subconjunto filtrado, e as opções não
 *    dependem da página. Busca e status coexistem. Sem status, o join
 *    permanece left (produtos sem perfil incluídos).
 *  - Bloco 6: rótulo "Prontidão mínima" com ajuda contextual nas três
 *    telas de perfis fiscais.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../../..");
const HOOK = readFileSync(
  resolve(ROOT, "src/hooks/useProductFiscalProfiles.ts"),
  "utf8",
);
const OPTIONS = readFileSync(
  resolve(ROOT, "src/lib/fiscal/fiscalOptions.ts"),
  "utf8",
);
const PROD = readFileSync(
  resolve(ROOT, "src/pages/configuracoes/FiscalProdutos.tsx"),
  "utf8",
);
const SERV = readFileSync(
  resolve(ROOT, "src/pages/configuracoes/FiscalServicos.tsx"),
  "utf8",
);
const CLI = readFileSync(
  resolve(ROOT, "src/pages/configuracoes/FiscalClientes.tsx"),
  "utf8",
);

describe("Bloco 2 — filtro de status server-side", () => {
  it("não filtra items localmente por profile_status após a resposta", () => {
    expect(HOOK).not.toMatch(/items\.filter\([^)]*profile_status/);
    expect(HOOK).not.toMatch(/\.filter\(\s*\(\s*it\s*\)\s*=>\s*it\.profile_status\s*===\s*params\.status/);
  });

  it("usa !inner + .eq referenciado no ramo com status", () => {
    expect(HOOK).toMatch(/product_fiscal_profiles!inner\(/);
    expect(HOOK).toMatch(/\.eq\(\s*"product_fiscal_profiles\.profile_status"/);
  });

  it("aplica .eq de status ANTES de .range()", () => {
    const idxEq = HOOK.indexOf('"product_fiscal_profiles.profile_status"');
    const idxRange = HOOK.indexOf(".range(from, to)");
    expect(idxEq).toBeGreaterThan(-1);
    expect(idxRange).toBeGreaterThan(-1);
    expect(idxEq).toBeLessThan(idxRange);
  });

  it("ramo sem status mantém left join (produtos sem perfil incluídos)", () => {
    expect(HOOK).toMatch(/product_fiscal_profiles\(id, profile_status/);
  });

  it("count sempre pede exact (subconjunto filtrado)", () => {
    const matches = HOOK.match(/count:\s*"exact"/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });

  it("statuses são derivados da lista canônica, não da página", () => {
    expect(HOOK).toMatch(/PRODUCT_FISCAL_PROFILE_STATUSES/);
    expect(HOOK).not.toMatch(/new Set\([\s\S]*profile_status/);
  });

  it("busca por nome/código permanece nos dois ramos", () => {
    const orCount = (HOOK.match(/nome\.ilike\.%\$\{safeTerm\}%,codigo\.ilike\.%\$\{safeTerm\}%/g) ?? []).length;
    expect(orCount).toBe(2);
  });

  it("paginação server-side via .range() nos dois ramos", () => {
    const rangeCount = (HOOK.match(/\.range\(from, to\)/g) ?? []).length;
    expect(rangeCount).toBe(2);
  });

  it("nunca usa SELECT amplo (*)", () => {
    expect(HOOK).not.toMatch(/from\("produtos"\)[\s\S]{0,80}\.select\(\s*"\*"/);
  });

  it("valida status contra a lista canônica antes de aplicar (evita SQL fora do CHECK)", () => {
    expect(HOOK).toMatch(/isProductFiscalProfileStatus/);
  });

  it("expõe lista canônica alinhada ao CHECK da migration", () => {
    expect(OPTIONS).toMatch(/PRODUCT_FISCAL_PROFILE_STATUSES/);
    for (const s of [
      "DRAFT",
      "PENDING_ACCOUNTING",
      "VALIDATED",
      "BLOCKED",
      "NOT_FISCALLY_SOLD",
    ]) {
      expect(OPTIONS).toContain(`"${s}"`);
    }
  });
});

describe("Bloco 6 — Prontidão mínima com ajuda contextual", () => {
  const HELP =
    "Verificação inicial dos campos essenciais. A revisão contábil e os demais dados fiscais continuam necessários antes da emissão.";

  it("FiscalProdutos usa 'Prontidão mínima' com ajuda", () => {
    expect(PROD).toContain(">Prontidão mínima<");
    expect(PROD).toContain(HELP);
    expect(PROD).not.toMatch(/>Prontidão</);
  });

  it("FiscalServicos usa 'Prontidão mínima' com ajuda", () => {
    expect(SERV).toContain(">Prontidão mínima<");
    expect(SERV).toContain(HELP);
    expect(SERV).not.toMatch(/>Prontidão</);
  });

  it("FiscalClientes usa 'Prontidão mínima' com ajuda", () => {
    expect(CLI).toContain(">Prontidão mínima<");
    expect(CLI).toContain(HELP);
    expect(CLI).not.toMatch(/>Prontidão</);
  });

  it("não altera regra de emissão (nenhuma menção a 'apto para emissão' ligada a minimally_classified)", () => {
    for (const src of [PROD, SERV, CLI]) {
      expect(src).not.toMatch(/apto\s+para\s+emiss/i);
    }
  });
});
