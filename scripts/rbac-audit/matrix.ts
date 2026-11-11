/**
 * Matriz de auditoria RBAC — papéis × rotas × lançamentos.
 *
 * Fonte da verdade declarativa das EXPECTATIVAS. O runner
 * (`run-rbac-audit.ts`) compara estas expectativas com o comportamento real
 * do Supabase (RLS/grants/RPCs) usando os usuários de teste do staging.
 *
 * IMPORTANTE: este arquivo não concede permissão alguma. Ele apenas descreve
 * o que se espera do backend para que divergências sejam detectadas.
 */

export type AuditRole =
  | "administrador"
  | "gestor"
  | "consultor_tecnico"
  | "aplicador"
  | "operador_onfarm"
  | "cliente_produtor"
  | "administrativo"
  | "tecnico_agronomo"
  | "producao"
  | "financeiro"
  | "gestor_comercial"
  | "vendedor"
  | "parceiro_b2b"
  | "parceiro_b2b_tecnico";

export interface AuditUser {
  role: AuditRole;
  email: string;
}

/** Usuários de teste do staging (senha via env RBAC_AUDIT_PASSWORD). */
export const AUDIT_USERS: AuditUser[] = [
  { role: "administrador", email: "admin@arbio.com" },
  { role: "gestor", email: "gestor@arbio.com" },
  { role: "consultor_tecnico", email: "consultor@arbio.com" },
  { role: "tecnico_agronomo", email: "tecnico_agronomo@arbio.com" },
  { role: "aplicador", email: "aplicador@arbio.com" },
  { role: "operador_onfarm", email: "onfarm@arbio.com" },
  { role: "producao", email: "producao@arbio.com" },
  { role: "administrativo", email: "administrativo@arbio.com" },
  { role: "financeiro", email: "financeiro@arbio.com" },
  { role: "gestor_comercial", email: "comercial@arbio.com" },
  { role: "vendedor", email: "vendedor@arbio.com" },
  { role: "cliente_produtor", email: "produtor@arbio.com" },
  { role: "parceiro_b2b", email: "parceiro@arbio.com" },
  { role: "parceiro_b2b_tecnico", email: "parceiro.tecnico@arbio.com" },
];

/**
 * Rotas auditadas e o recurso (tabela) que a rota realmente lê.
 * A auditoria de rota verifica: se `canAccess(role, route)` é verdadeiro no
 * front, o SELECT correspondente NÃO pode ser negado por RLS/grant.
 */
export interface RouteProbe {
  route: string;
  table: string;
  /** Portal ao qual a rota pertence (apenas para o relatório). */
  portal: "interno" | "app" | "portal" | "portal-parceiro";
}

export const ROUTE_PROBES: RouteProbe[] = [
  { route: "/clientes", table: "clientes", portal: "interno" },
  { route: "/fazendas", table: "fazendas", portal: "interno" },
  { route: "/talhoes", table: "talhoes", portal: "interno" },
  { route: "/ordens-servico", table: "ordens_servico", portal: "interno" },
  { route: "/lotes", table: "lotes", portal: "interno" },
  { route: "/controle-qualidade", table: "controle_qualidade", portal: "interno" },
  { route: "/envase", table: "envase", portal: "interno" },
  { route: "/estoque", table: "estoque_produto", portal: "interno" },
  { route: "/entregas", table: "entregas", portal: "interno" },
  { route: "/aplicacoes", table: "aplicacoes", portal: "interno" },
  { route: "/solicitacoes", table: "portal_solicitacoes", portal: "interno" },
  { route: "/alertas-operacionais", table: "alertas_operacionais", portal: "interno" },
  { route: "/financeiro/receber", table: "accounts_receivable", portal: "interno" },
  { route: "/financeiro/pagar", table: "accounts_payable", portal: "interno" },
  { route: "/financeiro/notas-fiscais", table: "fiscal_invoices", portal: "interno" },
  { route: "/comercial/parceiros", table: "partner_accounts", portal: "interno" },
  { route: "/comercial/pedidos-b2b", table: "partner_orders", portal: "interno" },
  { route: "/comercial/campanhas", table: "commercial_campaigns", portal: "interno" },
  { route: "/app/registros", table: "registros_consultor", portal: "app" },
  { route: "/app/ordens", table: "ordens_servico", portal: "app" },
  { route: "/app/aplicacoes", table: "aplicacoes", portal: "app" },
  { route: "/portal", table: "portal_solicitacoes", portal: "portal" },
  { route: "/portal-parceiro/pedidos", table: "partner_orders", portal: "portal-parceiro" },
  { route: "/portal-parceiro/simulacoes", table: "partner_simulations", portal: "portal-parceiro" },
];

/**
 * Lançamentos auditados. `payload` contém TODAS as colunas NOT NULL sem
 * default preenchidas com valores sintéticos e FKs inexistentes, de modo que
 * a inserção NUNCA persista dados:
 *   - erro 42501  → bloqueado por RLS/grant (sem permissão de lançamento);
 *   - qualquer outro erro (FK/validação/trigger) → política permitiu a escrita.
 */
export interface LancamentoProbe {
  id: string;
  label: string;
  table: string;
  route: string;
  payload: Record<string, unknown>;
  /** Rotas alternativas que também expõem este lançamento na UI. */
  altWriteRoutes?: string[];
  /** Papéis que DEVEM conseguir lançar. Os demais devem ser bloqueados. */
  expectedRoles: AuditRole[];
}

const FAKE_UUID = "00000000-0000-4000-8000-0000000000ff";
const MARK = "RBAC-AUDIT-PROBE";

export const LANCAMENTO_PROBES: LancamentoProbe[] = [
  {
    id: "cliente",
    label: "Cadastro de cliente",
    table: "clientes",
    route: "/clientes",
    payload: { nome: MARK, codigo_cliente: MARK },
    expectedRoles: ["administrador", "gestor", "gestor_comercial"],
  },
  {
    id: "fazenda",
    label: "Cadastro de fazenda",
    table: "fazendas",
    route: "/fazendas",
    payload: { nome: MARK, cliente_id: FAKE_UUID },
    expectedRoles: ["administrador", "gestor"],
  },
  {
    id: "talhao",
    label: "Cadastro de talhão",
    table: "talhoes",
    route: "/talhoes",
    payload: { nome: MARK, fazenda_id: FAKE_UUID },
    expectedRoles: ["administrador", "gestor"],
  },
  {
    id: "ordem_servico",
    label: "Abertura de ordem de serviço",
    table: "ordens_servico",
    route: "/ordens-servico",
    payload: { numero_os: MARK, cliente_id: FAKE_UUID },
    altWriteRoutes: ["/solicitacoes"],
    expectedRoles: ["administrador", "gestor", "administrativo"],
  },
  {
    id: "lote",
    label: "Abertura de lote de produção",
    table: "lotes",
    route: "/lotes",
    payload: { codigo_lote: MARK, ordem_servico_id: FAKE_UUID },
    altWriteRoutes: ["/cockpit-laboratorio"],
    expectedRoles: ["administrador", "gestor", "producao", "operador_onfarm"],
  },
  {
    id: "controle_qualidade",
    label: "Registro de controle de qualidade",
    table: "controle_qualidade",
    route: "/controle-qualidade",
    payload: { lote_id: FAKE_UUID },
    altWriteRoutes: ["/cockpit-laboratorio"],
    expectedRoles: ["administrador", "gestor", "producao", "operador_onfarm"],
  },
  {
    id: "envase",
    label: "Registro de envase",
    table: "envase",
    route: "/envase",
    payload: { lote_id: FAKE_UUID, tipo_embalagem: "frasco_1L" },
    altWriteRoutes: ["/cockpit-laboratorio"],
    expectedRoles: ["administrador", "gestor", "producao", "operador_onfarm"],
  },
  {
    id: "solicitacao_produtor",
    label: "Solicitação do produtor",
    table: "portal_solicitacoes",
    route: "/portal",
    payload: { cliente_id: FAKE_UUID, tipo_demanda: MARK, user_id: FAKE_UUID },
    altWriteRoutes: ["/app/solicitar", "/solicitacoes"],
    expectedRoles: ["administrador", "cliente_produtor"],
  },
  {
    id: "conta_receber",
    label: "Lançamento de conta a receber",
    table: "accounts_receivable",
    route: "/financeiro/receber",
    payload: {
      description: MARK,
      total_amount: 1,
      first_due_date: "2030-01-01",
      origin_type: "manual",
      category_id: FAKE_UUID,
      created_by: FAKE_UUID,
    },
    expectedRoles: ["administrador", "financeiro"],
  },
  {
    id: "pedido_b2b",
    label: "Pedido B2B",
    table: "partner_orders",
    route: "/portal-parceiro/pedidos",
    payload: { partner_id: FAKE_UUID },
    altWriteRoutes: ["/portal-parceiro/novo", "/comercial/pedidos-b2b"],
    // parceiro_b2b_tecnico NÃO cria pedido (apenas acompanha) — a UI e o banco
    // devem concordar em bloqueá-lo.
    expectedRoles: ["administrador", "gestor_comercial", "parceiro_b2b"],
  },
];
