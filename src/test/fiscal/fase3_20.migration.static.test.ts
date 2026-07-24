/**
 * Fase Fiscal 3.20 — Auditoria estática da migration aditiva
 * `restoration/20260804000000_fiscal_microrganismos_product_association.sql`.
 *
 * Garante que a migration:
 *   - Adiciona a coluna `product_id uuid` em `public.microrganismos`.
 *   - Cria FK para `public.produtos(id)` com ON DELETE RESTRICT.
 *   - Cria índice de busca + partial UNIQUE parcial em `product_id`.
 *   - NÃO faz backfill (nenhum UPDATE público).
 *   - NÃO faz DELETE em nenhuma tabela.
 *   - NÃO cria/alterna policies ou GRANTs (reutiliza os existentes).
 */
import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const CANDIDATES = [
  "supabase/migrations/20260804000000_fiscal_microrganismos_product_association.sql",
  "restoration/20260804000000_fiscal_microrganismos_product_association.sql",
];

function loadMigration(): string {
  for (const p of CANDIDATES) {
    const abs = join(process.cwd(), p);
    if (existsSync(abs)) return readFileSync(abs, "utf8");
  }
  throw new Error(
    "Migration 20260804000000 não encontrada em supabase/migrations/ nem em restoration/.",
  );
}

describe("Fase 3.20 — migration microrganismos.product_id (estática)", () => {
  const sql = loadMigration();

  it("adiciona coluna product_id uuid nullable, sem NOT NULL", () => {
    expect(sql).toMatch(/ALTER TABLE public\.microrganismos\s+ADD COLUMN IF NOT EXISTS product_id uuid NULL/i);
    expect(sql).not.toMatch(/product_id uuid NOT NULL/i);
  });

  it("cria FK para produtos(id) com ON DELETE RESTRICT", () => {
    expect(sql).toMatch(/microrganismos_product_id_fkey/);
    expect(sql).toMatch(/REFERENCES public\.produtos\(id\)/i);
    expect(sql).toMatch(/ON DELETE RESTRICT/i);
  });

  it("cria índice de busca e unicidade parcial (NULL permitido)", () => {
    expect(sql).toMatch(/CREATE INDEX IF NOT EXISTS microrganismos_product_id_idx/i);
    expect(sql).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS microrganismos_product_id_unique/i);
    // Ambos os índices devem ter WHERE product_id IS NOT NULL.
    const unique = sql.match(/CREATE UNIQUE INDEX[\s\S]+?product_id_unique[\s\S]+?;/i)?.[0] ?? "";
    expect(unique).toMatch(/WHERE product_id IS NOT NULL/i);
  });

  it("NÃO faz backfill (nenhum UPDATE em microrganismos)", () => {
    // A migration pode conter linhas de comentário mencionando UPDATE em
    // exemplos, mas nenhuma instrução ativa deve alterar dados.
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
