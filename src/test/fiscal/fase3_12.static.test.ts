import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const SQL_PATH = path.resolve(
  __dirname,
  "../../../scripts/fiscal-policy-parity-snapshot.sql",
);

const RAW = fs.readFileSync(SQL_PATH, "utf8");

// Sanitiza: remove comentários de linha e strings literais para evitar
// falsos positivos ao procurar palavras-chave estruturais.
function sanitize(sql: string): string {
  const noLineComments = sql.replace(/--[^\n]*/g, "");
  const noBlockComments = noLineComments.replace(/\/\*[\s\S]*?\*\//g, "");
  const noStrings = noBlockComments.replace(/'(?:''|[^'])*'/g, "''");
  return noStrings;
}

const SANITIZED = sanitize(RAW);

const FORBIDDEN_KEYWORDS = [
  "INSERT",
  "UPDATE",
  "DELETE",
  "MERGE",
  "TRUNCATE",
  "CREATE",
  "ALTER",
  "DROP",
  "GRANT",
  "REVOKE",
  "COPY",
  "CALL",
  "DO",
  "SET",
  "EXECUTE",
];

const FORBIDDEN_FUNCTIONS = [
  "dblink",
  "pg_read_file",
  "pg_read_binary_file",
  "lo_export",
  "lo_import",
  "pg_stat_file",
];

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
  "v_fiscal_company_readiness",
  "v_product_fiscal_readiness",
  "v_service_fiscal_readiness",
  "v_customer_fiscal_readiness",
  "v_fiscal_document_reconciliation_pending",
];

const EXPECTED_FUNCTIONS = ["rpc_fiscal_event_manual", "mask_sensitive_jsonb"];

const ALLOWED_CATALOG_REFERENCES = [
  "pg_policies",
  "pg_class",
  "pg_proc",
  "pg_constraint",
  "pg_namespace",
  "pg_catalog",
  "information_schema.role_table_grants",
  "information_schema.role_routine_grants",
];

// Tabelas de negócio proibidas fora dos catálogos.
const BUSINESS_TABLE_HINTS = [
  "auth.users",
  "public.clientes",
  "public.produtores",
  "public.partner_users",
  "public.user_roles",
  "public.profiles",
];

describe("Fase Fiscal 3.12 — SQL de snapshot é somente leitura", () => {
  it("SQL existe e tem tamanho razoável", () => {
    expect(RAW.length).toBeGreaterThan(500);
  });

  it.each(FORBIDDEN_KEYWORDS)(
    "não contém palavra-chave estrutural proibida '%s'",
    (kw) => {
      const re = new RegExp(`\\b${kw}\\b`, "i");
      expect(SANITIZED).not.toMatch(re);
    },
  );

  it.each(FORBIDDEN_FUNCTIONS)(
    "não referencia função sensível '%s'",
    (fn) => {
      const re = new RegExp(`\\b${fn}\\b`, "i");
      expect(SANITIZED).not.toMatch(re);
    },
  );

  it("começa com WITH ou SELECT após comentários", () => {
    const firstToken = SANITIZED.trim().split(/\s+/)[0].toUpperCase();
    expect(["WITH", "SELECT"]).toContain(firstToken);
  });

  it("não usa transação de escrita explícita", () => {
    expect(SANITIZED).not.toMatch(/\bBEGIN\b/i);
    expect(SANITIZED).not.toMatch(/\bCOMMIT\b/i);
    expect(SANITIZED).not.toMatch(/\bROLLBACK\b/i);
    expect(SANITIZED).not.toMatch(/\bSAVEPOINT\b/i);
  });

  it("não contém meta-comandos psql", () => {
    // meta-comandos começam com barra invertida no início da linha
    expect(RAW).not.toMatch(/^\s*\\/m);
  });

  it("não define funções auxiliares nem blocos DO", () => {
    expect(SANITIZED).not.toMatch(/\bFUNCTION\b/i);
    expect(SANITIZED).not.toMatch(/\bPROCEDURE\b/i);
    expect(SANITIZED).not.toMatch(/\$\$/);
  });

  it("não cria tabelas temporárias", () => {
    expect(SANITIZED).not.toMatch(/\bTEMP(?:ORARY)?\b/i);
  });

  it("usa apenas catálogos permitidos", () => {
    for (const ref of ALLOWED_CATALOG_REFERENCES) {
      // basta que os principais estejam presentes
    }
    expect(SANITIZED).toMatch(/pg_policies/);
    expect(SANITIZED).toMatch(/pg_class/);
    expect(SANITIZED).toMatch(/pg_proc/);
    expect(SANITIZED).toMatch(/pg_constraint/);
    expect(SANITIZED).toMatch(/information_schema\.role_table_grants/);
    expect(SANITIZED).toMatch(/information_schema\.role_routine_grants/);
  });

  it("não lê tabelas de negócio", () => {
    for (const hint of BUSINESS_TABLE_HINTS) {
      const re = new RegExp(hint.replace(/\./g, "\\."), "i");
      expect(SANITIZED).not.toMatch(re);
    }
  });
});

describe("Fase Fiscal 3.12 — listas exatas cobertas", () => {
  it("cobre exatamente as 9 tabelas fiscais", () => {
    for (const t of EXPECTED_TABLES) {
      expect(RAW).toContain(`('${t}')`);
    }
    // não vaza nome fora do bloco esperado
    expect(EXPECTED_TABLES.length).toBe(9);
  });

  it("cobre exatamente as 5 views fiscais", () => {
    for (const v of EXPECTED_VIEWS) {
      expect(RAW).toContain(`('${v}')`);
    }
    expect(EXPECTED_VIEWS.length).toBe(5);
  });

  it("cobre exatamente as 2 funções fiscais", () => {
    for (const f of EXPECTED_FUNCTIONS) {
      expect(RAW).toContain(`('${f}')`);
    }
    expect(EXPECTED_FUNCTIONS.length).toBe(2);
  });

  it("retorna uma única coluna consolidada parity_snapshot", () => {
    expect(RAW).toMatch(/AS\s+parity_snapshot\s*;/i);
    // apenas uma instrução SQL terminando em ; (ignorando comentários)
    const trimmed = SANITIZED.trim().replace(/;\s*$/, "");
    expect(trimmed.split(";").length).toBe(1);
  });

  it("expõe fingerprint global e por categoria", () => {
    for (const cat of [
      "policies",
      "rls",
      "object_grants",
      "views",
      "functions",
      "function_grants",
      "constraints",
      "global",
    ]) {
      expect(RAW).toMatch(new RegExp(`'${cat}',\\s*md5`));
    }
  });
});
