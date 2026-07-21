/**
 * Fase Fiscal 3.0 — verificação estática de src/integrations/supabase/types.ts
 *
 * Uso:
 *   bunx tsx scripts/verify-fiscal-types.ts
 *
 * Não gera tipos. Apenas verifica, por whitelist, que o arquivo regenerado
 * externamente contém as entidades fiscais esperadas. Falha com exit 1 se
 * qualquer entrada estiver ausente. Nunca inventa tipos.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const TYPES_PATH = resolve(process.cwd(), "src/integrations/supabase/types.ts");

const EXPECTED_TABLES = [
  "company_fiscal_settings",
  "product_fiscal_profiles",
  "service_fiscal_profiles",
  "customer_fiscal_profiles",
  "fiscal_invoices",
  "fiscal_invoice_items",
  "fiscal_events",
  "fiscal_idempotency_keys",
  "fiscal_audit_log",
];

const EXPECTED_VIEWS = [
  "v_fiscal_products_readiness",
  "v_fiscal_services_readiness",
  "v_fiscal_customers_readiness",
  "v_fiscal_company_readiness",
  "v_fiscal_invoices_summary",
];

const EXPECTED_FUNCTIONS = ["rpc_fiscal_event_manual", "mask_sensitive_jsonb"];

if (!existsSync(TYPES_PATH)) {
  console.error(`[verify-fiscal-types] FAIL — arquivo não encontrado: ${TYPES_PATH}`);
  process.exit(1);
}

const source = readFileSync(TYPES_PATH, "utf8");

const missing: Array<{ kind: string; name: string }> = [];
for (const t of EXPECTED_TABLES) {
  // Supabase gera `tableName: { Row: ...; Insert: ...; Update: ...; }`
  const re = new RegExp(`\\b${t}\\s*:\\s*\\{`);
  if (!re.test(source)) missing.push({ kind: "table", name: t });
}
for (const v of EXPECTED_VIEWS) {
  const re = new RegExp(`\\b${v}\\b`);
  if (!re.test(source)) missing.push({ kind: "view", name: v });
}
for (const f of EXPECTED_FUNCTIONS) {
  const re = new RegExp(`\\b${f}\\b`);
  if (!re.test(source)) missing.push({ kind: "function", name: f });
}

if (missing.length > 0) {
  console.error("[verify-fiscal-types] FAIL — entidades ausentes no types.ts:");
  for (const m of missing) console.error(`  - ${m.kind}: ${m.name}`);
  console.error("\nRegenerar com o comando documentado em docs/fiscal-fase3-0-types-regen.md.");
  process.exit(1);
}

console.log("[verify-fiscal-types] OK — todas as entidades fiscais esperadas estão presentes.");
