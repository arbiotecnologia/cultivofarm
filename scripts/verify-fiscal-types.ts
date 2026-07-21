/**
 * Fase Fiscal 3.0 (complemento) — verificação estática robusta de
 * src/integrations/supabase/types.ts.
 *
 * Uso:
 *   bunx tsx scripts/verify-fiscal-types.ts
 *
 * Verifica, por whitelist, presença de:
 *   - tabelas fiscais
 *   - colunas obrigatórias de cada tabela (nome + tipo TS + nullable)
 *   - views fiscais + colunas mínimas
 *   - RPCs (nome + argumentos + tipo de retorno)
 *   - relacionamentos FK principais
 *
 * NÃO gera tipos. Falha com exit 1 na primeira ausência. Nunca inventa tipos.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const TYPES_PATH = resolve(process.cwd(), "src/integrations/supabase/types.ts");

type ColSpec = { name: string; nullable: boolean; tsType?: string };
type TableSpec = { name: string; columns: ColSpec[]; relationships?: string[] };
type ViewSpec = { name: string; columns: string[] };
type RpcSpec = { name: string; args: string[]; returns: string };

const TABLES: TableSpec[] = [
  {
    name: "company_fiscal_settings",
    columns: [
      { name: "id", nullable: false },
      { name: "company_cnpj", nullable: false, tsType: "string" },
      { name: "environment", nullable: false, tsType: "string" },
      { name: "created_at", nullable: false },
      { name: "updated_at", nullable: false },
    ],
  },
  {
    name: "product_fiscal_profiles",
    columns: [
      { name: "id", nullable: false },
      { name: "product_id", nullable: false },
      { name: "ncm", nullable: true, tsType: "string" },
      { name: "cfop", nullable: true, tsType: "string" },
    ],
    relationships: ["product_id"],
  },
  {
    name: "service_fiscal_profiles",
    columns: [
      { name: "id", nullable: false },
      { name: "service_id", nullable: false },
      { name: "item_lc_116", nullable: true, tsType: "string" },
    ],
    relationships: ["service_id"],
  },
  {
    name: "customer_fiscal_profiles",
    columns: [
      { name: "id", nullable: false },
      { name: "customer_id", nullable: false },
      { name: "tax_regime", nullable: true, tsType: "string" },
    ],
    relationships: ["customer_id"],
  },
  {
    name: "fiscal_invoices",
    columns: [
      { name: "id", nullable: false },
      { name: "company_cnpj", nullable: false, tsType: "string" },
      { name: "document_model", nullable: false, tsType: "string" },
      { name: "series", nullable: false, tsType: "string" },
      { name: "invoice_number", nullable: false },
      { name: "environment", nullable: false, tsType: "string" },
      { name: "status", nullable: false, tsType: "string" },
    ],
  },
  {
    name: "fiscal_invoice_items",
    columns: [
      { name: "id", nullable: false },
      { name: "invoice_id", nullable: false },
    ],
    relationships: ["invoice_id"],
  },
  {
    name: "fiscal_events",
    columns: [
      { name: "id", nullable: false },
      { name: "invoice_id", nullable: false },
      { name: "event_type", nullable: false, tsType: "string" },
      { name: "payload", nullable: true },
    ],
    relationships: ["invoice_id"],
  },
  {
    name: "fiscal_idempotency_keys",
    columns: [
      { name: "id", nullable: false },
      { name: "key", nullable: false, tsType: "string" },
    ],
  },
  {
    name: "fiscal_audit_log",
    columns: [
      { name: "id", nullable: false },
      { name: "action", nullable: false, tsType: "string" },
      { name: "payload", nullable: true },
    ],
  },
];

const VIEWS: ViewSpec[] = [
  { name: "v_fiscal_products_readiness", columns: ["product_id", "ready"] },
  { name: "v_fiscal_services_readiness", columns: ["service_id", "ready"] },
  { name: "v_fiscal_customers_readiness", columns: ["customer_id", "ready"] },
  { name: "v_fiscal_company_readiness", columns: ["ready"] },
  { name: "v_fiscal_invoices_summary", columns: ["status"] },
];

const RPCS: RpcSpec[] = [
  {
    name: "rpc_fiscal_event_manual",
    args: ["invoice_id", "event_type"],
    returns: "Json",
  },
  {
    name: "mask_sensitive_jsonb",
    args: ["payload"],
    returns: "Json",
  },
];

if (!existsSync(TYPES_PATH)) {
  console.error(`[verify-fiscal-types] FAIL — arquivo não encontrado: ${TYPES_PATH}`);
  process.exit(1);
}

const source = readFileSync(TYPES_PATH, "utf8");

type Miss = { kind: string; detail: string };
const missing: Miss[] = [];

// Extrai o bloco de definição `<tableName>: { Row: { ... }; ... }`
function extractTableBlock(name: string): string | null {
  const re = new RegExp(`\\b${name}\\s*:\\s*\\{[\\s\\S]*?Relationships\\s*:\\s*\\[[\\s\\S]*?\\]\\s*\\}`, "m");
  const m = source.match(re);
  return m ? m[0] : null;
}
function extractRowBlock(tableBlock: string): string | null {
  const m = tableBlock.match(/Row\s*:\s*\{([\s\S]*?)\}\s*Insert\s*:/);
  return m ? m[1] : null;
}

for (const t of TABLES) {
  const block = extractTableBlock(t.name);
  if (!block) {
    missing.push({ kind: "table", detail: t.name });
    continue;
  }
  const row = extractRowBlock(block);
  if (!row) {
    missing.push({ kind: "table.Row", detail: t.name });
    continue;
  }
  for (const col of t.columns) {
    // Supabase gera `col_name: type | null` (nullable) ou `col_name: type` (not null).
    // Aceitamos também variantes com `?:`.
    const colRe = new RegExp(`\\b${col.name}\\b\\s*\\??:\\s*([^;\\n]+)`);
    const m = row.match(colRe);
    if (!m) {
      missing.push({ kind: "column", detail: `${t.name}.${col.name}` });
      continue;
    }
    const decl = m[1].trim();
    const isNullable = /\|\s*null\b/.test(decl);
    if (col.nullable !== isNullable) {
      missing.push({
        kind: "nullable",
        detail: `${t.name}.${col.name} — esperado nullable=${col.nullable}, encontrado decl "${decl}"`,
      });
    }
    if (col.tsType && !new RegExp(`\\b${col.tsType}\\b`).test(decl)) {
      missing.push({
        kind: "type",
        detail: `${t.name}.${col.name} — esperado ${col.tsType}, encontrado "${decl}"`,
      });
    }
  }
  if (t.relationships) {
    for (const rel of t.relationships) {
      const relRe = new RegExp(`columns:\\s*\\[\\s*"${rel}"\\s*\\]`);
      if (!relRe.test(block)) {
        missing.push({ kind: "relationship", detail: `${t.name} → ${rel}` });
      }
    }
  }
}

for (const v of VIEWS) {
  const block = extractTableBlock(v.name);
  if (!block) {
    missing.push({ kind: "view", detail: v.name });
    continue;
  }
  const row = extractRowBlock(block);
  if (!row) {
    missing.push({ kind: "view.Row", detail: v.name });
    continue;
  }
  for (const c of v.columns) {
    if (!new RegExp(`\\b${c}\\b\\s*\\??:`).test(row)) {
      missing.push({ kind: "view.column", detail: `${v.name}.${c}` });
    }
  }
}

for (const r of RPCS) {
  // Supabase gera `Functions: { rpc_name: { Args: {...}; Returns: ... } }`
  const fnRe = new RegExp(
    `\\b${r.name}\\s*:\\s*\\{[\\s\\S]*?Args\\s*:\\s*\\{([\\s\\S]*?)\\}[\\s\\S]*?Returns\\s*:\\s*([^;\\n]+)`,
    "m",
  );
  const m = source.match(fnRe);
  if (!m) {
    missing.push({ kind: "rpc", detail: r.name });
    continue;
  }
  const argsBlock = m[1];
  const returns = m[2].trim();
  for (const a of r.args) {
    if (!new RegExp(`\\b${a}\\b\\s*\\??:`).test(argsBlock)) {
      missing.push({ kind: "rpc.arg", detail: `${r.name}(${a})` });
    }
  }
  if (!new RegExp(`\\b${r.returns}\\b`).test(returns)) {
    missing.push({
      kind: "rpc.returns",
      detail: `${r.name} — esperado ${r.returns}, encontrado "${returns}"`,
    });
  }
}

if (missing.length > 0) {
  console.error("[verify-fiscal-types] FAIL — divergências encontradas:");
  for (const m of missing) console.error(`  - ${m.kind}: ${m.detail}`);
  console.error("\nRegenerar externamente conforme docs/fiscal-fase3-0-types-regen.md.");
  process.exit(1);
}

console.log(
  `[verify-fiscal-types] OK — ${TABLES.length} tabelas, ${VIEWS.length} views, ${RPCS.length} RPCs verificadas (colunas, nullables, tipos, relacionamentos, args, retorno).`,
);
