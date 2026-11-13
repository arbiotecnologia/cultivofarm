/**
 * Habilitação explícita de envio de NFS-e em homologação.
 *
 * Separada de `nfse_configuration.enabled_for_preparation` (que só marca
 * preparação e nunca libera envio). As condições são avaliadas sobre a
 * linha salva e reaplicadas como predicados do próprio UPDATE, para que o
 * banco só grave `nfse_enabled=true` se a linha persistida as satisfizer.
 */
export interface NfseSendEligibilityInput {
  nfse_provider?: string | null;
  fiscal_environment?: string | null;
  production_enabled?: boolean | null;
  nfse_credential_ref?: string | null;
  nfse_configuration?: unknown;
}

export type NfseSendBlocker =
  | "provider_not_nfse_nacional"
  | "fiscal_environment_not_homologation"
  | "nfse_environment_not_homologation"
  | "production_enabled"
  | "credential_ref_missing";

export const NFSE_SEND_BLOCKER_LABELS: Record<NfseSendBlocker, string> = {
  provider_not_nfse_nacional: "Provedor NFS-e salvo precisa ser NFS-e Nacional.",
  fiscal_environment_not_homologation: "Ambiente fiscal salvo precisa ser Homologação.",
  nfse_environment_not_homologation: "Ambiente NFS-e salvo precisa ser Homologação.",
  production_enabled: "Produção precisa estar desabilitada.",
  credential_ref_missing: "Referência de credencial NFS-e precisa estar cadastrada.",
};

function nfseEnvironment(cfg: unknown): unknown {
  return cfg && typeof cfg === "object" && !Array.isArray(cfg)
    ? (cfg as Record<string, unknown>).environment
    : undefined;
}

export function nfseHomologationSendBlockers(row: NfseSendEligibilityInput | null | undefined): NfseSendBlocker[] {
  if (!row) return ["provider_not_nfse_nacional", "fiscal_environment_not_homologation", "nfse_environment_not_homologation", "credential_ref_missing"];
  const out: NfseSendBlocker[] = [];
  if (row.nfse_provider !== "NFSE_NACIONAL") out.push("provider_not_nfse_nacional");
  if (row.fiscal_environment !== "HOMOLOGATION") out.push("fiscal_environment_not_homologation");
  if (nfseEnvironment(row.nfse_configuration) !== "HOMOLOGATION") out.push("nfse_environment_not_homologation");
  if (row.production_enabled !== false) out.push("production_enabled");
  if (typeof row.nfse_credential_ref !== "string" || row.nfse_credential_ref.trim() === "") out.push("credential_ref_missing");
  return out;
}

export function canEnableNfseHomologationSend(row: NfseSendEligibilityInput | null | undefined): boolean {
  return nfseHomologationSendBlockers(row).length === 0;
}
