import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { MockPaymentAdapter } from "@/lib/payments/mockAdapter";

const migration = readFileSync("supabase/migrations/20261006014659_82dce7db-5ec7-420a-9c29-4631c866fa56.sql", "utf8");
const hardening = readFileSync("supabase/migrations/20261006015334_8cf441ba-da2b-4e6c-bf19-cdaa28ad1bee.sql", "utf8");

describe("Pós-D52 — versões comerciais", () => {
  it("mantém rascunho fora da publicação e exige confirmação forte", () => {
    expect(migration).toContain("status IN ('DRAFT','PUBLISHED','ARCHIVED')");
    expect(migration).toContain("_confirmation<>'PUBLICAR'");
    expect(migration).toContain("platform_validate_plan_version_draft");
  });
  it("serializa, evita duplicidade e preserva auditoria", () => {
    expect(migration).toContain("FOR UPDATE");
    expect(migration).toContain("uq_saas_plan_versions_publish_key");
    expect(hardening).toContain("saas_plan_version_audit_guard");
    expect(hardening).toContain("saas_plan_version_audit_no_mutation_trg");
  });
});

describe("Pós-D52 — fundação de pagamentos desligada", () => {
  it("rejeita exposição pública e mantém fila retida", () => {
    expect(migration).toContain("TO service_role");
    expect(migration).toContain("status) VALUES(v_id,'payment.reconcile'");
    expect(migration).toContain("'held'");
    expect(migration).not.toMatch(/checkout|pix_qr|card_token/i);
  });
  it("trata duplicidade, ordem inválida, assinatura inválida e retry", () => {
    expect(migration).toContain("provider_event_id");
    expect(migration).toContain("_signature_status<>'valid'");
    expect(migration).toContain("_sequence_number<=v_latest");
    expect(hardening).toContain("FOR UPDATE");
    expect(hardening).toContain("dead_letter");
  });
  it("usa adaptador mock determinístico sem rede", async () => {
    const adapter = new MockPaymentAdapter({ ref: { providerReference: "ref", status: "pending", observedAt: "2026-10-06T00:00:00Z" } });
    await expect(adapter.verifyEvent("{}", "invalid")).resolves.toBe(false);
    await expect(adapter.verifyEvent("{}", "mock-valid-signature")).resolves.toBe(true);
    await expect(adapter.fetchStatus("ref")).resolves.toMatchObject({ status: "pending" });
  });
});