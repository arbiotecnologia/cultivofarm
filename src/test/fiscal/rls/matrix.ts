/**
 * Fase Fiscal 3.0.1 — Matriz RLS declarativa POR-TABELA.
 *
 * Expectativas geradas explicitamente por (role, tabela, op) — sem regra
 * genérica única. Reflete as policies aplicadas em:
 *   - 20260721000000_fiscal_fase2_fundacao.sql
 *   - 20260721010000_fiscal_fase2_1_hardening.sql
 *   - 20260722000000_fiscal_fase3_0_1_integridade.sql (view reconciliation restrita a staff)
 */

export type Role =
  | "administrador"
  | "gestor"
  | "financeiro"
  | "administrativo"
  | "gestor_comercial"
  | "consultor_tecnico"
  | "tecnico_agronomo"
  | "aplicador"
  | "operador_onfarm"
  | "producao"
  | "cliente_produtor"
  | "parceiro_b2b"
  | "parceiro_b2b_tecnico"
  | "authenticated_sem_papel"
  | "anon";

export const ROLES: Role[] = [
  "administrador",
  "gestor",
  "financeiro",
  "administrativo",
  "gestor_comercial",
  "consultor_tecnico",
  "tecnico_agronomo",
  "aplicador",
  "operador_onfarm",
  "producao",
  "cliente_produtor",
  "parceiro_b2b",
  "parceiro_b2b_tecnico",
  "authenticated_sem_papel",
  "anon",
];

export type Operation = "SELECT" | "INSERT" | "UPDATE" | "DELETE";
export const OPERATIONS: Operation[] = ["SELECT", "INSERT", "UPDATE", "DELETE"];

export const FISCAL_TABLES = [
  "company_fiscal_settings",
  "product_fiscal_profiles",
  "service_fiscal_profiles",
  "customer_fiscal_profiles",
  "fiscal_invoices",
  "fiscal_invoice_items",
  "fiscal_events",
  "fiscal_idempotency_keys",
  "fiscal_audit_log",
] as const;
export type FiscalTable = (typeof FISCAL_TABLES)[number];

export const FISCAL_VIEWS = [
  "v_fiscal_company_readiness",
  "v_product_fiscal_readiness",
  "v_service_fiscal_readiness",
  "v_customer_fiscal_readiness",
  "v_fiscal_document_reconciliation_pending",
] as const;
export type FiscalView = (typeof FISCAL_VIEWS)[number];

export type Expectation = "allow" | "deny";

export interface MatrixCell {
  role: Role;
  table: FiscalTable;
  operation: Operation;
  expected: Expectation;
  rationale: string;
}

type Rule = Partial<Record<Role, Partial<Record<Operation, Expectation>>>>;

// Default: DENY para toda role/op não listada explicitamente.
const RULES: Record<FiscalTable, Rule> = {
  // company_fiscal_settings: admin write; gestor/financeiro read.
  company_fiscal_settings: {
    administrador: { SELECT: "allow", INSERT: "allow", UPDATE: "allow", DELETE: "deny" },
    gestor: { SELECT: "allow" },
    financeiro: { SELECT: "allow" },
  },
  // product/service/customer_fiscal_profiles: admin & financeiro write; gestor read.
  product_fiscal_profiles: {
    administrador: { SELECT: "allow", INSERT: "allow", UPDATE: "allow", DELETE: "allow" },
    financeiro: { SELECT: "allow", INSERT: "allow", UPDATE: "allow", DELETE: "allow" },
    gestor: { SELECT: "allow" },
  },
  service_fiscal_profiles: {
    administrador: { SELECT: "allow", INSERT: "allow", UPDATE: "allow", DELETE: "allow" },
    financeiro: { SELECT: "allow", INSERT: "allow", UPDATE: "allow", DELETE: "allow" },
    gestor: { SELECT: "allow" },
  },
  customer_fiscal_profiles: {
    administrador: { SELECT: "allow", INSERT: "allow", UPDATE: "allow", DELETE: "allow" },
    financeiro: { SELECT: "allow", INSERT: "allow", UPDATE: "allow", DELETE: "allow" },
    gestor: { SELECT: "allow" },
  },
  // fiscal_invoices: policies históricas (is_financial_staff = admin/gestor/financeiro).
  // cliente_produtor lê apenas próprio documento (enforced via fixture no runner).
  fiscal_invoices: {
    administrador: { SELECT: "allow", INSERT: "allow", UPDATE: "allow", DELETE: "deny" },
    gestor: { SELECT: "allow", INSERT: "allow", UPDATE: "allow", DELETE: "deny" },
    financeiro: { SELECT: "allow", INSERT: "allow", UPDATE: "allow", DELETE: "deny" },
    administrativo: { SELECT: "allow" },
    // cliente_produtor: policy fi_producer_read → allow SELECT (linhas próprias apenas).
    cliente_produtor: { SELECT: "allow" },
  },
  // fiscal_invoice_items: administrativo REMOVIDO na 2.1.
  fiscal_invoice_items: {
    administrador: { SELECT: "allow", INSERT: "allow", UPDATE: "allow", DELETE: "allow" },
    financeiro: { SELECT: "allow", INSERT: "allow", UPDATE: "allow", DELETE: "allow" },
    gestor: { SELECT: "allow" },
  },
  // fiscal_events: SELECT admin/gestor/financeiro; escrita direta DENY (só RPC).
  fiscal_events: {
    administrador: { SELECT: "allow" },
    gestor: { SELECT: "allow" },
    financeiro: { SELECT: "allow" },
  },
  // fiscal_idempotency_keys: SELECT só admin; nada escreve pela API.
  fiscal_idempotency_keys: {
    administrador: { SELECT: "allow" },
  },
  // fiscal_audit_log: SELECT só admin; toda escrita DENY.
  fiscal_audit_log: {
    administrador: { SELECT: "allow" },
  },
};

function lookup(table: FiscalTable, role: Role, op: Operation): Expectation {
  return RULES[table]?.[role]?.[op] ?? "deny";
}

export const MATRIX: MatrixCell[] = ROLES.flatMap((role) =>
  FISCAL_TABLES.flatMap((table) =>
    OPERATIONS.map<MatrixCell>((operation) => ({
      role,
      table,
      operation,
      expected: lookup(table, role, operation),
      rationale: `${table}.${operation} para ${role}`,
    })),
  ),
);

/** Célula especial: cliente_produtor lendo documento fiscal ALHEIO deve retornar 0 linhas. */
export interface OwnershipCell {
  role: Role;
  table: FiscalTable;
  scope: "own" | "other";
  expected: Expectation;
  expectedRows: 0 | 1;
}
export const OWNERSHIP_CELLS: OwnershipCell[] = [
  { role: "cliente_produtor", table: "fiscal_invoices", scope: "own", expected: "allow", expectedRows: 1 },
  { role: "cliente_produtor", table: "fiscal_invoices", scope: "other", expected: "allow", expectedRows: 0 },
];

// Views — expectativa individual por view (não por regra genérica).
export interface ViewCell {
  role: Role;
  view: FiscalView;
  expected: Expectation;
}

const STAFF: Role[] = ["administrador", "gestor", "financeiro"];
const STAFF_PLUS_ADMINISTRATIVO: Role[] = [...STAFF, "administrativo"];

const VIEW_RULES: Record<FiscalView, Role[]> = {
  v_fiscal_company_readiness: STAFF,
  v_product_fiscal_readiness: STAFF,
  v_service_fiscal_readiness: STAFF,
  v_customer_fiscal_readiness: STAFF,
  // Recriada por 20260722000000 com filtro has_role — só staff financeiro.
  v_fiscal_document_reconciliation_pending: STAFF,
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _AUDIT_STAFF_PLUS = STAFF_PLUS_ADMINISTRATIVO;

export const VIEW_MATRIX: ViewCell[] = ROLES.flatMap((role) =>
  FISCAL_VIEWS.map<ViewCell>((view) => ({
    role,
    view,
    expected: VIEW_RULES[view].includes(role) ? "allow" : "deny",
  })),
);

// RPC rpc_fiscal_event_manual: whitelisting admin/gestor/financeiro.
export const RPC_EXPECTATIONS: Array<{ role: Role; rpc: string; expected: Expectation }> =
  ROLES.map((role) => ({
    role,
    rpc: "rpc_fiscal_event_manual",
    expected: STAFF.includes(role) ? "allow" : "deny",
  }));
