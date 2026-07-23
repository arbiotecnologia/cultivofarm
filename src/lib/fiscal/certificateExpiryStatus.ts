/**
 * Fase H4-A1 — Classificador puro de validade do certificado A1 ativo.
 *
 * Consome apenas metadados sanitizados do view `v_fiscal_certificate_readiness`
 * (nenhum PFX, senha, `object_path` ou segredo). Não faz I/O.
 *
 * Regras:
 *   - Considera "ativo" quando `is_active === true` e `revoked_at === null`.
 *   - Um certificado é EXPIRADO se `status === "EXPIRED"` OU
 *     `days_until_expiration < 0`.
 *   - Em atenção (<=30 dias) se `days_until_expiration` está entre 0 e 30,
 *     inclusive.
 *   - Desconhecido se `days_until_expiration` é null/indefinido e o status
 *     não é claramente válido/expirado.
 *   - Válido em caso contrário.
 *
 * Prioridade do estado agregado: `expired` > `expiring_soon` > `unknown` >
 * `valid` > `none`.
 */

export type CertExpiryAggregate =
  | "none"
  | "valid"
  | "expiring_soon"
  | "expired"
  | "unknown";

export interface CertExpirySummary {
  status: CertExpiryAggregate;
  activeCount: number;
  expiredCount: number;
  expiringCount: number;
  unknownCount: number;
  /** Menor `days_until_expiration` entre ativos com valor conhecido. */
  worstDaysRemaining: number | null;
  /** Nome de exibição do "pior" certificado, quando aplicável. */
  worstDisplayName: string | null;
  /** Deve impedir avanço de homologação (banner bloqueante). */
  blocksHomologation: boolean;
}

export interface CertExpiryInput {
  status?: string | null;
  is_active?: boolean | null;
  revoked_at?: string | null;
  days_until_expiration?: number | null;
  display_name?: string | null;
}

function classifyOne(c: CertExpiryInput): "valid" | "expiring_soon" | "expired" | "unknown" {
  const days = c.days_until_expiration;
  if (c.status === "EXPIRED") return "expired";
  if (typeof days === "number" && Number.isFinite(days)) {
    if (days < 0) return "expired";
    if (days <= 30) return "expiring_soon";
    return "valid";
  }
  if (c.status === "AVAILABLE") return "unknown";
  return "unknown";
}

export function summarizeCertificateExpiry(
  certificates: readonly CertExpiryInput[] | null | undefined,
): CertExpirySummary {
  const list = Array.isArray(certificates) ? certificates : [];
  const active = list.filter((c) => c.is_active === true && c.revoked_at == null);

  if (active.length === 0) {
    return {
      status: "none",
      activeCount: 0,
      expiredCount: 0,
      expiringCount: 0,
      unknownCount: 0,
      worstDaysRemaining: null,
      worstDisplayName: null,
      blocksHomologation: false,
    };
  }

  let expiredCount = 0;
  let expiringCount = 0;
  let unknownCount = 0;
  let worstDaysRemaining: number | null = null;
  let worstDisplayName: string | null = null;

  for (const c of active) {
    const cls = classifyOne(c);
    if (cls === "expired") expiredCount++;
    else if (cls === "expiring_soon") expiringCount++;
    else if (cls === "unknown") unknownCount++;

    const d = typeof c.days_until_expiration === "number" && Number.isFinite(c.days_until_expiration)
      ? c.days_until_expiration
      : null;
    if (d !== null) {
      if (worstDaysRemaining === null || d < worstDaysRemaining) {
        worstDaysRemaining = d;
        worstDisplayName = (c.display_name ?? null);
      }
    }
  }

  let status: CertExpiryAggregate;
  if (expiredCount > 0) status = "expired";
  else if (expiringCount > 0) status = "expiring_soon";
  else if (unknownCount > 0) status = "unknown";
  else status = "valid";

  return {
    status,
    activeCount: active.length,
    expiredCount,
    expiringCount,
    unknownCount,
    worstDaysRemaining,
    worstDisplayName,
    blocksHomologation: status === "expired",
  };
}
