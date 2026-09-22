export type AppRole =
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
  | "parceiro_b2b"
  | "parceiro_b2b_tecnico"
  // Papel de plataforma SaaS. NÃO é administrador operacional e NÃO aparece
  // em `ACTIVE_ROLES` nem em `ACCESS_MAP`: não recebe nenhum módulo
  // operacional. Enquanto o painel SaaS (Fase S4) não existir, a home segura
  // provisória é `/sem-permissao` (ver `getHomeForRole`).
  | "superadmin";


export type AccessLevel = "rw" | "r" | "none";

/**
 * Fase 3.2 — Fonte única de perfis autorizados no portal mobile `/app/*`.
 * Espelha, em nível declarativo, o que já é enforced em runtime por
 * `AppPortalGuard` (RPC `has_technical_access`), `TechnicalFeatureGuard` e
 * `ProducerFeatureGuard`. NÃO amplia permissões — apenas permite que
 * `canAccess()` (usado por sidebar/busca/testes) reconheça as rotas.
 */
const APP_SHARED_ROLES: AppRole[] = [
  "administrador", "cliente_produtor",
  "consultor_tecnico", "tecnico_agronomo", "aplicador",
];
const APP_TECHNICAL_ROLES: AppRole[] = [
  "administrador", "consultor_tecnico", "tecnico_agronomo", "aplicador",
];
const APP_PRODUCER_ROLES: AppRole[] = ["administrador", "cliente_produtor"];

const rw = <T extends readonly AppRole[]>(roles: T): Partial<Record<AppRole, AccessLevel>> =>
  Object.fromEntries(roles.map((r) => [r, "rw" as AccessLevel]));

// Routes and which roles can access them
const ACCESS_MAP: Record<string, Partial<Record<AppRole, AccessLevel>>> = {

  "/": {
    administrador: "rw", gestor: "rw", consultor_tecnico: "r", 
    operador_onfarm: "r", administrativo: "r", tecnico_agronomo: "r", producao: "r",
    financeiro: "r",
  },
  "/clientes": {
    administrador: "rw", gestor: "rw", gestor_comercial: "rw", consultor_tecnico: "r", cliente_produtor: "r",
    administrativo: "r", tecnico_agronomo: "r", financeiro: "r",
  },
  "/fazendas": {
    administrador: "rw", gestor: "rw", consultor_tecnico: "r", cliente_produtor: "r",
    administrativo: "r", tecnico_agronomo: "r", financeiro: "r",
  },
  "/talhoes": {
    administrador: "rw", gestor: "rw", consultor_tecnico: "r", cliente_produtor: "r",
    administrativo: "r", tecnico_agronomo: "r", financeiro: "r",
  },
  "/base-tecnica": {
    administrador: "rw", gestor: "rw", consultor_tecnico: "r", gestor_comercial: "r",
    operador_onfarm: "r", administrativo: "r", tecnico_agronomo: "r", producao: "r",
  },
  // Rota legada mantida apenas para o redirecionamento /protocolos -> /base-tecnica
  "/protocolos": {
    administrador: "rw", gestor: "rw", consultor_tecnico: "r",
    operador_onfarm: "r", administrativo: "r", tecnico_agronomo: "r", producao: "r",
  },
  "/ordens-servico": {
    administrador: "rw", gestor: "rw", consultor_tecnico: "r",
    operador_onfarm: "r", administrativo: "r", tecnico_agronomo: "r", producao: "r",
    financeiro: "r",
  },
  "/cockpit-laboratorio": {
    administrador: "rw", gestor: "rw", operador_onfarm: "rw", producao: "rw",
    administrativo: "r",
  },
  "/lotes": {
    administrador: "rw", gestor: "rw", administrativo: "r", producao: "rw", financeiro: "r",
  },
  "/controle-qualidade": {
    administrador: "rw", gestor: "rw", administrativo: "r", producao: "rw",
  },
  "/envase": {
    administrador: "rw", gestor: "rw", administrativo: "r", producao: "rw",
  },
  "/estoque": {
    administrador: "rw", gestor: "rw", operador_onfarm: "rw",
    administrativo: "r", producao: "rw",
  },
  "/entregas": {
    administrador: "rw", gestor: "rw", operador_onfarm: "r", cliente_produtor: "r",
    administrativo: "r", producao: "r", aplicador: "r", financeiro: "r",
  },
  "/aplicacoes": {
    administrador: "rw", gestor: "rw", aplicador: "rw",
    cliente_produtor: "r", administrativo: "r", financeiro: "r",
  },

  "/consultor-tecnico": {
    administrador: "rw", gestor: "rw", consultor_tecnico: "rw", cliente_produtor: "r",
    administrativo: "r", tecnico_agronomo: "rw",
  },
  "/fluxo-tecnico": {
    administrador: "rw", gestor: "rw", consultor_tecnico: "r", operador_onfarm: "r",
    administrativo: "r", tecnico_agronomo: "r", producao: "r",
  },
  "/visita-tecnica": {
    administrador: "rw", gestor: "rw", consultor_tecnico: "rw", tecnico_agronomo: "rw",
    administrativo: "r",
  },
  "/relatorios": {
    administrador: "rw", gestor: "rw", consultor_tecnico: "r", operador_onfarm: "r",
    administrativo: "r", tecnico_agronomo: "r", producao: "r",
  },
  "/configuracoes": {
    administrador: "rw", gestor: "r", consultor_tecnico: "r", aplicador: "r",
    operador_onfarm: "r", cliente_produtor: "r", administrativo: "r",
    tecnico_agronomo: "r", producao: "r",
  },
  // Fase Fiscal 3.1 — Configuração fiscal da empresa. Admin edita;
  // gestor e financeiro somente leem. Demais perfis: bloqueado.
  "/configuracoes/fiscal/empresa": {
    administrador: "rw", gestor: "r", financeiro: "r",
  },
  // Fase Fiscal 3.2 — Perfis Fiscais de Produtos. Admin e Financeiro
  // editam; Gestor somente lê. Demais perfis: bloqueado por URL.
  "/configuracoes/fiscal/produtos": {
    administrador: "rw", financeiro: "rw", gestor: "r",
  },
  // Fase Fiscal 3.3 — Perfis Fiscais de Serviços. Admin e Financeiro
  // editam; Gestor somente lê. Demais perfis: bloqueado por URL.
  "/configuracoes/fiscal/servicos": {
    administrador: "rw", financeiro: "rw", gestor: "r",
  },
  // Fase Fiscal 3.5 — Workflow documental fiscal MANUAL (sem emissão).
  // Espelha as policies canônicas em fiscal_invoices/fiscal_events:
  // administrador e financeiro escrevem; gestor lê. Demais perfis
  // bloqueados por URL. Item NÃO entra no menu enquanto a flag estiver false.
  "/fiscal/documentos": {
    administrador: "rw", financeiro: "rw", gestor: "r",
  },
  // Fase Fiscal 3.6 — Reconciliação assistida (fila + relatório interno).
  // Somente admin/financeiro RW; gestor R. Escrita adicional é gated por
  // flag `fiscalReconciliationWrite` (default false).
  "/fiscal/reconciliacao": {
    administrador: "rw", financeiro: "rw", gestor: "r",
  },
  // Fase Fiscal 3.7 — Central de Prontidão para Homologação (SOMENTE
  // LEITURA). Admin R, Gestor R e Financeiro R. Todos os demais/anon
  // recebem "none". Rota é registrada em App.tsx sob RoleGuard e só
  // aparece no menu quando `fiscalReadinessCenterUi=true` (não é o caso).
  "/fiscal/prontidao": {
    administrador: "r", gestor: "r", financeiro: "r",
  },
  // Fase Fiscal 3.4 — Perfis Fiscais de Clientes. Admin e Financeiro
  // editam; Gestor somente lê. Demais perfis: bloqueado por URL.
  "/configuracoes/fiscal/clientes": {
    administrador: "rw", financeiro: "rw", gestor: "r",
  },
  "/bi-agronomico": {
    administrador: "rw", gestor: "rw", consultor_tecnico: "r",
    operador_onfarm: "r", administrativo: "r", tecnico_agronomo: "r", producao: "r",
  },
  "/bi-operacional": {
    administrador: "rw", gestor: "rw", consultor_tecnico: "r",
    operador_onfarm: "r", administrativo: "r", tecnico_agronomo: "r", producao: "r",
  },
  "/alertas-operacionais": {
    administrador: "rw", gestor: "rw", administrativo: "rw",
    consultor_tecnico: "rw", tecnico_agronomo: "rw",
    operador_onfarm: "rw", producao: "rw",
  },

  "/previsao-agronomica": {
    administrador: "rw", gestor: "rw", consultor_tecnico: "r",
    operador_onfarm: "r", administrativo: "r", tecnico_agronomo: "r",
  },
  "/solicitacoes": {
    administrador: "rw", gestor: "rw", consultor_tecnico: "rw",
    administrativo: "rw", tecnico_agronomo: "rw",
  },
  "/agenda-tecnica": {
    administrador: "rw", gestor: "rw", consultor_tecnico: "rw", tecnico_agronomo: "rw",
  },
  "/painel-operacional": {
    administrador: "rw", gestor: "rw",
  },
  // Fase 3.1 — Dashboard unificado (Visão Geral usa RPC executiva; restrito a admin/gestor).
  "/dashboard": {
    administrador: "rw", gestor: "rw",
  },
  "/dashboard/geral": {
    administrador: "rw", gestor: "rw",
  },
  "/dashboard/executivo": { administrador: "rw", gestor: "rw" },
  "/dashboard/operacional": { administrador: "rw", gestor: "rw" },

  "/monitoramento-alertas": {
    administrador: "rw", gestor: "rw", consultor_tecnico: "r", tecnico_agronomo: "r",
  },
  "/portal": {
    cliente_produtor: "rw",
  },
  "/auditoria-sync": {
    administrador: "rw", gestor: "r",
  },
  "/auditoria": {
    administrador: "rw", gestor: "r",
  },
  "/financeiro": { administrador: "rw", gestor: "rw", financeiro: "rw" },
  "/financeiro/receber": { administrador: "rw", gestor: "rw", financeiro: "rw" },
  "/financeiro/pagar": { administrador: "rw", gestor: "rw", financeiro: "rw" },
  "/financeiro/categorias": { administrador: "rw", gestor: "rw", financeiro: "rw" },
  "/financeiro/centros-custo": { administrador: "rw", gestor: "rw", financeiro: "rw" },
  "/financeiro/contas-bancarias": { administrador: "rw", gestor: "rw", financeiro: "rw" },
  "/financeiro/formas-pagamento": { administrador: "rw", gestor: "rw", financeiro: "rw" },
  "/financeiro/recorrencias": { administrador: "rw", gestor: "rw", financeiro: "rw" },
  "/financeiro/fluxo-caixa": { administrador: "rw", gestor: "rw", financeiro: "rw" },
  "/financeiro/dre": { administrador: "rw", gestor: "rw", financeiro: "rw" },
  "/financeiro/notas-fiscais": { administrador: "rw", gestor: "rw", financeiro: "rw" },
  "/financeiro/entregas-nao-faturadas": { administrador: "rw", gestor: "rw", financeiro: "rw" },
  "/financeiro/relatorios": { administrador: "rw", gestor: "rw", financeiro: "rw" },
  "/financeiro/recibos": { administrador: "rw", gestor: "rw", financeiro: "rw" },
  "/executivo": { administrador: "rw", gestor: "rw" },
  "/comercial/parceiros": { administrador: "rw", gestor_comercial: "rw" },
  "/comercial/pedidos-b2b": { administrador: "rw", gestor_comercial: "rw" },
  "/comercial/solicitacoes-b2b": { administrador: "rw", gestor_comercial: "rw", financeiro: "r" },
  "/comercial/dashboard-b2b": { administrador: "rw", gestor_comercial: "rw" },
  "/comercial/campanhas": { administrador: "rw", gestor_comercial: "rw" },
  "/comercial/simulador": { administrador: "rw", gestor_comercial: "rw" },
  "/comercial/indicadores": { administrador: "rw", gestor_comercial: "rw" },
  "/comercial/alertas": { administrador: "rw", gestor_comercial: "rw" },
  "/comercial/catalogo": { administrador: "r", gestor: "r", gestor_comercial: "r" },
  "/comercial/dashboard-consolidado": { administrador: "rw", gestor_comercial: "rw" },
  "/comercial/condicoes-pagamento": { administrador: "rw", financeiro: "rw", gestor_comercial: "rw" },
  "/operacao/planejamento": { administrador: "rw", gestor: "rw", producao: "rw", gestor_comercial: "r" },
  "/operacao/planejamento/:id": { administrador: "rw", gestor: "rw", producao: "rw", gestor_comercial: "r" },
  "/operacao/dashboard-producao": { administrador: "rw", gestor: "rw", producao: "r", gestor_comercial: "r" },
  "/portal-parceiro": { parceiro_b2b: "rw", parceiro_b2b_tecnico: "rw", administrador: "rw", gestor_comercial: "rw" },
  "/portal-parceiro/pedidos": { parceiro_b2b: "rw", administrador: "rw", gestor_comercial: "rw" },
  // Solicitações: acessível a gestor parceiro (parceiro_b2b), administrador e gestor_comercial.
  "/portal-parceiro/solicitacoes": { parceiro_b2b: "rw", administrador: "rw", gestor_comercial: "rw" },
  // /novo mantida temporariamente para redirect → /catalogo (feito no layout).
  "/portal-parceiro/novo": { parceiro_b2b: "rw", administrador: "rw", gestor_comercial: "rw" },
  "/portal-parceiro/catalogo": { parceiro_b2b: "rw", administrador: "rw", gestor_comercial: "rw" },
  "/portal-parceiro/simulador": { parceiro_b2b: "rw", parceiro_b2b_tecnico: "rw", administrador: "rw", gestor_comercial: "rw" },
  "/portal-parceiro/historico": { parceiro_b2b: "rw", administrador: "rw", gestor_comercial: "rw" },
  "/portal-parceiro/dashboard": { parceiro_b2b: "rw", parceiro_b2b_tecnico: "r", administrador: "rw", gestor_comercial: "rw" },
  "/portal-parceiro/favoritos": { parceiro_b2b: "rw", administrador: "rw", gestor_comercial: "rw" },
  "/portal-parceiro/meu-historico": { parceiro_b2b: "rw", administrador: "rw", gestor_comercial: "rw" },
  "/portal-parceiro/financeiro": { parceiro_b2b: "r", administrador: "rw", gestor_comercial: "rw" },
  "/portal-parceiro/fichas": { parceiro_b2b: "r", parceiro_b2b_tecnico: "rw", administrador: "rw", gestor_comercial: "rw" },
  "/portal-parceiro/simulacoes": { parceiro_b2b_tecnico: "rw", administrador: "r", gestor_comercial: "r" },
  "/portal-parceiro/simulacoes-equipe": { parceiro_b2b: "rw", administrador: "rw", gestor_comercial: "rw" },
  // Vínculo técnico ↔ produtor: gestor B2B administra a equipe; técnico gerencia seus próprios produtores.
  "/portal-parceiro/meus-produtores": { parceiro_b2b_tecnico: "rw", administrador: "rw", gestor_comercial: "rw" },
  "/portal-parceiro/meus-produtores/:clienteId": { parceiro_b2b_tecnico: "rw", administrador: "rw", gestor_comercial: "rw" },
  "/portal-parceiro/tecnicos-produtores": { parceiro_b2b: "rw", administrador: "rw", gestor_comercial: "rw" },
  "/portal-parceiro/usuarios-clientes": { administrador: "rw", gestor_comercial: "rw" },


  "/financeiro/b2b": { administrador: "rw", gestor: "rw", financeiro: "rw", gestor_comercial: "r", administrativo: "r" },
  "/financeiro/b2b/dashboard": { administrador: "rw", gestor: "rw", financeiro: "rw", gestor_comercial: "r", administrativo: "r" },
  "/financeiro/b2b/governanca": { administrador: "rw", gestor: "rw", financeiro: "rw", gestor_comercial: "r", administrativo: "r" },
  "/financeiro/b2b/aging": { administrador: "rw", gestor: "rw", financeiro: "rw", gestor_comercial: "r", administrativo: "r" },
  "/financeiro/b2b/previsao": { administrador: "rw", gestor: "rw", financeiro: "rw", gestor_comercial: "r", administrativo: "r" },
  "/financeiro/b2b/rentabilidade": { administrador: "rw", gestor: "rw", financeiro: "rw", gestor_comercial: "r", administrativo: "r" },
  "/financeiro/b2b/alertas": { administrador: "rw", gestor: "rw", financeiro: "rw", gestor_comercial: "r", administrativo: "r" },
  "/financeiro/b2b/central-governanca": { administrador: "rw", gestor: "rw", financeiro: "rw" },
  "/financeiro/b2b/regras": { administrador: "rw", gestor: "rw", financeiro: "rw" },
  "/executivo/socios-b2b": { administrador: "rw", gestor: "rw" },

  // ── Portal Mobile `/app/*` (Fase 3.2) ───────────────────────────────────
  // Compartilhado técnico + produtor
  "/app": rw(APP_SHARED_ROLES),
  "/app/perfil": rw(APP_SHARED_ROLES),
  "/app/notificacoes": rw(APP_SHARED_ROLES),
  // Somente técnico
  "/app/fazendas": rw(APP_TECHNICAL_ROLES),
  "/app/registrar": rw(APP_TECHNICAL_ROLES),
  "/app/registros": rw(APP_TECHNICAL_ROLES),
  "/app/atendimentos": rw(APP_TECHNICAL_ROLES),
  "/app/ordens": rw(APP_TECHNICAL_ROLES),
  "/app/solicitacoes": rw(APP_TECHNICAL_ROLES),
  "/app/checkin": rw(APP_TECHNICAL_ROLES),
  "/app/checkin/:solicitacaoId": rw(APP_TECHNICAL_ROLES),
  "/app/visita/novo": rw(APP_TECHNICAL_ROLES),
  "/app/visita/:id": rw(APP_TECHNICAL_ROLES),
  "/app/talhao/:id": rw(APP_TECHNICAL_ROLES),
  "/app/catalogo": rw(APP_TECHNICAL_ROLES),
  // Somente produtor
  "/app/recomendacoes": rw(APP_PRODUCER_ROLES),
  "/app/entregas": rw(APP_PRODUCER_ROLES),
  "/app/aplicacoes": rw(APP_PRODUCER_ROLES),
  "/app/aplicacoes/lista": rw(APP_PRODUCER_ROLES),
  "/app/solicitar": rw(APP_PRODUCER_ROLES),
};


export function getHomeForRole(role: string | null): string {
  if (!role) return "/auth";
  switch (role) {
    case "administrador":
    case "gestor":
      return "/dashboard/geral";
    case "cliente_produtor":
      return "/portal";
    case "parceiro_b2b":
      return "/portal-parceiro/pedidos";
    case "parceiro_b2b_tecnico":
      return "/portal-parceiro/dashboard";
    case "consultor_tecnico":
    case "tecnico_agronomo":
    case "aplicador":
      return "/app";
    case "gestor_comercial":
      return "/comercial/dashboard-consolidado";
    case "financeiro":
      return "/financeiro";
    case "operador_onfarm":
      return "/cockpit-laboratorio";
    case "producao":
      return "/operacao/dashboard-producao";
    case "administrativo":
      return "/solicitacoes";
    default:
      return "/";
  }
}


export function isMobileProfile(role: string | null): boolean {
  if (!role) return false;
  return ["consultor_tecnico", "tecnico_agronomo", "aplicador"].includes(role);
}

function resolveRoute(path: string): string {
  if (ACCESS_MAP[path]) return path;
  const segments = path.split("/").filter(Boolean);
  for (let i = segments.length; i > 0; i--) {
    const candidate = "/" + segments.slice(0, i).join("/");
    if (ACCESS_MAP[candidate]) return candidate;
  }
  return "/";
}

export function getAccessLevel(role: string | null, path: string): AccessLevel {
  if (!role) return "none";
  const route = resolveRoute(path);
  return ACCESS_MAP[route]?.[role as AppRole] ?? "none";
}

export function canAccess(role: string | null, path: string): boolean {
  return getAccessLevel(role, path) !== "none";
}

export function canWrite(role: string | null, path: string): boolean {
  return getAccessLevel(role, path) === "rw";
}

export const ROLE_LABELS: Record<string, string> = {
  administrador: "Administrador",
  gestor: "Gestor",
  consultor_tecnico: "Consultor Técnico",
  aplicador: "Aplicador",
  operador_onfarm: "Operador de Produção",
  cliente_produtor: "Cliente/Produtor",
  administrativo: "Administrativo",
  tecnico_agronomo: "Técnico Agrônomo",
  producao: "Produção",
  financeiro: "Financeiro",
  gestor_comercial: "Gestor Comercial",
  parceiro_b2b: "Parceiro B2B (Gestor)",
  parceiro_b2b_tecnico: "Parceiro B2B (Técnico)",
};


export const ROLE_VARIANTS: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  administrador: "destructive",
  gestor: "default",
  consultor_tecnico: "default",
  aplicador: "secondary",
  operador_onfarm: "secondary",
  cliente_produtor: "outline",
  administrativo: "outline",
  tecnico_agronomo: "default",
  producao: "secondary",
  financeiro: "default",
  gestor_comercial: "default",
  parceiro_b2b: "outline",
  parceiro_b2b_tecnico: "secondary",
};

export const ACTIVE_ROLES = [
  "administrador",
  "gestor",
  "consultor_tecnico",
  "tecnico_agronomo",
  "administrativo",
  "operador_onfarm",
  "producao",
  "aplicador",
  "cliente_produtor",
  "financeiro",
  "gestor_comercial",
  "parceiro_b2b",
  "parceiro_b2b_tecnico",
] as const;
