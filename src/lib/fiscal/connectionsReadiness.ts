/**
 * Fase H5-A — Prontidão das conexões fiscais (somente leitura).
 *
 * Puro e client-side. Não faz IO, não realiza teste de conexão real, não
 * exige nem persiste segredo. Consome apenas o singleton
 * `company_fiscal_settings` (via `CompanyFiscalRow`) e a viewzinha
 * sanitizada `v_fiscal_certificate_readiness` (via
 * `FiscalCertificateReadinessRow`) — ambos já expostos pelos hooks.
 *
 * Estados (pt-BR):
 *  - `not_started`     — Não iniciado
 *  - `pending`         — Pendente
 *  - `filled_untested` — Preenchido — não testado
 *  - `not_tested`      — Conexão não testada
 *  - `ready_to_test`   — Pronto para testar
 *  - `blocked`         — Bloqueado
 *  - `not_applicable`  — Não aplicável
 *
 * Nenhum item deve renderizar "0" quando o valor é desconhecido; a UI
 * exibe "Pendente" ou "Não informado" nesses casos.
 */
import type { CompanyFiscalRow } from "@/hooks/useFiscalCompanySettings";
import type { FiscalCertificateReadinessRow } from "@/hooks/useFiscalCertificates";
import { FISCAL_EMPRESA_BASE } from "@/lib/fiscal/companyMissingFields";

export const CONNECTION_ITEM_STATUS = [
  "not_started",
  "pending",
  "filled_untested",
  "not_tested",
  "ready_to_test",
  "blocked",
  "not_applicable",
] as const;
export type ConnectionItemStatus = (typeof CONNECTION_ITEM_STATUS)[number];

export const CONNECTION_STATUS_LABEL_PTBR: Record<ConnectionItemStatus, string> = {
  not_started: "Não iniciado",
  pending: "Pendente",
  filled_untested: "Preenchido — não testado",
  not_tested: "Conexão não testada",
  ready_to_test: "Pronto para testar",
  blocked: "Bloqueado",
  not_applicable: "Não aplicável",
};

export type ConnectionItemKey =
  | "empresa"
  | "nfe"
  | "nfse"
  | "provedor"
  | "credenciais_provedor"
  | "certificado_a1"
  | "webhook"
  | "ambiente";

export interface ConnectionItem {
  key: ConnectionItemKey;
  label: string;
  status: ConnectionItemStatus;
  description: string;
  /** Deep-link canônico H4-A2: `?aba=<aba>#<id-real>` (rota real do projeto). */
  deepLink: string;
}

export interface ConnectionsReadinessResult {
  items: ConnectionItem[];
  /** `true` quando algum item bloqueia a habilitação de produção. */
  hasBlocker: boolean;
  /**
   * `true` quando os pré-requisitos mínimos p/ habilitar produção estão
   * atendidos: sem bloqueios, dados da empresa preenchidos, certificado
   * disponível, provedor com credenciais preenchidas para todos os
   * documentos habilitados, ambiente de homologação selecionado.
   *
   * Esta fase NÃO habilita produção — apenas expõe o estado calculado.
   */
  productionAllowed: boolean;
}

// ─── Helpers internos ────────────────────────────────────────────────
function empty(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.trim() === "";
  return false;
}

function link(tab: string, hash?: string): string {
  return hash
    ? `${FISCAL_EMPRESA_BASE}?aba=${tab}#${hash}`
    : `${FISCAL_EMPRESA_BASE}?aba=${tab}`;
}

/** `fiscal_provider` "vazio"/desconhecido: aceitamos `null`, "", "NONE". */
function providerConfigured(value: unknown): boolean {
  if (empty(value)) return false;
  const v = String(value).trim().toUpperCase();
  return v !== "" && v !== "NONE" && v !== "N/A";
}

// ─── Empresa ─────────────────────────────────────────────────────────
function computeEmpresa(row: CompanyFiscalRow | null): ConnectionItem {
  const base: ConnectionItem = {
    key: "empresa",
    label: "Dados da empresa",
    status: "not_started",
    description: "Cadastre CNPJ, razão social e endereço fiscal.",
    deepLink: link("empresa"),
  };
  if (row === null) return base;
  const required: Array<keyof CompanyFiscalRow> = [
    "cnpj", "legal_name", "state", "municipality_ibge_code",
  ];
  const missing = required.filter((k) => empty(row[k]));
  if (missing.length === required.length) return base;
  if (missing.length > 0) {
    return {
      ...base,
      status: "pending",
      description: "Alguns campos essenciais da empresa ainda estão em branco.",
    };
  }
  return {
    ...base,
    status: "filled_untested",
    description: "Dados da empresa preenchidos. Valide com a contabilidade.",
  };
}

// ─── NF-e ────────────────────────────────────────────────────────────
function computeNfe(row: CompanyFiscalRow | null): ConnectionItem {
  const base: ConnectionItem = {
    key: "nfe",
    label: "NF-e",
    status: "not_started",
    description: "Configuração de NF-e ainda não iniciada.",
    deepLink: link("nfe"),
  };
  if (row === null) return base;
  if (row.nfe_enabled !== true) {
    return {
      ...base,
      status: "not_applicable",
      description: "NF-e desativada nesta configuração.",
    };
  }
  const missing: string[] = [];
  if (!providerConfigured(row.nfe_provider)) missing.push("provedor");
  if (empty(row.nfe_series)) missing.push("série");
  if (missing.length > 0) {
    return {
      ...base,
      status: "pending",
      description: `Pendente: ${missing.join(", ")}.`,
    };
  }
  return {
    ...base,
    status: "filled_untested",
    description: "Provedor e série de NF-e preenchidos. Teste de conexão ainda não realizado.",
  };
}

// ─── NFS-e ───────────────────────────────────────────────────────────
function computeNfse(row: CompanyFiscalRow | null): ConnectionItem {
  const base: ConnectionItem = {
    key: "nfse",
    label: "NFS-e",
    status: "not_started",
    description: "Configuração de NFS-e ainda não iniciada.",
    deepLink: link("nfse"),
  };
  if (row === null) return base;
  if (row.nfse_enabled !== true) {
    return {
      ...base,
      status: "not_applicable",
      description: "NFS-e desativada nesta configuração.",
    };
  }
  if (!providerConfigured(row.nfse_provider)) {
    return {
      ...base,
      status: "pending",
      description: "Pendente: provedor de NFS-e.",
    };
  }
  return {
    ...base,
    status: "filled_untested",
    description: "Provedor de NFS-e preenchido. Teste de conexão ainda não realizado.",
  };
}

// ─── Provedor (agregado) ─────────────────────────────────────────────
function computeProvedor(row: CompanyFiscalRow | null): ConnectionItem {
  const base: ConnectionItem = {
    key: "provedor",
    label: "Provedor",
    status: "not_started",
    description: "Selecione o provedor fiscal para os documentos habilitados.",
    deepLink: link("provedor"),
  };
  if (row === null) return base;
  const anyEnabled = row.nfe_enabled === true || row.nfse_enabled === true;
  if (!anyEnabled) {
    return {
      ...base,
      status: "not_applicable",
      description: "Nenhum tipo de documento fiscal está habilitado.",
    };
  }
  const nfeOk = row.nfe_enabled !== true || providerConfigured(row.nfe_provider);
  const nfseOk = row.nfse_enabled !== true || providerConfigured(row.nfse_provider);
  if (!nfeOk || !nfseOk) {
    return {
      ...base,
      status: "pending",
      description: "Selecione o provedor de cada documento habilitado.",
    };
  }
  return {
    ...base,
    status: "filled_untested",
    description: "Provedor(es) preenchido(s). Conexão ainda não testada.",
  };
}

// ─── Credenciais do provedor ─────────────────────────────────────────
function computeCredenciais(row: CompanyFiscalRow | null): ConnectionItem {
  const base: ConnectionItem = {
    key: "credenciais_provedor",
    label: "Credenciais do provedor",
    status: "not_started",
    description: "Somente referências server-side. Nunca cole token ou senha na tela.",
    deepLink: link("provedor", "credenciais_provedor"),
  };
  if (row === null) return base;
  const anyEnabled = row.nfe_enabled === true || row.nfse_enabled === true;
  if (!anyEnabled) {
    return {
      ...base,
      status: "not_applicable",
      description: "Nenhum documento habilitado exige credencial.",
    };
  }
  const nfeMissing = row.nfe_enabled === true && empty(row.nfe_credential_ref);
  const nfseMissing = row.nfse_enabled === true && empty(row.nfse_credential_ref);
  if (nfeMissing || nfseMissing) {
    return {
      ...base,
      status: "pending",
      description: "Referência de credencial ausente. Configure o segredo no servidor e informe apenas o identificador.",
    };
  }
  return {
    ...base,
    status: "not_tested",
    description: "Referência de credencial preenchida. Teste de conexão ainda não realizado.",
  };
}

// ─── Certificado A1 ──────────────────────────────────────────────────
function computeCertificado(
  certificates: FiscalCertificateReadinessRow[] | null | undefined,
): ConnectionItem {
  const base: ConnectionItem = {
    key: "certificado_a1",
    label: "Certificado A1",
    status: "not_started",
    description: "Nenhum certificado A1 cadastrado.",
    deepLink: link("certificado", "certificado-a1"),
  };
  const list = Array.isArray(certificates) ? certificates : [];
  const active = list.filter((c) => c && c.is_active && !c.revoked_at);
  if (active.length === 0) {
    return { ...base, status: "not_started" };
  }
  // Bloqueia se todos ativos estão expirados/revogados/erro.
  const anyAvailable = active.some((c) => c.status === "AVAILABLE"
    && (c.days_until_expiration === null || c.days_until_expiration > 0));
  const anyExpired = active.some((c) => c.status === "EXPIRED"
    || (typeof c.days_until_expiration === "number" && c.days_until_expiration <= 0));
  if (!anyAvailable && anyExpired) {
    return {
      ...base,
      status: "blocked",
      description: "Certificado A1 expirado. Renove antes de homologar.",
    };
  }
  if (!anyAvailable) {
    return {
      ...base,
      status: "pending",
      description: "Certificado presente, mas sem status válido para uso.",
    };
  }
  return {
    ...base,
    status: "filled_untested",
    description: "Certificado A1 disponível. Uso efetivo ocorrerá no ambiente selecionado.",
  };
}

// ─── Webhook ─────────────────────────────────────────────────────────
function computeWebhook(row: CompanyFiscalRow | null): ConnectionItem {
  const base: ConnectionItem = {
    key: "webhook",
    label: "Webhook de retorno",
    status: "not_started",
    description: "Nenhum webhook de retorno configurado.",
    deepLink: link("webhook", "webhook_ref"),
  };
  if (row === null) return base;
  if (empty(row.webhook_ref)) {
    return {
      ...base,
      status: "pending",
      description: "Referência de webhook ainda não informada.",
    };
  }
  return {
    ...base,
    status: "not_tested",
    description: "Referência de webhook informada. Retorno ainda não testado.",
  };
}

// ─── Ambiente ────────────────────────────────────────────────────────
function computeAmbiente(row: CompanyFiscalRow | null): ConnectionItem {
  const base: ConnectionItem = {
    key: "ambiente",
    label: "Ambiente de homologação",
    status: "not_started",
    description: "Selecione o ambiente de homologação nas configurações.",
    deepLink: link("empresa", "fiscal_environment"),
  };
  if (row === null) return base;
  const env = String(row.fiscal_environment ?? "").trim().toUpperCase();
  const isHomolog = env === "HOMOLOGATION" || env === "SANDBOX" || env === "HOMOLOGACAO";
  const isProduction = env === "PRODUCTION" || env === "PRODUCAO";
  if (isProduction) {
    // Produção não deve estar habilitada nesta fase; sinaliza pendência
    // para retorno explícito à homologação, sem bloquear salvar rascunho.
    return {
      ...base,
      status: "pending",
      description: "Ambiente marcado como produção. Volte para homologação até concluir a validação.",
    };
  }
  if (!isHomolog) {
    return {
      ...base,
      status: "pending",
      description: "Ambiente ainda não definido como homologação.",
    };
  }
  return {
    ...base,
    status: "ready_to_test",
    description: "Ambiente de homologação selecionado.",
  };
}

// ─── API pública ─────────────────────────────────────────────────────
export function computeConnectionsReadiness(
  row: CompanyFiscalRow | null,
  certificates: FiscalCertificateReadinessRow[] | null | undefined,
): ConnectionsReadinessResult {
  const items: ConnectionItem[] = [
    computeEmpresa(row),
    computeNfe(row),
    computeNfse(row),
    computeProvedor(row),
    computeCredenciais(row),
    computeCertificado(certificates),
    computeWebhook(row),
    computeAmbiente(row),
  ];
  const hasBlocker = items.some((i) => i.status === "blocked");
  // Habilitação de produção exige: sem bloqueios; empresa preenchida;
  // certificado disponível; provedor + credenciais preenchidos para todos
  // documentos habilitados; ambiente de homologação selecionado. Esta
  // fase NÃO ativa produção — só reporta o estado.
  const empresaOk = items.find((i) => i.key === "empresa")?.status === "filled_untested";
  const certOk = items.find((i) => i.key === "certificado_a1")?.status === "filled_untested";
  const provedorState = items.find((i) => i.key === "provedor")?.status;
  const credState = items.find((i) => i.key === "credenciais_provedor")?.status;
  const ambienteOk = items.find((i) => i.key === "ambiente")?.status === "ready_to_test";
  const provedorOk = provedorState === "filled_untested" || provedorState === "not_applicable";
  const credOk = credState === "not_tested" || credState === "not_applicable";
  const productionAllowed = !hasBlocker && empresaOk && certOk && provedorOk && credOk && ambienteOk;
  return { items, hasBlocker, productionAllowed };
}
