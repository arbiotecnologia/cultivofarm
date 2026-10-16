import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { authorizeLaneInvoker, isTenantLaneRequest, timingSafeEqualText, LANE_INVOKER_HEADER } from "../../../scripts/smtp-tenant-candidate/f4b/invoker-auth";
import * as mirror from "../../../scripts/smtp-tenant-candidate/f2f3/deploy/supabase/functions/process-communication-outbox/tenant-lane/invoker-auth";

// Synthetic test-only value, never a real credential.
const CONFIGURED = "test-only-".padEnd(48, "x");
const URL_LANE = "https://example.test/functions/v1/process-communication-outbox?lane=tenant_smtp";
const req = (url: string, headers: Record<string, string> = {}, method = "POST") => new Request(url, { method, headers });

describe.each([["candidate", authorizeLaneInvoker], ["mirror", mirror.authorizeLaneInvoker]])("lane invoker auth (%s)", (_n, auth) => {
  it("correct dedicated header on lane route is accepted", () => expect(auth(req(URL_LANE, { [LANE_INVOKER_HEADER]: CONFIGURED }), CONFIGURED)).toBe(true));
  it("missing header denied", () => expect(auth(req(URL_LANE), CONFIGURED)).toBe(false));
  it("invalid header denied", () => expect(auth(req(URL_LANE, { [LANE_INVOKER_HEADER]: CONFIGURED.slice(0, -1) + "y" }), CONFIGURED)).toBe(false));
  it("prefix of the value denied", () => expect(auth(req(URL_LANE, { [LANE_INVOKER_HEADER]: CONFIGURED.slice(0, 40) }), CONFIGURED)).toBe(false));
  it("unconfigured, empty or short configured value denies everything", () => {
    for (const c of [undefined, "", "short"]) expect(auth(req(URL_LANE, { [LANE_INVOKER_HEADER]: c ?? "" }), c)).toBe(false);
  });
  it("global route never accepts the dedicated secret", () => {
    const base = "https://example.test/functions/v1/process-communication-outbox";
    for (const u of [base, `${base}?lane=other`, `${base}?lane=tenant_smtp&lane=global`, `${base}?lane=TENANT_SMTP`])
      expect(auth(req(u, { [LANE_INVOKER_HEADER]: CONFIGURED }), CONFIGURED)).toBe(false);
  });
  it("non-POST denied", () => expect(auth(req(URL_LANE, { [LANE_INVOKER_HEADER]: CONFIGURED }, "GET"), CONFIGURED)).toBe(false));
  it("global internal header does not authorize the lane", () => expect(auth(req(URL_LANE, { "x-internal-secret": CONFIGURED }), CONFIGURED)).toBe(false));
});

describe("lane invoker helpers and wiring", () => {
  it("timing-safe equality", () => {
    expect(timingSafeEqualText("abc", "abc")).toBe(true);
    expect(timingSafeEqualText("abc", "abd")).toBe(false);
    expect(timingSafeEqualText("abc", "abcd")).toBe(false);
  });
  it("lane route detection is exact", () => {
    expect(isTenantLaneRequest(req(URL_LANE))).toBe(true);
    expect(isTenantLaneRequest(req(URL_LANE.replace("tenant_smtp", "x")))).toBe(false);
  });
  it("worker: lane branch uses only dedicated auth; global route keeps original authorize and NOTIF3; lane flag promoted", () => {
    const w = readFileSync("scripts/smtp-tenant-candidate/f4b/worker-index.ts.review", "utf8");
    const lane = w.slice(w.indexOf("if (isTenantLaneRequest(req))"), w.indexOf("// Global route"));
    expect(lane).toContain("authorizeLaneInvoker(req, LANE_INVOKER_SECRET)");
    expect(lane).not.toContain("authorize(req)");
    const global = w.slice(w.indexOf("// Global route"));
    expect(global).toContain("const authz = authorize(req);");
    expect(global).not.toContain("LANE_INVOKER_SECRET");
    expect(w).toContain("const deliveryContractAvailable = false;");
    expect(w).toContain("export const TENANT_SMTP_LANE_REVIEWED = true;");
    expect(w.match(/TENANT_SMTP_LANE_INVOKER_SECRET/g)?.length).toBe(1);
  });
  it("cron option reads only the named Vault secret and sends the dedicated header", () => {
    const c = readFileSync("scripts/smtp-tenant-candidate/f4b/cron_option.sql.review", "utf8");
    expect(c).toContain("WHERE name='tenant_smtp_lane_invoker_secret'");
    expect(c).toContain("'x-tenant-smtp-secret',v_secret");
    expect(c).not.toContain("x-internal-secret");
    expect(c).toContain("process-communication-outbox?lane=tenant_smtp");
  });
});
