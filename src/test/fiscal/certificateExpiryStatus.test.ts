/**
 * Fase H4-A1 — Testes puros do classificador de validade de certificado.
 * Nenhum I/O, nenhum segredo.
 */
import { describe, it, expect } from "vitest";
import {
  summarizeCertificateExpiry,
  type CertExpiryInput,
} from "@/lib/fiscal/certificateExpiryStatus";

function cert(overrides: Partial<CertExpiryInput> = {}): CertExpiryInput {
  return {
    status: "AVAILABLE",
    is_active: true,
    revoked_at: null,
    days_until_expiration: 365,
    display_name: "A1 Empresa",
    ...overrides,
  };
}

describe("summarizeCertificateExpiry", () => {
  it("lista vazia => status 'none' e sem bloqueio", () => {
    const r = summarizeCertificateExpiry([]);
    expect(r.status).toBe("none");
    expect(r.activeCount).toBe(0);
    expect(r.blocksHomologation).toBe(false);
    expect(r.worstDaysRemaining).toBeNull();
  });

  it("null/undefined => status 'none'", () => {
    expect(summarizeCertificateExpiry(null).status).toBe("none");
    expect(summarizeCertificateExpiry(undefined).status).toBe("none");
  });

  it("apenas revogados/inativos => status 'none'", () => {
    const r = summarizeCertificateExpiry([
      cert({ is_active: false }),
      cert({ revoked_at: new Date().toISOString() }),
    ]);
    expect(r.status).toBe("none");
    expect(r.activeCount).toBe(0);
  });

  it("certificado válido (>30 dias) => 'valid', não bloqueia", () => {
    const r = summarizeCertificateExpiry([cert({ days_until_expiration: 120 })]);
    expect(r.status).toBe("valid");
    expect(r.blocksHomologation).toBe(false);
    expect(r.worstDaysRemaining).toBe(120);
    expect(r.worstDisplayName).toBe("A1 Empresa");
  });

  it("<=30 dias => 'expiring_soon', não bloqueia, escolhe o pior", () => {
    const r = summarizeCertificateExpiry([
      cert({ display_name: "A", days_until_expiration: 40 }),
      cert({ display_name: "B", days_until_expiration: 12 }),
    ]);
    expect(r.status).toBe("expiring_soon");
    expect(r.blocksHomologation).toBe(false);
    expect(r.worstDaysRemaining).toBe(12);
    expect(r.worstDisplayName).toBe("B");
    expect(r.expiringCount).toBe(1);
  });

  it("expirado (status EXPIRED) => 'expired', bloqueia homologação", () => {
    const r = summarizeCertificateExpiry([
      cert({ status: "EXPIRED", days_until_expiration: -5, display_name: "Vencido" }),
    ]);
    expect(r.status).toBe("expired");
    expect(r.blocksHomologation).toBe(true);
    expect(r.expiredCount).toBe(1);
    expect(r.worstDaysRemaining).toBe(-5);
  });

  it("expirado (dias<0) mesmo com status AVAILABLE => 'expired'", () => {
    const r = summarizeCertificateExpiry([cert({ days_until_expiration: -1 })]);
    expect(r.status).toBe("expired");
    expect(r.blocksHomologation).toBe(true);
  });

  it("expirado prevalece sobre expiring_soon e unknown", () => {
    const r = summarizeCertificateExpiry([
      cert({ days_until_expiration: 20 }),
      cert({ days_until_expiration: null }),
      cert({ status: "EXPIRED", days_until_expiration: null }),
    ]);
    expect(r.status).toBe("expired");
  });

  it("desconhecido quando dias=null e sem sinal claro => 'unknown'", () => {
    const r = summarizeCertificateExpiry([
      cert({ status: "AVAILABLE", days_until_expiration: null }),
    ]);
    expect(r.status).toBe("unknown");
    expect(r.blocksHomologation).toBe(false);
    expect(r.unknownCount).toBe(1);
    expect(r.worstDaysRemaining).toBeNull();
  });

  it("expiring_soon prevalece sobre unknown/valid", () => {
    const r = summarizeCertificateExpiry([
      cert({ days_until_expiration: 200 }),
      cert({ days_until_expiration: null }),
      cert({ days_until_expiration: 5 }),
    ]);
    expect(r.status).toBe("expiring_soon");
    expect(r.worstDaysRemaining).toBe(5);
  });
});
