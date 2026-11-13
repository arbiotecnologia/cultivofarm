/**
 * Exceção à trava global de envio NFS-e: SOMENTE homologação, SOMENTE para
 * (organização, emitente) presentes na allowlist privada server-side
 * (platform_private.nfse_homolog_send_allowlist, vazia por padrão), verificada
 * pela RPC service-only rpc_nfse_homolog_send_allowed_v1. Puro; sem rede.
 * A trava global (NFSE_TRANSMISSION_ENABLED) não é alterada nem ligada.
 */
export const HOMOLOG_SEFIN_HOST = "sefin.producaorestrita.nfse.gov.br" as const;

export interface GateInput {
  globalEnabled: boolean;
  productionFlag: boolean;
  /** Resultado da RPC server-side (allowlist + ambientes + produção desligada). */
  allowlist: { allowed: boolean; reason?: string | null } | null;
}
export type Gate =
  | { enabled: true; mode: "global"; productionEnabled: boolean; homologOnlyHost: false }
  | { enabled: true; mode: "homolog_allowlist"; productionEnabled: false; homologOnlyHost: true }
  | { enabled: false; mode: "off"; reason: string };

export function decideTransmissionGate(i: GateInput): Gate {
  if (i.globalEnabled) return { enabled: true, mode: "global", productionEnabled: i.productionFlag, homologOnlyHost: false };
  if (i.allowlist?.allowed === true) return { enabled: true, mode: "homolog_allowlist", productionEnabled: false, homologOnlyHost: true };
  return { enabled: false, mode: "off", reason: i.allowlist?.reason ?? "transmission_disabled" };
}

/** No modo allowlist, só https://sefin.producaorestrita.nfse.gov.br sem porta/credenciais. */
export function assertAllowlistUrl(url: string): void {
  const u = new URL(url);
  if (u.protocol !== "https:" || u.host !== HOMOLOG_SEFIN_HOST || u.port || u.username || u.password) {
    throw Object.assign(new Error("host"), { code: "NFSE_ENDPOINT_BLOCKED" });
  }
}

/** Redirecionamento nunca é seguido; tratado como resposta inválida (reconciliação). */
export function rejectRedirect(status: number): void {
  if (status >= 300 && status < 400) throw Object.assign(new Error("redirect"), { code: "NFSE_REDIRECT_BLOCKED" });
}
