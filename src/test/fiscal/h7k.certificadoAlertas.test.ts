/**
 * H7-05 — Alertas antecipados de validade do certificado A1 (60/30/15/7).
 * Puro: nenhum segredo, nenhum I/O.
 */
import { describe, expect, it } from "vitest";
import {
  certificateAlertTier,
  summarizeCertificateExpiry,
  CERT_ALERT_TIERS,
} from "@/lib/fiscal/certificateExpiryStatus";

const active = (days: number | null) => [
  { is_active: true, revoked_at: null, days_until_expiration: days, display_name: "A1", status: "AVAILABLE" },
];

describe("H7-05 — faixas de alerta do certificado", () => {
  it("expõe os limiares canônicos", () => {
    expect(CERT_ALERT_TIERS).toEqual([60, 30, 15, 7]);
  });

  it.each([
    [90, null],
    [61, null],
    [60, 60],
    [31, 60],
    [30, 30],
    [16, 30],
    [15, 15],
    [8, 15],
    [7, 7],
    [0, 7],
  ])("dias=%s => faixa=%s", (days, tier) => {
    expect(certificateAlertTier(days as number)).toBe(tier);
  });

  it("dias negativos ou desconhecidos não geram faixa", () => {
    expect(certificateAlertTier(-1)).toBeNull();
    expect(certificateAlertTier(null)).toBeNull();
  });

  it("resumo marca atenção a partir de 60 dias com faixa correspondente", () => {
    const s = summarizeCertificateExpiry(active(45));
    expect(s.status).toBe("expiring_soon");
    expect(s.alertTier).toBe(60);
    expect(s.blocksHomologation).toBe(false);
  });

  it("resumo escala para 7 dias", () => {
    expect(summarizeCertificateExpiry(active(5)).alertTier).toBe(7);
  });

  it("acima de 60 dias permanece válido sem alerta", () => {
    const s = summarizeCertificateExpiry(active(120));
    expect(s.status).toBe("valid");
    expect(s.alertTier).toBeNull();
  });

  it("expirado bloqueia e não emite faixa", () => {
    const s = summarizeCertificateExpiry(active(-3));
    expect(s.status).toBe("expired");
    expect(s.blocksHomologation).toBe(true);
    expect(s.alertTier).toBeNull();
  });

  it("sem certificado ativo: nenhum alerta", () => {
    expect(summarizeCertificateExpiry([]).alertTier).toBeNull();
  });
});
