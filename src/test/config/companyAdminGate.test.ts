import { describe, expect, it } from "vitest";
import { AUTHZ_CACHE_FOUNDATION_ENABLED, AUTHZ_CACHE_ROLLOUT_SCOPE, COMPANY_ADMIN_CONTEXT_MONITOR_ENABLED, FINANCIAL_CONTEXT_MONITOR_ENABLED, PRODUCER_CONTEXT_MONITOR_ENABLED } from "@/lib/authz/authzEpochGate";
import { AUTHENTICATED_ATTACHMENT_BLOBS_ENABLED } from "@/lib/authz/attachmentBlobGate";
describe("admin candidate actual flags", () => {
  it("admin remains review gated", () => { expect(COMPANY_ADMIN_CONTEXT_MONITOR_ENABLED).toBe(false); });
  it("published scopes remain enabled", () => {
    expect(AUTHZ_CACHE_FOUNDATION_ENABLED).toBe(true);
    expect(FINANCIAL_CONTEXT_MONITOR_ENABLED).toBe(true);
    expect(PRODUCER_CONTEXT_MONITOR_ENABLED).toBe(true);
  });
  it("global v6 and Blob remain closed", () => {
    expect(AUTHZ_CACHE_ROLLOUT_SCOPE).toBe("b2b-context");
    expect(AUTHENTICATED_ATTACHMENT_BLOBS_ENABLED).toBe(false);
  });
});