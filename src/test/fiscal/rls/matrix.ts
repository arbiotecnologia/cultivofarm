/**
 * Fase Fiscal 3.0 — Matriz RLS declarativa.
 *
 * Matriz `perfil × tabela × operação → esperado (allow|deny)`.
 * Fonte-de-verdade única para o harness runtime (`runner.ts`).
 *
 * NÃO executa nada. Puramente declarativo.
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
  "v_fiscal_products_readiness",
  "v_fiscal_services_readiness",
  "v_fiscal_customers_readiness",
  "v_fiscal_company_readiness",
  "v_fiscal_invoices_summary",
] as const;
export type FiscalView = (typeof FISCAL_VIEWS)[number];

export type Expectation = "allow" | "deny";

/**
 * Matriz de expectativas. Reflete as policies aplicadas nas migrations
 * `20260721000000` (fundação) e `20260721010000` (hardening).
 *
 * Regras aplicadas:
 *   - `fiscal_events`: INSERT/UPDATE/DELETE DENY para todos (apenas RPC/trigger).
 *   - `fiscal_audit_log`: INSERT/UPDATE/DELETE DENY para todos; SELECT só admin.
 *   - `fiscal_invoice_items`: SELECT bloqueado para `administrativo` (revogado na 2.1).
 *   - `anon`: DENY em tudo (nenhum endpoint fiscal público).
 *   - `authenticated_sem_papel`: DENY em tudo (policies exigem papel).
 *   - `cliente_produtor`, `parceiro_b2b`, `parceiro_b2b_tecnico`, `aplicador`,
 *     `operador_onfarm`, `producao`, `consultor_tecnico`, `tecnico_agronomo`,
 *     `gestor_comercial`: DENY em tudo (não são papéis fiscais).
 *   - `administrador`: ALLOW em SELECT/INSERT/UPDATE nas tabelas fiscais
 *     (com exceção das write-restrictions acima); DELETE geralmente DENY salvo
 *     em `fiscal_idempotency_keys`.
 *   - `gestor`, `financeiro`: ALLOW SELECT em todas; INSERT/UPDATE conforme policy.
 *   - `administrativo`: ALLOW SELECT em fiscal_invoices/company/products/services/customers;
 *     DENY em fiscal_invoice_items (revogado na 2.1); DENY em audit_log.
 */
export interface MatrixCell {
  role: Role;
  table: FiscalTable;
  operation: Operation;
  expected: Expectation;
  rationale?: string;
}

const FISCAL_WRITE_LOCKED: FiscalTable[] = ["fiscal_events", "fiscal_audit_log"];

function isReadOnlyRole(role: Role): boolean {
  return (
    role === "cliente_produtor" ||
    role === "parceiro_b2b" ||
    role === "parceiro_b2b_tecnico" ||
    role === "aplicador" ||
    role === "operador_onfarm" ||
    role === "producao" ||
    role === "consultor_tecnico" ||
    role === "tecnico_agronomo" ||
    role === "gestor_comercial" ||
    role === "authenticated_sem_papel" ||
    role === "anon"
  );
}

function expectedFor(role: Role, table: FiscalTable, op: Operation): Expectation {
  // Locked writes across all roles
  if (FISCAL_WRITE_LOCKED.includes(table) && op !== "SELECT") return "deny";
  if (table === "fiscal_audit_log") {
    return role === "administrador" && op === "SELECT" ? "allow" : "deny";
  }
  if (table === "fiscal_events" && op === "SELECT") {
    return role === "administrador" || role === "gestor" || role === "financeiro"
      ? "allow"
      : "deny";
  }
  if (isReadOnlyRole(role)) return "deny";

  // administrativo: SELECT amplo, exceto fiscal_invoice_items (revogado na 2.1)
  if (role === "administrativo") {
    if (op !== "SELECT") return "deny";
    if (table === "fiscal_invoice_items") return "deny";
    return "allow";
  }

  // financeiro & gestor: SELECT allow em tudo; write limitado
  if (role === "financeiro" || role === "gestor") {
    if (op === "SELECT") return "allow";
    if (op === "DELETE") return "deny";
    // INSERT/UPDATE permitidos nas tabelas de cadastro fiscal e invoices
    return "allow";
  }

  // administrador
  if (role === "administrador") {
    if (op === "DELETE" && table !== "fiscal_idempotency_keys") return "deny";
    return "allow";
  }

  return "deny";
}

export const MATRIX: MatrixCell[] = ROLES.flatMap((role) =>
  FISCAL_TABLES.flatMap((table) =>
    OPERATIONS.map<MatrixCell>((operation) => ({
      role,
      table,
      operation,
      expected: expectedFor(role, table, operation),
    })),
  ),
);

/**
 * Expectativas específicas para views (SELECT apenas). `security_invoker=true`
 * garante que a leitura da view herda as policies das tabelas subjacentes.
 */
export interface ViewCell {
  role: Role;
  view: FiscalView;
  expected: Expectation;
}

export const VIEW_MATRIX: ViewCell[] = ROLES.flatMap((role) =>
  FISCAL_VIEWS.map<ViewCell>((view) => ({
    role,
    view,
    expected:
      role === "administrador" ||
      role === "gestor" ||
      role === "financeiro" ||
      role === "administrativo"
        ? "allow"
        : "deny",
  })),
);

/**
 * Expectativas para a RPC `rpc_fiscal_event_manual`.
 * Whitelisting interno: apenas administrador, gestor, financeiro.
 */
export const RPC_EXPECTATIONS: Array<{ role: Role; rpc: string; expected: Expectation }> =
  ROLES.map((role) => ({
    role,
    rpc: "rpc_fiscal_event_manual",
    expected:
      role === "administrador" || role === "gestor" || role === "financeiro"
        ? "allow"
        : "deny",
  }));
