import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Fase Fiscal 2 — proibições de segurança:
 * Nenhum token, certificado, senha fiscal ou chamada externa introduzida.
 */
describe("Fiscal Fase 2 — sem integrações externas", () => {
  const files = [
    "src/components/financeiro/FiscalReadinessBanner.tsx",
    "src/pages/financeiro/NotasFiscais.tsx",
    "src/components/financeiro/FiscalTab.tsx",
    "restoration/fiscal_fase2_fundacao.sql",
  ];

  const forbidden = [
    "FOCUS_TOKEN", "SEFAZ_TOKEN", "NFSE_TOKEN", "CERT_PASSWORD",
    ".pfx", ".p12",
    "focusnfe.com.br", "nfse.gov.br",
    "Authorization: Bearer",
  ];

  for (const file of files) {
    it(`${file} não contém tokens/certificados/endpoints fiscais`, () => {
      const content = readFileSync(join(process.cwd(), file), "utf8");
      for (const bad of forbidden) {
        expect(content).not.toContain(bad);
      }
    });
  }
});

describe("Fiscal Fase 2 — copy da interface", () => {
  it("NotasFiscais não promete emissão real", () => {
    const content = readFileSync(
      join(process.cwd(), "src/pages/financeiro/NotasFiscais.tsx"),
      "utf8"
    );
    expect(content).not.toContain("Controle e emissão de documentos fiscais");
    expect(content).toContain("Registro e acompanhamento de documentos fiscais");
    expect(content).toContain("FiscalReadinessBanner");
  });

  it("Banner exibe aviso de emissão desabilitada", () => {
    const content = readFileSync(
      join(process.cwd(), "src/components/financeiro/FiscalReadinessBanner.tsx"),
      "utf8"
    );
    expect(content).toContain("Emissão integrada ainda não habilitada");
  });
});
