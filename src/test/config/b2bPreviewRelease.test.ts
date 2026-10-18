import { describe, expect, it } from "vitest";
import { AUTHZ_CACHE_FOUNDATION_ENABLED, AUTHZ_CACHE_ROLLOUT_SCOPE, PRODUCER_CONTEXT_MONITOR_ENABLED, FINANCIAL_CONTEXT_MONITOR_ENABLED } from "@/lib/authz/authzEpochGate";
import { AUTHENTICATED_ATTACHMENT_BLOBS_ENABLED } from "@/lib/authz/attachmentBlobGate";

describe("Liberação limitada do auditor 2026-10-18 22:55 — configuração real sem mocks", () => {
  it("habilita o monitor existente na prévia", () => {
    expect(AUTHZ_CACHE_FOUNDATION_ENABLED).toBe(true);
  });
  it("mantém o recorte b2b-context sem ativação v6/produtores", () => {
    expect(AUTHZ_CACHE_ROLLOUT_SCOPE).toBe("b2b-context");
  });
  it("mantém anexos Blob fechados", () => {
    expect(AUTHENTICATED_ATTACHMENT_BLOBS_ENABLED).toBe(false);
  });
  it("mantém a candidata do produtor fechada até liberação", () => {
    expect(PRODUCER_CONTEXT_MONITOR_ENABLED).toBe(false);
  });
  it("mantém a candidata financeira fechada até liberação", () => {
    expect(FINANCIAL_CONTEXT_MONITOR_ENABLED).toBe(false);
  });
});