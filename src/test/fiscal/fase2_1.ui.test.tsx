import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Fase Fiscal 2.1 — asserts de UI:
 * módulo manual permanece funcional e nada de emissão real foi introduzido.
 */

function read(p: string) {
  return readFileSync(join(process.cwd(), p), "utf8");
}

describe("Fase Fiscal 2.1 — copy e ausência de emissão externa", () => {
  it("NotasFiscais mantém copy neutro e banner de prontidão", () => {
    const c = read("src/pages/financeiro/NotasFiscais.tsx");
    expect(c).toContain("Registro e acompanhamento de documentos fiscais");
    expect(c).toContain("FiscalReadinessBanner");
    expect(c).not.toContain("Controle e emissão de documentos fiscais");
  });

  it("Banner comunica que emissão integrada não está habilitada", () => {
    const c = read("src/components/financeiro/FiscalReadinessBanner.tsx");
    expect(c).toContain("Emissão integrada ainda não habilitada");
  });

  it("Telas fiscais não expõem botões de emissão/transmissão/certificado", () => {
    const files = [
      "src/pages/financeiro/NotasFiscais.tsx",
      "src/components/financeiro/FiscalTab.tsx",
      "src/components/financeiro/FiscalReadinessBanner.tsx",
    ];
    for (const f of files) {
      const c = read(f);
      expect(c, `${f} contém "Transmitir"`).not.toMatch(/Transmitir/i);
      expect(c, `${f} contém "Certificado"`).not.toMatch(/Certificado/i);
      expect(c, `${f} contém upload de token`).not.toMatch(/token\s*fiscal/i);
      expect(c, `${f} tem botão Emitir`).not.toMatch(/>\s*Emitir\s*</);
    }
  });

  it("FiscalTab continua chamando RPC manual pré-existente (módulo manual preservado)", () => {
    const c = read("src/components/financeiro/FiscalTab.tsx");
    expect(c).toContain("rpc_upsert_fiscal_invoice_manual");
    expect(c).toContain('DocumentosPanel');
  });
});

describe("Fase Fiscal 2.1 — nenhuma dependência de provedor fiscal introduzida", () => {
  it("package.json não referencia SDKs fiscais externos", () => {
    const pkg = JSON.parse(read("package.json"));
    const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
    for (const name of Object.keys(deps)) {
      expect(name.toLowerCase()).not.toMatch(/focus[-_]?nfe|nfse|sefaz|nfe[-_]?sdk/);
    }
  });
});
