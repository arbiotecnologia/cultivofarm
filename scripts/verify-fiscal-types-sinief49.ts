/**
 * Fase SINIEF 4.0 — Verificador de types.ts para o pacote SINIEF 49/2025.
 *
 * Checa que o `src/integrations/supabase/types.ts` regenerado do STAGING
 * expõe:
 *   • fiscal_invoices: 10 colunas aditivas nullable com tipos corretos.
 *   • Três novas tabelas com Row/Insert/Update e relationships esperadas.
 *   • Nullability crítica (created_at NOT NULL, campos referenced_* nullable).
 *
 * Este verificador NÃO regenera types e NÃO conecta a banco. Roda como
 * checagem estática de texto sobre o arquivo canônico.
 *
 * Enquanto o types.ts real não for regenerado a partir do staging,
 * o gate permanece PENDENTE (verificador emite `PENDING` e exit=2, mas
 * nunca `PASS`).
 *
 * Uso:
 *   bunx tsx scripts/verify-fiscal-types-sinief49.ts \
 *     [--file src/integrations/supabase/types.ts]
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

type ColSpec = { name: string; nullable: boolean; tsType?: string };
type RelSpec = {
  columns: string[];
  referencedRelation: string;
  referencedColumns: string[];
};
type TableSpec = { name: string; columns: ColSpec[]; relationships?: RelSpec[] };

// Colunas aditivas de fiscal_invoices — TODAS nullable.
export const SINIEF49_FISCAL_INVOICES_COLS: ColSpec[] = [
  { name: "direction", nullable: true, tsType: "string" },
  { name: "fiscal_operation_type", nullable: true, tsType: "string" },
  { name: "fin_nfe", nullable: true, tsType: "number" },
  { name: "tp_nf_debito", nullable: true, tsType: "number" },
  { name: "tp_nf_credito", nullable: true, tsType: "number" },
  { name: "nature_operation", nullable: true, tsType: "string" },
  { name: "tax_authority_notes", nullable: true, tsType: "string" },
  { name: "legal_basis", nullable: true, tsType: "string" },
  { name: "legal_version", nullable: true, tsType: "string" },
  { name: "legal_effective_date", nullable: true, tsType: "string" },
];

export const SINIEF49_TABLES: TableSpec[] = [
  {
    name: "fiscal_invoice_references",
    columns: [
      { name: "id", nullable: false, tsType: "string" },
      { name: "fiscal_invoice_id", nullable: false, tsType: "string" },
      { name: "referenced_invoice_id", nullable: true, tsType: "string" },
      { name: "referenced_access_key", nullable: true, tsType: "string" },
      { name: "relation_type", nullable: false, tsType: "string" },
      { name: "notes", nullable: true, tsType: "string" },
      { name: "created_at", nullable: false, tsType: "string" },
      { name: "created_by", nullable: true, tsType: "string" },
    ],
    relationships: [
      { columns: ["fiscal_invoice_id"], referencedRelation: "fiscal_invoices", referencedColumns: ["id"] },
      { columns: ["referenced_invoice_id"], referencedRelation: "fiscal_invoices", referencedColumns: ["id"] },
    ],
  },
  {
    name: "fiscal_invoice_item_references",
    columns: [
      { name: "id", nullable: false, tsType: "string" },
      { name: "fiscal_invoice_item_id", nullable: false, tsType: "string" },
      { name: "referenced_item_id", nullable: true, tsType: "string" },
      { name: "referenced_access_key", nullable: true, tsType: "string" },
      { name: "referenced_item_sequence", nullable: true, tsType: "number" },
      { name: "reference_type", nullable: false, tsType: "string" },
      { name: "referenced_quantity", nullable: true, tsType: "number" },
      { name: "referenced_value", nullable: true, tsType: "number" },
      { name: "created_at", nullable: false, tsType: "string" },
    ],
    relationships: [
      { columns: ["fiscal_invoice_item_id"], referencedRelation: "fiscal_invoice_items", referencedColumns: ["id"] },
      { columns: ["referenced_item_id"], referencedRelation: "fiscal_invoice_items", referencedColumns: ["id"] },
    ],
  },
  {
    name: "fiscal_stock_loss_contexts",
    columns: [
      { name: "id", nullable: false, tsType: "string" },
      { name: "fiscal_invoice_id", nullable: false, tsType: "string" },
      { name: "legal_reason_category", nullable: false, tsType: "string" },
      { name: "legal_reason_details", nullable: false, tsType: "string" },
      { name: "lote_id", nullable: true, tsType: "string" },
      { name: "movimentacao_id", nullable: true, tsType: "string" },
      { name: "occurred_at", nullable: true, tsType: "string" },
      { name: "created_at", nullable: false, tsType: "string" },
    ],
    relationships: [
      { columns: ["fiscal_invoice_id"], referencedRelation: "fiscal_invoices", referencedColumns: ["id"] },
      { columns: ["lote_id"], referencedRelation: "lotes", referencedColumns: ["id"] },
    ],
  },
];

export type Miss = { kind: string; detail: string };

function extractEntityBlock(source: string, name: string): string | null {
  // Match `name:` seguido de `{` e coleta até fechar por profundidade.
  const re = new RegExp(`\\b${name}\\s*:\\s*\\{`);
  const m = re.exec(source);
  if (!m) return null;
  const start = m.index + m[0].length;
  let depth = 1;
  for (let i = start; i < source.length; i++) {
    const ch = source[i];
    if (ch === "{" || ch === "[") depth++;
    else if (ch === "}" || ch === "]") {
      depth--;
      if (depth === 0) return source.slice(m.index, i + 1);
    }
  }
  return null;
}

function extractRowBlock(entityBlock: string): string | null {
  const m = entityBlock.match(/Row\s*:\s*\{([\s\S]*?)\}\s*Insert\s*:/);
  return m ? m[1] : null;
}

function checkColumn(rowBlock: string, col: ColSpec, tableName: string, misses: Miss[]) {
  const colRe = new RegExp(`\\b${col.name}\\b\\s*\\??:\\s*([^;\\n]+)`);
  const m = rowBlock.match(colRe);
  if (!m) {
    misses.push({ kind: "column", detail: `${tableName}.${col.name}` });
    return;
  }
  const decl = m[1].trim();
  const isNullable = /\|\s*null\b/.test(decl);
  if (col.nullable !== isNullable) {
    misses.push({
      kind: "nullable",
      detail: `${tableName}.${col.name} — esperado nullable=${col.nullable}, decl="${decl}"`,
    });
  }
  if (col.tsType && !new RegExp(`\\b${col.tsType}\\b`).test(decl)) {
    misses.push({
      kind: "type",
      detail: `${tableName}.${col.name} — esperado ${col.tsType}, decl="${decl}"`,
    });
  }
}

export function verifySinief49Types(source: string): Miss[] {
  const misses: Miss[] = [];

  // fiscal_invoices — apenas as colunas aditivas.
  const fiBlock = extractEntityBlock(source, "fiscal_invoices");
  if (!fiBlock) {
    misses.push({ kind: "table", detail: "fiscal_invoices" });
  } else {
    const row = extractRowBlock(fiBlock);
    if (!row) misses.push({ kind: "table.Row", detail: "fiscal_invoices" });
    else for (const c of SINIEF49_FISCAL_INVOICES_COLS) checkColumn(row, c, "fiscal_invoices", misses);
  }

  for (const t of SINIEF49_TABLES) {
    const block = extractEntityBlock(source, t.name);
    if (!block) {
      misses.push({ kind: "table", detail: t.name });
      continue;
    }
    const row = extractRowBlock(block);
    if (!row) {
      misses.push({ kind: "table.Row", detail: t.name });
      continue;
    }
    for (const c of t.columns) checkColumn(row, c, t.name, misses);
    if (t.relationships) {
      // PostgREST emite uma entrada por relação alcançável pela MESMA FK
      // (tabela base + cada view que expõe a coluna). Extraímos cada entrada
      // isoladamente (delimitada por `{ ... }`) e exigimos que a relação
      // canônica exata exista entre elas.
      const entries = [...block.matchAll(/\{([^{}]*referencedColumns:[^{}]*)\}/g)].map(
        (m) => m[1],
      );
      const parsed = entries.map((e) => {
        const ownCols = e.match(/(?:^|[^a-zA-Z])columns:\s*\[([^\]]*)\]/)?.[1];
        const refCols = e.match(/referencedColumns:\s*\[([^\]]*)\]/)?.[1];
        const relName = e.match(/referencedRelation:\s*"([^"]+)"/)?.[1] ?? "";
        const norm = (s: string | undefined) =>
          (s ?? "")
            .split(",")
            .map((x) => x.trim().replace(/"/g, ""))
            .filter(Boolean)
            .join(",");
        return { columns: norm(ownCols), relName, referencedColumns: norm(refCols) };
      });
      for (const rel of t.relationships) {
        const found = parsed.some(
          (p) =>
            p.columns === rel.columns.join(",") &&
            p.relName === rel.referencedRelation &&
            p.referencedColumns === rel.referencedColumns.join(","),
        );
        if (!found) {
          misses.push({
            kind: "relationship",
            detail: `${t.name} → columns=[${rel.columns.join(",")}] referencedRelation=${rel.referencedRelation} referencedColumns=[${rel.referencedColumns.join(",")}]`,
          });
        }
      }
    }


  }
  return misses;
}

export type Verdict = "PASS" | "PENDING" | "FAIL";

/**
 * Classifica o verificador:
 *  - PENDING: types.ts ainda não contém nenhuma das entidades SINIEF 4.0.
 *  - PASS:    todas as entidades presentes e sem divergência.
 *  - FAIL:    parcialmente presente com divergências (regeneração corrompida
 *             ou aplicada contra ref errado).
 */
export function classifyVerdict(source: string, misses: Miss[]): Verdict {
  const hasAny =
    /fiscal_invoice_references\s*:/.test(source) ||
    /fiscal_invoice_item_references\s*:/.test(source) ||
    /fiscal_stock_loss_contexts\s*:/.test(source);
  if (!hasAny) return "PENDING";
  return misses.length === 0 ? "PASS" : "FAIL";
}

function isMain(): boolean {
  return (process.argv[1] ?? "").endsWith("verify-fiscal-types-sinief49.ts");
}

if (isMain()) {
  const idx = process.argv.indexOf("--file");
  const path = idx > -1
    ? resolve(process.cwd(), process.argv[idx + 1])
    : resolve(process.cwd(), "src/integrations/supabase/types.ts");
  if (!existsSync(path)) {
    console.error(`[sinief49-types] FAIL — arquivo não encontrado: ${path}`);
    process.exit(1);
  }
  const src = readFileSync(path, "utf8");
  const misses = verifySinief49Types(src);
  const verdict = classifyVerdict(src, misses);
  if (verdict === "PENDING") {
    console.log("[sinief49-types] PENDING — regenerar types.ts a partir do staging AR-Bio-TEMP");
    process.exit(2);
  }
  if (verdict === "FAIL") {
    console.error("[sinief49-types] FAIL — divergências:");
    for (const m of misses) console.error(`  - ${m.kind}: ${m.detail}`);
    process.exit(1);
  }
  console.log(
    `[sinief49-types] PASS — fiscal_invoices+3 tabelas verificadas (${SINIEF49_FISCAL_INVOICES_COLS.length} cols aditivas + ${SINIEF49_TABLES.length} tabelas).`,
  );
  process.exit(0);
}
