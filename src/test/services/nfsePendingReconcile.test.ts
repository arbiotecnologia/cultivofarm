import { describe, expect, it } from "vitest";
import { isIndeterminateTransmission, pendingTransmissionFor, type NfseTransmissionRow } from "@/lib/services/serviceBilling";

const INV = "00000000-0000-4000-8000-000000000001";
const OTHER = "00000000-0000-4000-8000-000000000002";
const row = (p: Partial<NfseTransmissionRow>): NfseTransmissionRow => ({ id: "t1", fiscal_invoice_id: INV, state: "SENT", outcome: "PENDING", access_key: null, created_at: "2026-11-13T20:00:00Z", ...p });

describe("envio NFS-e pendente", () => {
  it("SENT/PENDING sem chave é indeterminado e oferece consulta da própria transmissão", () => {
    expect(pendingTransmissionFor([row({})], INV)?.id).toBe("t1");
  });
  it("RECONCILIATION_REQUIRED sem chave continua indeterminado", () => {
    expect(isIndeterminateTransmission(row({ state: "SUCCEEDED", outcome: "RECONCILIATION_REQUIRED" }))).toBe(true);
  });
  it("autorizada, rejeitada ou não processada não bloqueia como pendente", () => {
    expect(isIndeterminateTransmission(row({ state: "SUCCEEDED", outcome: "AUTHORIZED", access_key: "K" }))).toBe(false);
    expect(isIndeterminateTransmission(row({ state: "FAILED", outcome: "REJECTED" }))).toBe(false);
    expect(isIndeterminateTransmission(row({ state: "FAILED", outcome: "NOT_FOUND" }))).toBe(false);
  });
  it("nunca usa transmissão de outra nota", () => {
    expect(pendingTransmissionFor([row({ fiscal_invoice_id: OTHER })], INV)).toBeNull();
  });
  it("escolhe a pendente mais recente", () => {
    const r = pendingTransmissionFor([row({ id: "old" }), row({ id: "new", created_at: "2026-11-13T21:00:00Z" })], INV);
    expect(r?.id).toBe("new");
  });
});
