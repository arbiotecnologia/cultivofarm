/**
 * Fase Fiscal 3.20 — Auditoria estática da migration aditiva
 * `supabase/migrations/20260804000000_fiscal_microrganismos_product_association.sql`.
 *
 * Garante que a migration:
 *   - Vive EXCLUSIVAMENTE em `supabase/migrations/` (fonte canônica).
 *   - `restoration/` não contém cópia executável, apenas stub documental.
 *   - Adiciona a coluna `product_id uuid` em `public.microrganismos`.
 *   - Cria FK para `public.produtos(id)` com ON DELETE RESTRICT.
 *   - Cria índice de busca em `product_id` (NÃO único).
 *   - NÃO cria UNIQUE em `product_id` (cardinalidade N:1 permitida).
 *   - NÃO faz backfill (nenhum UPDATE em microrganismos).
 *   - NÃO faz DELETE em nenhuma tabela.
 *   - NÃO cria/alterna policies ou GRANTs (reutiliza os existentes).
 */
import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const CANONICAL_PATH =
  "supabase/migrations/20260804000000_fiscal_microrganismos_product_association.sql";
const RESTORATION_PATH =
  "restoration/20260804000000_fiscal_microrganismos_product_association.sql";

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

describe("Fase 3.20 — migration microrganismos.product_id (estática)", () => {
  it("existe EXCLUSIVAMENTE em supabase/migrations/", () => {
    expect(existsSync(join(process.cwd(), CANONICAL_PATH))).toBe(true);
  });

  it("restoration/ não contém cópia executável, apenas stub", () => {
    if (!existsSync(join(process.cwd(), RESTORATION_PATH))) return;
    const stub = read(RESTORATION_PATH);
    // Nenhum comando DDL/DML executável.
    expect(stub).not.toMatch(/\bBEGIN\b/i);
    expect(stub).not.toMatch(/\bCOMMIT\b/i);
    expect(stub).not.toMatch(/\bALTER\s+TABLE\b/i);
    expect(stub).not.toMatch(/\bCREATE\s+(UNIQUE\s+)?INDEX\b/i);
    expect(stub).not.toMatch(/\bCREATE\s+POLICY\b/i);
    // Deve apontar para a migration canônica.
    expect(stub).toMatch(/supabase\/migrations\//);
  });

  const sql = read(CANONICAL_PATH);

  it("adiciona coluna product_id uuid nullable, sem NOT NULL", () => {
    expect(sql).toMatch(/ALTER TABLE public\.microrganismos\s+ADD COLUMN IF NOT EXISTS product_id uuid NULL/i);
    expect(sql).not.toMatch(/product_id uuid NOT NULL/i);
  });

  it("cria FK para produtos(id) com ON DELETE RESTRICT", () => {
    expect(sql).toMatch(/microrganismos_product_id_fkey/);
    expect(sql).toMatch(/REFERENCES public\.produtos\(id\)/i);
    expect(sql).toMatch(/ON DELETE RESTRICT/i);
  });

  it("cria índice parcial (NÃO único) de busca por product_id", () => {
    expect(sql).toMatch(/CREATE INDEX IF NOT EXISTS microrganismos_product_id_idx/i);
    const idx = sql.match(/CREATE INDEX[\s\S]+?product_id_idx[\s\S]+?;/i)?.[0] ?? "";
    expect(idx).toMatch(/WHERE product_id IS NOT NULL/i);
  });

  it("NÃO cria UNIQUE em product_id (cardinalidade N:1 permitida)", () => {
    const stripped = sql
      .split("\n")
      .filter((line) => !line.trim().startsWith("--"))
      .join("\n");
    expect(stripped).not.toMatch(/CREATE\s+UNIQUE\s+INDEX/i);
    expect(stripped).not.toMatch(/microrganismos_product_id_unique/i);
    expect(stripped).not.toMatch(/UNIQUE\s*\(\s*product_id\s*\)/i);
  });

  it("NÃO faz backfill (nenhum UPDATE em microrganismos)", () => {
    const stripped = sql
      .split("\n")
      .filter((line) => !line.trim().startsWith("--"))
      .join("\n");
    expect(stripped).not.toMatch(/\bUPDATE\s+public\.microrganismos\b/i);
    expect(stripped).not.toMatch(/\bUPDATE\s+microrganismos\b/i);
  });

  it("NÃO faz DELETE em nenhuma tabela", () => {
    const stripped = sql
      .split("\n")
      .filter((line) => !line.trim().startsWith("--"))
      .join("\n");
    expect(stripped).not.toMatch(/\bDELETE\s+FROM\b/i);
    expect(stripped).not.toMatch(/\bTRUNCATE\b/i);
    expect(stripped).not.toMatch(/\bDROP\s+TABLE\b/i);
  });

  it("NÃO cria ou altera policies e GRANTs (reutiliza os existentes)", () => {
    const stripped = sql
      .split("\n")
      .filter((line) => !line.trim().startsWith("--"))
      .join("\n");
    expect(stripped).not.toMatch(/\bCREATE\s+POLICY\b/i);
    expect(stripped).not.toMatch(/\bALTER\s+POLICY\b/i);
    expect(stripped).not.toMatch(/\bDROP\s+POLICY\b/i);
    expect(stripped).not.toMatch(/\bGRANT\b/i);
    expect(stripped).not.toMatch(/\bREVOKE\b/i);
  });
});
