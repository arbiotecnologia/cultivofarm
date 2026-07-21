/**
 * Fase Fiscal 3.0.1 — Verificador de src/integrations/supabase/types.ts
 * reescrito para refletir o SCHEMA REAL aplicado pelas migrations
 * 20260721000000, 20260721010000 e 20260722000000.
 *
 * Uso:
 *   bunx tsx scripts/verify-fiscal-types.ts [--file <path>]
 *
 * Retorna exit 1 na primeira divergência (entidade/coluna/nullable/tipo/RPC).
 * NÃO gera tipos.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

type ColSpec = { name: string; nullable: boolean; tsType?: string };
type TableSpec = { name: string; columns: ColSpec[]; relationships?: string[] };
type ViewSpec = { name: string; columns: string[] };
type RpcSpec = { name: string; args: string[]; returns: string };

// ---- Contrato real esperado (§I do relatório) -----------------------------
export const EXPECTED_TABLES: TableSpec[] = [
  {
    name: "company_fiscal_settings",
    columns: [
      { name: "id", nullable: false },
      { name: "cnpj", nullable: true, tsType: "string" },
      { name: "fiscal_environment", nullable: false, tsType: "string" },
      { name: "fiscal_provider", nullable: false, tsType: "string" },
      { name: "configuration_status", nullable: false, tsType: "string" },
      { name: "nfe_enabled", nullable: false, tsType: "boolean" },
      { name: "nfse_enabled", nullable: false, tsType: "boolean" },
      { name: "production_enabled", nullable: false, tsType: "boolean" },
    ],
  },
  {
    name: "product_fiscal_profiles",
    columns: [
      { name: "id", nullable: false },
      { name: "product_id", nullable: false },
      { name: "ncm", nullable: true, tsType: "string" },
      { name: "cfop_in_state", nullable: true, tsType: "string" },
      { name: "cfop_interstate", nullable: true, tsType: "string" },
      { name: "profile_status", nullable: false, tsType: "string" },
    ],
    relationships: ["product_id"],
  },
  {
    name: "service_fiscal_profiles",
    columns: [
      { name: "id", nullable: false },
      { name: "service_id", nullable: true },
      { name: "source_reference", nullable: true, tsType: "string" },
      { name: "lc116_item", nullable: true, tsType: "string" },
      { name: "cnae", nullable: true, tsType: "string" },
      { name: "profile_status", nullable: false, tsType: "string" },
    ],
  },
  {
    name: "customer_fiscal_profiles",
    columns: [
      { name: "id", nullable: false },
      { name: "customer_id", nullable: false },
      { name: "taxpayer_indicator", nullable: true, tsType: "string" },
      { name: "fiscal_municipality_ibge_code", nullable: true, tsType: "string" },
      { name: "profile_status", nullable: false, tsType: "string" },
    ],
    relationships: ["customer_id"],
  },
  {
    name: "fiscal_invoices",
    columns: [
      { name: "id", nullable: false },
      { name: "company_cnpj", nullable: true, tsType: "string" },
      { name: "document_model", nullable: true, tsType: "string" },
      { name: "environment", nullable: true, tsType: "string" },
      { name: "series", nullable: true, tsType: "string" },
      { name: "invoice_number", nullable: true },
      { name: "status", nullable: false, tsType: "string" },
    ],
  },
  {
    name: "fiscal_invoice_items",
    columns: [
      { name: "id", nullable: false },
      { name: "fiscal_invoice_id", nullable: false },
    ],
    relationships: ["fiscal_invoice_id"],
  },
  {
    name: "fiscal_events",
    columns: [
      { name: "id", nullable: false },
      // Nullability real: pode ser NOT NULL após 3.0.1 se backfill limpo;
      // aceitamos ambos aqui para tolerar staging pre/pos 3.0.1.
      { name: "fiscal_invoice_id", nullable: true },
      { name: "event_type", nullable: false, tsType: "string" },
      { name: "request_snapshot", nullable: true },
      { name: "response_snapshot", nullable: true },
    ],
    relationships: ["fiscal_invoice_id"],
  },
  {
    name: "fiscal_idempotency_keys",
    columns: [
      { name: "id", nullable: false },
      { name: "idempotency_key", nullable: false, tsType: "string" },
      { name: "fiscal_invoice_id", nullable: true },
    ],
  },
  {
    name: "fiscal_audit_log",
    columns: [
      { name: "id", nullable: false },
      { name: "action", nullable: false, tsType: "string" },
      { name: "changed_by", nullable: true },
      { name: "changed_at", nullable: false },
      { name: "old_values", nullable: true },
      { name: "new_values", nullable: true },
    ],
  },
];

export const EXPECTED_VIEWS: ViewSpec[] = [
  { name: "v_fiscal_company_readiness", columns: ["configuration_status"] },
  { name: "v_product_fiscal_readiness", columns: ["product_id", "profile_status"] },
  { name: "v_service_fiscal_readiness", columns: ["service_id", "profile_status"] },
  { name: "v_customer_fiscal_readiness", columns: ["customer_id", "profile_status"] },
  {
    name: "v_fiscal_document_reconciliation_pending",
    columns: ["fiscal_invoice_id", "reconciliation_status"],
  },
];

export const EXPECTED_RPCS: RpcSpec[] = [
  {
    name: "rpc_fiscal_event_manual",
    args: ["p_invoice_id", "p_event_type"],
    returns: "string",
  },
  {
    name: "mask_sensitive_jsonb",
    args: ["v"],
    returns: "Json",
  },
];

// ---- Extração e verificação ------------------------------------------------
function extractEntityBlock(source: string, name: string): string | null {
  const re = new RegExp(
    `\\b${name}\\s*:\\s*\\{[\\s\\S]*?Relationships\\s*:\\s*\\[[\\s\\S]*?\\]\\s*\\}`,
    "m",
  );
  const m = source.match(re);
  return m ? m[0] : null;
}
function extractRowBlock(entityBlock: string): string | null {
  const m = entityBlock.match(/Row\s*:\s*\{([\s\S]*?)\}\s*Insert\s*:/);
  return m ? m[1] : null;
}

export type Miss = { kind: string; detail: string };

export function verifyTypes(source: string): Miss[] {
  const missing: Miss[] = [];

  for (const t of EXPECTED_TABLES) {
    const block = extractEntityBlock(source, t.name);
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
          detail: `${t.name}.${col.name} — esperado nullable=${col.nullable}, decl="${decl}"`,
        });
      }
      if (col.tsType && !new RegExp(`\\b${col.tsType}\\b`).test(decl)) {
        missing.push({
          kind: "type",
          detail: `${t.name}.${col.name} — esperado ${col.tsType}, decl="${decl}"`,
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

  for (const v of EXPECTED_VIEWS) {
    const block = extractEntityBlock(source, v.name);
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

  for (const r of EXPECTED_RPCS) {
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

  return missing;
}

// ---- CLI -------------------------------------------------------------------
function isMain(): boolean {
  const argv1 = process.argv[1] ?? "";
  return argv1.endsWith("verify-fiscal-types.ts");
}

if (isMain()) {
  const fileArgIdx = process.argv.indexOf("--file");
  const path =
    fileArgIdx > -1
      ? resolve(process.cwd(), process.argv[fileArgIdx + 1])
      : resolve(process.cwd(), "src/integrations/supabase/types.ts");

  if (!existsSync(path)) {
    console.error(`[verify-fiscal-types] FAIL — arquivo não encontrado: ${path}`);
    process.exit(1);
  }
  const source = readFileSync(path, "utf8");
  const missing = verifyTypes(source);
  if (missing.length > 0) {
    console.error("[verify-fiscal-types] FAIL — divergências:");
    for (const m of missing) console.error(`  - ${m.kind}: ${m.detail}`);
    console.error("\nRegenerar externamente conforme docs/fiscal-fase3-0-types-regen.md.");
    process.exit(1);
  }
  console.log(
    `[verify-fiscal-types] OK — ${EXPECTED_TABLES.length} tabelas, ${EXPECTED_VIEWS.length} views, ${EXPECTED_RPCS.length} RPCs verificadas.`,
  );
}
