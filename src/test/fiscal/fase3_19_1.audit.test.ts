/**
 * Fase Fiscal 3.19.1 — Auditoria estática:
 *   * Nenhum fluxo de CNPJ pode usar `unmask()` (numérico) — deve usar
 *     `unmaskCnpj` ou `unmaskCpfCnpj`.
 *   * Migration canônica existe em `supabase/migrations/` e o stub sem
 *     SQL executável existe em `restoration/migrations/`.
 *   * Migration canônica não altera `document_number` nem `cnpj`.
 *   * Migration canônica declara CHECK object + scanner de segredos.
 */
import { describe, test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../../..");
const read = (rel: string) => readFileSync(resolve(ROOT, rel), "utf8");

describe("Fase 3.19.1 — auditoria CNPJ nos consumidores", () => {
  const files = [
    "src/pages/configuracoes/FiscalEmpresa.tsx",
    "src/components/comercial/ParceiroB2BFormDialog.tsx",
    "src/pages/Configuracoes.tsx",
    "src/pages/clientes/ProdutoresTab.tsx",
  ];

  test.each(files)("%s não usa unmask() em campo CNPJ", (rel) => {
    const src = read(rel);
    // Rejeita chamadas `unmask(` na mesma linha em que aparece `cnpj`.
    const bad = src
      .split("\n")
      .map((ln, i) => ({ ln, i }))
      .filter(
        ({ ln }) =>
          /\bunmask\s*\(/.test(ln) &&
          /cnpj/i.test(ln) &&
          !/unmaskCnpj|unmaskCpfCnpj/.test(ln),
      );
    expect(bad, `linhas suspeitas em ${rel}: ${JSON.stringify(bad)}`).toEqual([]);
  });

  test("FiscalEmpresa: input CNPJ não força inputMode numérico", () => {
    const src = read("src/pages/configuracoes/FiscalEmpresa.tsx");
    // O <Input id="cnpj"> específico não deve declarar inputMode="numeric".
    // Verificação simples pelo bloco vizinho.
    const idx = src.indexOf('id="cnpj"');
    expect(idx).toBeGreaterThan(0);
    const window = src.slice(idx, idx + 400);
    expect(window).not.toMatch(/inputMode\s*=\s*["']numeric["']/);
  });
});

describe("Fase 3.19.1 — migration canônica", () => {
  const canonical = read("supabase/migrations/20260727000000_fiscal_fase3_19_rtc_2026.sql");
  const stub = read("restoration/migrations/20260727000000_fiscal_fase3_19_rtc_2026.sql");

  test("existe uma única cópia executável (canônica)", () => {
    expect(canonical).toContain("ADD COLUMN IF NOT EXISTS rtc_configuration");
    // Stub em restoration/migrations não tem SQL executável.
    expect(stub).not.toMatch(/ADD\s+COLUMN/i);
    expect(stub).not.toMatch(/CREATE\s+(OR\s+REPLACE\s+)?FUNCTION/i);
    // A cópia antiga em restoration/fiscal-fase3-19 foi removida.
    let dupExists = true;
    try {
      readFileSync(
        resolve(ROOT, "restoration/fiscal-fase3-19/20260727000000_fiscal_fase3_19_rtc_2026.sql"),
      );
    } catch {
      dupExists = false;
    }
    expect(dupExists).toBe(false);
  });

  test("não altera document_number nem cnpj", () => {
    expect(canonical).not.toMatch(/document_number/i);
    expect(canonical).not.toMatch(/ALTER\s+TABLE[^;]*\bcnpj\b/i);
  });

  test("declara CHECK object + scanner de segredos", () => {
    expect(canonical).toContain("jsonb_typeof(rtc_configuration) = 'object'");
    expect(canonical).toContain("jsonb_typeof(ibs_cbs_configuration) = 'object'");
    expect(canonical).toContain("public.fiscal_rtc_has_sensitive_key");
    // Função é IMMUTABLE STRICT com search_path fixo.
    expect(canonical).toMatch(/IMMUTABLE[\s\S]*STRICT[\s\S]*SET\s+search_path\s*=/i);
  });

  test("é transacional (BEGIN/COMMIT) e fail-fast se tabela ausente", () => {
    expect(canonical).toMatch(/^BEGIN;/m);
    expect(canonical).toMatch(/^COMMIT;/m);
    expect(canonical).toContain("Fase 3.19 abortada");
  });

  test("não altera production_enabled/providers/emissão/RLS/GRANTs de tabelas", () => {
    expect(canonical).not.toMatch(/production_enabled/i);
    expect(canonical).not.toMatch(/CREATE\s+POLICY/i);
    expect(canonical).not.toMatch(/DROP\s+POLICY/i);
    // GRANT permitido apenas na função scanner; nada em tabelas.
    const grantsOnTables = canonical.match(/GRANT[\s\S]*?ON\s+TABLE/gi);
    expect(grantsOnTables).toBeNull();
  });
});
