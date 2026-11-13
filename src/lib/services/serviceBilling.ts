/** Regras de apresentação/seleção. Autoridade real: RLS + RPCs do servidor. */
export type EngagementStatus = "DRAFT" | "READY" | "BILLED" | "CANCELED";

export const CATALOG_WRITE_ROLES = ["administrador", "gestor", "financeiro"] as const;
export const BILLING_ROLES = ["administrador", "financeiro"] as const;
export const FISCAL_PROFILE_WRITE_ROLES = ["administrador", "financeiro"] as const;

const has = (roles: readonly string[], allowed: readonly string[]) => roles.some(r => allowed.includes(r));
export const canWriteServiceCatalog = (roles: readonly string[]) => has(roles, CATALOG_WRITE_ROLES);
export const canRecordEngagement = (roles: readonly string[]) => has(roles, CATALOG_WRITE_ROLES);
export const canBillServices = (roles: readonly string[]) => has(roles, BILLING_ROLES);
export const canEditServiceFiscalProfile = (roles: readonly string[]) => has(roles, FISCAL_PROFILE_WRITE_ROLES);

export const ENGAGEMENT_STATUS_LABEL: Record<EngagementStatus, string> = {
  DRAFT: "Rascunho", READY: "Pronto para faturar", BILLED: "Faturado", CANCELED: "Cancelado",
};

export type NfseDisplayState = "RASCUNHO" | "ENVIO_PENDENTE" | "REJEITADA" | "AUTORIZADA" | "CANCELADA" | "DESCONHECIDO";

/**
 * Autorizada só com status AUTHORIZED E protocolo/número real do provedor.
 * Sem prova do provedor, nunca apresenta autorização.
 */
export function nfseDisplayState(inv: { normalized_status?: string | null; status?: string | null; provider_reference?: string | null; invoice_number?: string | null } | null | undefined): NfseDisplayState {
  if (!inv) return "DESCONHECIDO";
  const s = (inv.normalized_status ?? inv.status ?? "").toUpperCase();
  if (s === "AUTHORIZED") return (inv.provider_reference || inv.invoice_number) ? "AUTORIZADA" : "DESCONHECIDO";
  if (s === "DRAFT" || s === "VALIDATING" || s === "READY") return "RASCUNHO";
  if (s === "QUEUED" || s === "PROCESSING") return "ENVIO_PENDENTE";
  if (s === "REJECTED" || s === "ERROR") return "REJEITADA";
  if (s === "CANCELED" || s === "CANCEL_REQUESTED" || s === "SUBSTITUTED") return "CANCELADA";
  return "DESCONHECIDO";
}

export const NFSE_STATE_LABEL: Record<NfseDisplayState, string> = {
  RASCUNHO: "Rascunho", ENVIO_PENDENTE: "Envio pendente", REJEITADA: "Rejeitada", AUTORIZADA: "Autorizada",
  CANCELADA: "Cancelada", DESCONHECIDO: "Situação não confirmada",
};

export interface SelectableEngagement { id: string; customer_id: string; status: EngagementStatus }

export type BillingSelectionError = "empty" | "not_ready" | "mixed_customers" | null;
export function validateBillingSelection(rows: SelectableEngagement[]): BillingSelectionError {
  if (rows.length === 0) return "empty";
  if (rows.some(r => r.status !== "READY")) return "not_ready";
  if (new Set(rows.map(r => r.customer_id)).size !== 1) return "mixed_customers";
  return null;
}

export function selectionFingerprint(ids: string[]): string {
  return [...new Set(ids)].sort().join(",");
}

/** Chave de idempotência estável por seleção, enquanto o resultado for incerto. */
export class BillingKeyStore {
  private keys = new Map<string, string>();
  constructor(private gen: () => string = () => `svcbill-${crypto.randomUUID()}`) {}
  keyFor(scope: string, ids: string[]): string {
    const k = `${scope}|${selectionFingerprint(ids)}`;
    let v = this.keys.get(k);
    if (!v) { v = this.gen(); this.keys.set(k, v); }
    return v;
  }
  /** Só após resposta definitiva do servidor (sucesso ou recusa de negócio). */
  settle(scope: string, ids: string[]) { this.keys.delete(`${scope}|${selectionFingerprint(ids)}`); }
}

export const READINESS_MISSING_LABEL: Record<string, string> = {
  company_fiscal_settings: "Configuração fiscal da empresa",
  nfse_enabled: "NFS-e habilitada na configuração fiscal",
  nfse_provider: "Provedor de NFS-e",
  nfse_credential: "Credencial do provedor",
  municipality_ibge_code: "Código IBGE do município do emitente",
};

/** Linha do ledger NFS-e visível ao operador (RLS da própria empresa). */
export interface NfseTransmissionRow { id: string; fiscal_invoice_id: string; state: string; outcome: string | null; access_key: string | null; created_at: string }

/** Envio indeterminado: enviado sem retorno conclusivo ou marcado para reconciliação,
 * sem chave de acesso. Enquanto existir, a nota NÃO pode ser reenviada — só consultada. */
export function isIndeterminateTransmission(t: Pick<NfseTransmissionRow, "state" | "outcome" | "access_key">): boolean {
  if (t.access_key) return false;
  if (t.outcome === "AUTHORIZED" || t.outcome === "REJECTED" || t.outcome === "NOT_FOUND") return false;
  return t.state === "SENT" || t.state === "SENDING" || t.outcome === "PENDING" || t.outcome === "RECONCILIATION_REQUIRED";
}

/** Transmissão pendente mais recente da própria nota (nunca de outra nota). */
export function pendingTransmissionFor(rows: NfseTransmissionRow[] | undefined, invoiceId: string): NfseTransmissionRow | null {
  const own = (rows ?? []).filter(r => r.fiscal_invoice_id === invoiceId && isIndeterminateTransmission(r));
  own.sort((a, b) => b.created_at.localeCompare(a.created_at));
  return own[0] ?? null;
}

/** Diagnóstico seguro devolvido pela consulta (sem URL, corpo, XML ou credenciais). */
export interface NfseReconcileDiagnostic { stage?: string | null; result?: string | null; httpStatus?: number | null; runtime?: { createHttpClient?: boolean; denoVersion?: string | null } | null }
const STAGE_LABEL: Record<string, string> = { dps_lookup: "consulta da DPS", nfse_download: "download da NFS-e", emit: "envio", before_http: "antes da chamada ao provedor", unknown: "etapa não identificada" };
const RESULT_LABEL: Record<string, string> = {
  certificate_unavailable: "certificado A1 indisponível no servidor", mtls_unavailable: "recurso de certificado (mTLS) indisponível no ambiente do servidor",
  mtls_client_rejected: "certificado/chave recusados ao montar a conexão", timeout: "tempo esgotado", tls_error: "falha TLS/certificado",
  network_error: "falha de rede", redirect_blocked: "redirecionamento bloqueado", authorization_denied: "acesso negado pelo provedor",
  not_found: "não encontrado no provedor", server_error: "provedor indisponível", unexpected_status: "status inesperado",
  unexpected_format: "retorno em formato inesperado", ok: "resposta recebida",
};
export function describeReconcileDiagnostic(d: NfseReconcileDiagnostic | null | undefined): string {
  if (!d) return "Sem diagnóstico.";
  const parts = [`Etapa: ${STAGE_LABEL[d.stage ?? "unknown"] ?? "etapa não identificada"}`];
  parts.push(`Resultado: ${d.result ? (RESULT_LABEL[d.result] ?? "não classificado") : "sem chamada ao provedor"}`);
  parts.push(`HTTP: ${typeof d.httpStatus === "number" ? d.httpStatus : "sem resposta"}`);
  if (d.runtime && d.runtime.createHttpClient === false) parts.push("mTLS indisponível no ambiente");
  return parts.join(" · ");
}
