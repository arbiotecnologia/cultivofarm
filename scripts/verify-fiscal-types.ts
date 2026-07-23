/**
 * Fase Fiscal 3.0.2-D — Verificador estrito do types.ts.
 *
 * Contrato final:
 *   - Tabelas 9: Row/Insert/Update + nullability + tipo TS + Relationships completas
 *     (referencedRelation + referencedColumns exatos).
 *   - Views 5: Row + colunas mínimas.
 *   - RPCs: assinatura exata (args obrigatórios, opcionais, sem args extras, retorno).
 *   - fiscal_events.fiscal_invoice_id DEVE ser NOT NULL (contrato final 3.0.2-A).
 *
 * Uso: bunx tsx scripts/verify-fiscal-types.ts [--file <path>]
 * Exit 1 em qualquer divergência.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

type ColSpec = { name: string; nullable: boolean; tsType?: string };
type RelSpec = { columns: string[]; referencedRelation: string; referencedColumns: string[] };
type TableSpec = { name: string; columns: ColSpec[]; relationships?: RelSpec[] };
type ViewSpec = { name: string; columns: string[] };
type RpcSpec = {
  name: string;
  requiredArgs: string[];
  optionalArgs: string[];
  returns: string;
};

// ---- Contrato ---------------------------------------------------------------
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
    relationships: [{ columns: ["product_id"], referencedRelation: "produtos", referencedColumns: ["id"] }],
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
    relationships: [{ columns: ["customer_id"], referencedRelation: "clientes", referencedColumns: ["id"] }],
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
    relationships: [{ columns: ["fiscal_invoice_id"], referencedRelation: "fiscal_invoices", referencedColumns: ["id"] }],
  },
  {
    name: "fiscal_events",
    columns: [
      { name: "id", nullable: false },
      // 3.0.2-A contrato final: NOT NULL. Zero tolerância.
      { name: "fiscal_invoice_id", nullable: false },
      { name: "event_type", nullable: false, tsType: "string" },
      { name: "request_snapshot", nullable: true },
      { name: "response_snapshot", nullable: true },
    ],
    relationships: [{ columns: ["fiscal_invoice_id"], referencedRelation: "fiscal_invoices", referencedColumns: ["id"] }],
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
  { name: "v_fiscal_document_reconciliation_pending", columns: ["fiscal_invoice_id", "reconciliation_status"] },
];

export const EXPECTED_RPCS: RpcSpec[] = [
  {
    name: "rpc_fiscal_event_manual",
    requiredArgs: ["p_invoice_id", "p_event_type"],
    optionalArgs: ["p_notes"],
    returns: "string",
  },
  { name: "mask_sensitive_jsonb", requiredArgs: ["v"], optionalArgs: [], returns: "Json" },
];

// ---- Extração --------------------------------------------------------------
function extractSectionBlock(source: string, section: "Views" | "Functions"): string | null {
  // Scope: only within the `public:` schema block (skip graphql_public etc.).
  const pubRe = /\n\s{2}public\s*:\s*\{/;
  const pubM = pubRe.exec(source);
  if (!pubM) return null;
  const pubStart = pubM.index + pubM[0].length;
  let depth = 1;
  let pubEnd = source.length;
  for (let i = pubStart; i < source.length; i++) {
    const ch = source[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) { pubEnd = i; break; }
    }
  }
  const pubBlock = source.slice(pubStart, pubEnd);
  const re = new RegExp(`\\n\\s{4}${section}\\s*:\\s*\\{`);
  const m = re.exec(pubBlock);
  if (!m) return null;
  const start = m.index + m[0].length;
  depth = 1;
  for (let i = start; i < pubBlock.length; i++) {
    const ch = pubBlock[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return pubBlock.slice(start, i);
    }
  }
  return null;
}
function extractEntityBlock(source: string, name: string): string | null {
  const re = new RegExp(
    `\\b${name}\\s*:\\s*\\{[\\s\\S]*?Relationships\\s*:\\s*\\[[\\s\\S]*?\\]\\s*\\}`,
    "m",
  );
  const m = source.match(re);
  return m ? m[0] : null;
}
function extractSubBlock(entityBlock: string, label: "Row" | "Insert" | "Update"): string | null {
  const next = { Row: "Insert", Insert: "Update", Update: "Relationships" }[label];
  const re = new RegExp(`${label}\\s*:\\s*\\{([\\s\\S]*?)\\}\\s*${next}\\s*:`);
  const m = entityBlock.match(re);
  return m ? m[1] : null;
}
function hasTopLevelKey(sectionBlock: string, name: string): boolean {
  // Match `name:` only at brace-depth 0 within the section block.
  let depth = 0;
  const key = name;
  for (let i = 0; i < sectionBlock.length; i++) {
    const ch = sectionBlock[i];
    if (ch === "{") depth++;
    else if (ch === "}") depth--;
    else if (depth === 0) {
      if (sectionBlock.startsWith(key, i)) {
        const before = i === 0 ? " " : sectionBlock[i - 1];
        const after = sectionBlock[i + key.length];
        if (/\s/.test(before) && (after === ":" || /\s/.test(after ?? ""))) {
          // Look ahead skipping whitespace for `:`
          let j = i + key.length;
          while (j < sectionBlock.length && /\s/.test(sectionBlock[j])) j++;
          if (sectionBlock[j] === ":") return true;
        }
      }
    }
  }
  return false;
}


export type Miss = { kind: string; detail: string };

function checkColumn(block: string, col: ColSpec, tableName: string, missing: Miss[]) {
  const colRe = new RegExp(`\\b${col.name}\\b\\s*\\??:\\s*([^;\\n]+)`);
  const m = block.match(colRe);
  if (!m) {
    missing.push({ kind: "column", detail: `${tableName}.${col.name}` });
    return;
  }
  const decl = m[1].trim();
  const isNullable = /\|\s*null\b/.test(decl);
  if (col.nullable !== isNullable) {
    missing.push({
      kind: "nullable",
      detail: `${tableName}.${col.name} — esperado nullable=${col.nullable}, decl="${decl}"`,
    });
  }
  if (col.tsType && !new RegExp(`\\b${col.tsType}\\b`).test(decl)) {
    missing.push({ kind: "type", detail: `${tableName}.${col.name} — esperado ${col.tsType}, decl="${decl}"` });
  }
}

export function verifyTypes(source: string): Miss[] {
  const missing: Miss[] = [];

  for (const t of EXPECTED_TABLES) {
    const block = extractEntityBlock(source, t.name);
    if (!block) { missing.push({ kind: "table", detail: t.name }); continue; }
    const row = extractSubBlock(block, "Row");
    const ins = extractSubBlock(block, "Insert");
    const upd = extractSubBlock(block, "Update");
    if (!row) { missing.push({ kind: "table.Row", detail: t.name }); continue; }
    if (!ins) missing.push({ kind: "table.Insert", detail: t.name });
    if (!upd) missing.push({ kind: "table.Update", detail: t.name });
    for (const col of t.columns) checkColumn(row, col, t.name, missing);

    if (t.relationships) {
      for (const rel of t.relationships) {
        const relRe = new RegExp(
          `columns:\\s*\\[\\s*${rel.columns.map((c) => `"${c}"`).join(",\\s*")}\\s*\\][\\s\\S]{0,300}?referencedRelation:\\s*"([^"]+)"[\\s\\S]{0,300}?referencedColumns:\\s*\\[\\s*${rel.referencedColumns.map((c) => `"${c}"`).join(",\\s*")}\\s*\\]`,
        );
        const m = block.match(relRe);
        if (!m || m[1] !== rel.referencedRelation) {
          missing.push({
            kind: "relationship",
            detail: `${t.name} → columns=[${rel.columns.join(",")}] referencedRelation=${rel.referencedRelation} referencedColumns=[${rel.referencedColumns.join(",")}]`,
          });
        }
      }
    }
  }

  // Escopo estrutural: extrair blocos oficiais Views e Functions.
  const viewsBlock = extractSectionBlock(source, "Views");
  const functionsBlock = extractSectionBlock(source, "Functions");
  if (!viewsBlock) missing.push({ kind: "section", detail: "public.Views ausente" });
  if (!functionsBlock) missing.push({ kind: "section", detail: "public.Functions ausente" });

  for (const v of EXPECTED_VIEWS) {
    // A view deve estar no bloco Views…
    if (viewsBlock && !hasTopLevelKey(viewsBlock, v.name)) {
      missing.push({ kind: "view.section", detail: `${v.name} — ausente em public.Views` });
    }
    // …e nunca no bloco Functions.
    if (functionsBlock && hasTopLevelKey(functionsBlock, v.name)) {
      missing.push({ kind: "view.misplaced", detail: `${v.name} — indevidamente em public.Functions` });
    }

    const block = extractEntityBlock(source, v.name);
    if (!block) { missing.push({ kind: "view", detail: v.name }); continue; }
    const row = extractSubBlock(block, "Row");
    if (!row) { missing.push({ kind: "view.Row", detail: v.name }); continue; }
    for (const c of v.columns) {
      if (!new RegExp(`\\b${c}\\b\\s*\\??:`).test(row)) {
        missing.push({ kind: "view.column", detail: `${v.name}.${c}` });
      }
    }
  }


  for (const r of EXPECTED_RPCS) {
    // A RPC deve estar declarada no bloco Functions (posicionamento oficial).
    if (functionsBlock && !hasTopLevelKey(functionsBlock, r.name)) {
      missing.push({ kind: "rpc.section", detail: `${r.name} — ausente em public.Functions` });
    }

    const fnRe = new RegExp(
      `\\b${r.name}\\s*:\\s*\\{[\\s\\S]*?Args\\s*:\\s*\\{([\\s\\S]*?)\\}[\\s\\S]*?Returns\\s*:\\s*([^;\\n]+)`,
      "m",
    );
    const m = source.match(fnRe);
    if (!m) { missing.push({ kind: "rpc", detail: r.name }); continue; }
    const argsBlock = m[1];
    const returns = m[2].trim();

    // Parse args names — captura tokens "name?:" ou "name:"
    const declared = Array.from(argsBlock.matchAll(/\b([a-zA-Z_][a-zA-Z0-9_]*)\s*(\??):/g))
      .map((mm) => ({ name: mm[1], optional: mm[2] === "?" }));

    for (const req of r.requiredArgs) {
      const d = declared.find((x) => x.name === req);
      if (!d) missing.push({ kind: "rpc.arg.missing", detail: `${r.name}(${req})` });
      else if (d.optional) missing.push({ kind: "rpc.arg.optionality", detail: `${r.name}(${req}) — deveria ser obrigatório` });
    }
    for (const opt of r.optionalArgs) {
      const d = declared.find((x) => x.name === opt);
      if (!d) missing.push({ kind: "rpc.arg.missing", detail: `${r.name}(${opt}?)` });
      // opcional pode aparecer como `name?:` (preferido) ou `name: X | null` — ambos aceitos.
    }
    const allowed = new Set<string>([...r.requiredArgs, ...r.optionalArgs]);
    for (const d of declared) {
      if (!allowed.has(d.name)) {
        missing.push({ kind: "rpc.arg.extra", detail: `${r.name}(${d.name}) — arg não esperado` });
      }
    }
    if (!new RegExp(`\\b${r.returns}\\b`).test(returns)) {
      missing.push({ kind: "rpc.returns", detail: `${r.name} — esperado ${r.returns}, encontrado "${returns}"` });
    }
  }

  // Nenhum nome deve aparecer simultaneamente em Views e Functions.
  if (viewsBlock && functionsBlock) {
    const allNames = [...EXPECTED_VIEWS.map((v) => v.name), ...EXPECTED_RPCS.map((r) => r.name)];
    for (const n of allNames) {
      if (hasTopLevelKey(viewsBlock, n) && hasTopLevelKey(functionsBlock, n)) {
        missing.push({ kind: "duplicate.section", detail: `${n} — presente em Views e Functions` });
      }
    }
  }


  return missing;
}

function isMain(): boolean {
  return (process.argv[1] ?? "").endsWith("verify-fiscal-types.ts");
}

if (isMain()) {
  const idx = process.argv.indexOf("--file");
  const path = idx > -1
    ? resolve(process.cwd(), process.argv[idx + 1])
    : resolve(process.cwd(), "src/integrations/supabase/types.ts");
  if (!existsSync(path)) {
    console.error(`[verify-fiscal-types] FAIL — arquivo não encontrado: ${path}`);
    process.exit(1);
  }
  const src = readFileSync(path, "utf8");
  const missing = verifyTypes(src);
  if (missing.length > 0) {
    console.error("[verify-fiscal-types] FAIL — divergências:");
    for (const m of missing) console.error(`  - ${m.kind}: ${m.detail}`);
    process.exit(1);
  }
  console.log(
    `[verify-fiscal-types] OK — ${EXPECTED_TABLES.length} tabelas, ${EXPECTED_VIEWS.length} views, ${EXPECTED_RPCS.length} RPCs verificadas.`,
  );
}
