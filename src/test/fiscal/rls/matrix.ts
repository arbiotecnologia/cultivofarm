/**
 * Fase Fiscal 3.0.2-B — Matriz RLS declarativa POR-TABELA.
 *
 * Expectativas geradas explicitamente por (role, tabela, op) — sem regra
 * genérica única. Reflete as policies aplicadas em:
 *   - 20260721000000_fiscal_fase2_fundacao.sql
 *   - 20260721010000_fiscal_fase2_1_hardening.sql
 *   - 20260722000000_fiscal_fase3_0_1_integridade.sql
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

const RULES: Record<FiscalTable, Rule> = {
  company_fiscal_settings: {
    administrador: { SELECT: "allow", INSERT: "allow", UPDATE: "allow", DELETE: "deny" },
    gestor: { SELECT: "allow" },
    financeiro: { SELECT: "allow" },
  },
  product_fiscal_profiles: {
    administrador: { SELECT: "allow", INSERT: "allow", UPDATE: "allow", DELETE: "deny" },
    financeiro: { SELECT: "allow", INSERT: "allow", UPDATE: "allow", DELETE: "deny" },
    gestor: { SELECT: "allow" },
  },
  service_fiscal_profiles: {
    administrador: { SELECT: "allow", INSERT: "allow", UPDATE: "allow", DELETE: "deny" },
    financeiro: { SELECT: "allow", INSERT: "allow", UPDATE: "allow", DELETE: "deny" },
    gestor: { SELECT: "allow" },
  },
  customer_fiscal_profiles: {
    administrador: { SELECT: "allow", INSERT: "allow", UPDATE: "allow", DELETE: "deny" },
    financeiro: { SELECT: "allow", INSERT: "allow", UPDATE: "allow", DELETE: "deny" },
    gestor: { SELECT: "allow" },
  },
  fiscal_invoices: {
    administrador: { SELECT: "allow", INSERT: "allow", UPDATE: "allow", DELETE: "deny" },
    gestor: { SELECT: "allow", INSERT: "allow", UPDATE: "allow", DELETE: "deny" },
    financeiro: { SELECT: "allow", INSERT: "allow", UPDATE: "allow", DELETE: "deny" },
    cliente_produtor: { SELECT: "allow" },
  },
  fiscal_invoice_items: {
    administrador: { SELECT: "allow", INSERT: "allow", UPDATE: "allow", DELETE: "allow" },
    financeiro: { SELECT: "allow", INSERT: "allow", UPDATE: "allow", DELETE: "allow" },
    gestor: { SELECT: "allow" },
  },
  fiscal_events: {
    administrador: { SELECT: "allow" },
    gestor: { SELECT: "allow" },
    financeiro: { SELECT: "allow" },
  },
  fiscal_idempotency_keys: {
    administrador: { SELECT: "allow" },
  },
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

/** Ownership: cliente_produtor A vê seu próprio invoice; cliente B não vê o de A. */
export interface OwnershipCell {
  label: string;
  role: Role;
  table: FiscalTable;
  scope: "own" | "other";
  expectedRows: 0 | 1;
}
export const OWNERSHIP_CELLS: OwnershipCell[] = [
  { label: "cliente_produtor_A vê próprio fiscal_invoice", role: "cliente_produtor", table: "fiscal_invoices", scope: "own", expectedRows: 1 },
  { label: "cliente_produtor_B NÃO vê fiscal_invoice alheio de A", role: "cliente_produtor", table: "fiscal_invoices", scope: "other", expectedRows: 0 },
];

export interface ViewCell {
  role: Role;
  view: FiscalView;
  expected: Expectation;
}

const STAFF: Role[] = ["administrador", "gestor", "financeiro"];

const VIEW_RULES: Record<FiscalView, Role[]> = {
  v_fiscal_company_readiness: STAFF,
  v_product_fiscal_readiness: STAFF,
  v_service_fiscal_readiness: STAFF,
  v_customer_fiscal_readiness: STAFF,
  v_fiscal_document_reconciliation_pending: STAFF,
};

export const VIEW_MATRIX: ViewCell[] = ROLES.flatMap((role) =>
  FISCAL_VIEWS.map<ViewCell>((view) => ({
    role,
    view,
    expected: VIEW_RULES[view].includes(role) ? "allow" : "deny",
  })),
);

export const RPC_EXPECTATIONS: Array<{ role: Role; rpc: string; expected: Expectation }> =
  ROLES.map((role) => ({
    role,
    rpc: "rpc_fiscal_event_manual",
    expected: STAFF.includes(role) ? "allow" : "deny",
  }));

/**
 * Cada célula RPC gera 4 execuções: 1 primária (allow/deny por role) + 3
 * negativas (invoice ausente, event_type inválido, notes overflow) que devem
 * sempre falhar em qualquer role.
 */
export const RPC_CASES_PER_ROLE = 4;

/** Totais planejados (planejadas). */
export const PLANNED_COUNTS = {
  tableCells: MATRIX.length,
  viewCells: VIEW_MATRIX.length,
  rpcCells: RPC_EXPECTATIONS.length * RPC_CASES_PER_ROLE,
  ownershipCells: OWNERSHIP_CELLS.length,
  get total() { return this.tableCells + this.viewCells + this.rpcCells + this.ownershipCells; },
};
