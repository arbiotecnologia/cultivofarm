import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { manualLinkAuditState, manualLinkResponseHeaders, parseDeliveryMode } from "./manual-link-policy.ts";

Deno.test("delivery mode defaults to email and rejects values outside the allowlist", () => {
  assertEquals(parseDeliveryMode(undefined), "email");
  assertEquals(parseDeliveryMode("email"), "email");
  assertEquals(parseDeliveryMode("manual_link"), "manual_link");
  assertEquals(parseDeliveryMode("other"), null);
});

Deno.test("manual response disables storage", () => {
  assertEquals(manualLinkResponseHeaders(), { "Cache-Control": "no-store, private" });
});

Deno.test("audit state contains no credential material", () => {
  const state = manualLinkAuditState("org-id", "success");
  assertEquals(state, {
    organization_id: "org-id",
    origin: "platform_admin",
    outcome: "success",
    reason: "fallback de entrega",
  });
  assertEquals(JSON.stringify(state).includes("token"), false);
  assertEquals(JSON.stringify(state).includes("link"), false);
});