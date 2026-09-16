/**
 * Fase SINIEF 4.0 — Testes do verificador de types.ts SINIEF 49.
 * Gate permanece PENDING enquanto types.ts real não é regenerado.
 */
import { describe, test, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  SINIEF49_FISCAL_INVOICES_COLS,
  SINIEF49_TABLES,
  classifyVerdict,
  verifySinief49Types,
} from "../../../../../scripts/verify-fiscal-types-sinief49";

function buildFakeTypes(): string {
  // Constrói um types.ts sintético contendo as entidades esperadas.
  const invoicesRows = SINIEF49_FISCAL_INVOICES_COLS.map(
    (c) => `          ${c.name}: ${c.tsType} | null`,
  ).join("\n");

  const invoicesBlock = `
      fiscal_invoices: {
        Row: {
          id: string
${invoicesRows}
        }
        Insert: { id?: string }
        Update: { id?: string }
        Relationships: []
      }`;

  const newTables = SINIEF49_TABLES.map((t) => {
    const cols = t.columns
      .map((c) => `          ${c.name}: ${c.tsType}${c.nullable ? " | null" : ""}`)
      .join("\n");
    const rels = (t.relationships ?? [])
      .map(
        (r) => `          {
            foreignKeyName: "${t.name}_${r.columns.join("_")}_fkey"
            columns: [${r.columns.map((c) => `"${c}"`).join(", ")}]
            isOneToOne: false
            referencedRelation: "${r.referencedRelation}"
            referencedColumns: [${r.referencedColumns.map((c) => `"${c}"`).join(", ")}]
          },`,
      )
      .join("\n");
    return `
      ${t.name}: {
        Row: {
${cols}
        }
        Insert: { id?: string }
        Update: { id?: string }
        Relationships: [
${rels}
        ]
      }`;
  }).join("\n");

  return `export type Database = { public: { Tables: {${invoicesBlock}\n${newTables}
      }, Views: {}, Functions: {}, Enums: {}, CompositeTypes: {} } }
`;
}

describe("verify-fiscal-types-sinief49", () => {
  test("tipos canônicos cobrem 100% do contrato SINIEF 49 → veredito canônico PASS", () => {
    const real = fs.readFileSync(
      path.resolve(process.cwd(), "src/integrations/supabase/cultivofarm.types.ts"),
      "utf8",
    );
    const misses = verifySinief49Types(real);
    const verdict = classifyVerdict(real, misses);
    // Expectativa canônica exata. NÃO relaxar para aceitar FAIL: qualquer
    // divergência mantém o gate da Fase 7 REJEITADO até que types.ts seja
    // regenerado e o contrato SINIEF 49 esteja integralmente coberto.
    expect(misses).toEqual([]);
    expect(verdict).toBe("PASS");
  });



  test("classifica PASS quando types.ts sintético cobre 100% do contrato", () => {
    const fake = buildFakeTypes();
    const misses = verifySinief49Types(fake);
    expect(misses).toEqual([]);
    expect(classifyVerdict(fake, misses)).toBe("PASS");
  });

  test("classifica FAIL quando alguma coluna diverge (nullability)", () => {
    // Torna referenced_invoice_id NOT NULL indevidamente.
    const broken = buildFakeTypes().replace(
      /referenced_invoice_id: string \| null/,
      "referenced_invoice_id: string",
    );
    const misses = verifySinief49Types(broken);
    expect(misses.some((m) => m.kind === "nullable")).toBe(true);
    expect(classifyVerdict(broken, misses)).toBe("FAIL");
  });

  test("relationships obrigatórios são cobrados", () => {
    const stripped = buildFakeTypes().replace(
      /referencedRelation: "fiscal_invoices"/g,
      'referencedRelation: "other"',
    );
    const misses = verifySinief49Types(stripped);
    expect(misses.some((m) => m.kind === "relationship")).toBe(true);
  });
});
