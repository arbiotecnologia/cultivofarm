/**
 * Fase Homologação — Correção do seletor de clientes.
 *
 * Asserções estáticas: anti-join defensivo em `useFiscalClientesLite`,
 * SELECT mínimo, limite 20, estados preservados, `excludeIds` no
 * CustomerPicker e propagação a partir da lista já perfilada.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const HOOK = readFileSync(
  resolve(process.cwd(), "src/hooks/useFiscalClientesLite.ts"),
  "utf8",
);
const PAGE = readFileSync(
  resolve(process.cwd(), "src/pages/configuracoes/FiscalClientes.tsx"),
  "utf8",
);

describe("Fase Homologação — CustomerPicker sem duplicidade", () => {
  it("SELECT mínimo em clientes (id, nome, cpf_cnpj, codigo_cliente)", () => {
    expect(HOOK).toMatch(
      /\.from\("clientes"\)\s*\n?\s*\.select\("id, nome, cpf_cnpj, codigo_cliente"\)/,
    );
    // Nunca `select("*")` nem embed amplo.
    expect(HOOK).not.toMatch(/select\("\*"\)/);
    expect(HOOK).not.toMatch(/customer_fiscal_profiles!/);
  });

  it("mantém limit 20 e busca sanitizada", () => {
    expect(HOOK).toMatch(/\.limit\(20\)/);
    expect(HOOK).toMatch(/sanitizePostgrestTerm/);
  });

  it("consulta estreita: apenas customer_id restrito a .in(candidateIds)", () => {
    expect(HOOK).toMatch(/\.from\("customer_fiscal_profiles"\)/);
    expect(HOOK).toMatch(/\.select\("customer_id"\)/);
    expect(HOOK).toMatch(/\.in\("customer_id", candidateIds\)/);
    // Sem varredura ampla: não deve haver select all/range grande.
    expect(HOOK).not.toMatch(/customer_fiscal_profiles"\)\s*\.select\("\*"\)/);
    expect(HOOK).not.toMatch(/\.range\(0,\s*\d{4,}\)/);
  });

  it("preserva estados ok/permission_denied/error nas duas etapas", () => {
    // Duas ocorrências: consulta em clientes e consulta em profiles.
    const pdMatches = HOOK.match(/status:\s*"permission_denied"/g) ?? [];
    const errMatches = HOOK.match(/status:\s*"error"/g) ?? [];
    expect(pdMatches.length).toBeGreaterThanOrEqual(2);
    expect(errMatches.length).toBeGreaterThanOrEqual(2);
    expect(HOOK).toMatch(/status:\s*"ok"/);
  });

  it("expõe excludeIds e excludeProfiled com default true", () => {
    expect(HOOK).toMatch(/excludeIds\?:\s*readonly string\[\]/);
    expect(HOOK).toMatch(/excludeProfiled\s*=\s*options\.excludeProfiled\s*\?\?\s*true/);
    // Filtro extra .not("id","in",...) para defesa em profundidade.
    expect(HOOK).toMatch(/\.not\("id",\s*"in"/);
  });

  it("queryKey inclui excludeIds e excludeProfiled para invalidar cache", () => {
    expect(HOOK).toMatch(/queryKey:\s*\[[\s\S]*excludeProfiled[\s\S]*excludeIds/);
  });

  it("CustomerPicker recebe excludeIds e repassa ao hook", () => {
    expect(PAGE).toMatch(/excludeIds\?:\s*readonly string\[\]/);
    expect(PAGE).toMatch(
      /useFiscalClientesLite\(term,\s*\{\s*excludeIds,\s*excludeProfiled:\s*true\s*\}\)/,
    );
  });

  it("página propaga knownProfiledCustomerIds (defesa adicional cache)", () => {
    expect(PAGE).toMatch(/knownProfiledCustomerIds=\{customerIds\}/);
    expect(PAGE).toMatch(/excludeIds=\{knownProfiledCustomerIds\}/);
  });

  it("edição preserva identidade imutável (customer_id readOnly)", () => {
    expect(PAGE).toMatch(/readOnly\s*\n\s*disabled/);
  });

  it("documento sempre mascarado no seletor (maskDocument)", () => {
    expect(PAGE).toMatch(/maskDocument\(c\.cpf_cnpj\)/);
  });

  it("UUID real do cliente é o que é salvo (onPick(c.id))", () => {
    expect(PAGE).toMatch(/onPick\(c\.id\)/);
  });
});
