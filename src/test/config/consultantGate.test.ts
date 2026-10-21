import { describe, expect, it } from "vitest";
import { AUTHZ_CACHE_FOUNDATION_ENABLED, AUTHZ_CACHE_ROLLOUT_SCOPE, COMPANY_ADMIN_CONTEXT_MONITOR_ENABLED, CONSULTANT_CONTEXT_MONITOR_ENABLED, FINANCIAL_CONTEXT_MONITOR_ENABLED, PRODUCER_CONTEXT_MONITOR_ENABLED } from "@/lib/authz/authzEpochGate";
import { AUTHENTICATED_ATTACHMENT_BLOBS_ENABLED } from "@/lib/authz/attachmentBlobGate";
describe("consultant authorized activation actual flags", () => {
  it("only reviewed consultant scope is activated", () => { expect(CONSULTANT_CONTEXT_MONITOR_ENABLED).toBe(true); });
  it("all published limited scopes remain ON", () => {
    expect(AUTHZ_CACHE_FOUNDATION_ENABLED).toBe(true);
    expect(COMPANY_ADMIN_CONTEXT_MONITOR_ENABLED).toBe(true);
    expect(FINANCIAL_CONTEXT_MONITOR_ENABLED).toBe(true);
    expect(PRODUCER_CONTEXT_MONITOR_ENABLED).toBe(true);
  });
  it("global v6 closed; Blob authenticated active (signing removed)", () => {
    expect(AUTHZ_CACHE_ROLLOUT_SCOPE).toBe("b2b-context");
    expect(AUTHENTICATED_ATTACHMENT_BLOBS_ENABLED).toBe(true);
  });
});
