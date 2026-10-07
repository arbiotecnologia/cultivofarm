import { assertEquals, assertNotEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { parseAccess, temporaryPassword } from "./access-policy.ts";
const body = { access_action: "temporary_password", invite_id: "11111111-1111-4111-8111-111111111111", operation_id: "22222222-2222-4222-8222-222222222222", confirm: true };
Deno.test("access rejects forged identity and missing confirmation", () => {
  assertEquals(parseAccess({ ...body, user_id: body.invite_id }), null);
  assertEquals(parseAccess({ ...body, organization_id: body.invite_id }), null);
  assertEquals(parseAccess({ ...body, password: "operator-chosen" }), null);
  assertEquals(parseAccess({ ...body, confirm: false }), null);
  assertEquals(parseAccess(body)?.action, "temporary_password");
});
Deno.test("provisional password is cryptographically random and bounded", () => {
  const first = temporaryPassword();
  assertEquals(first.length, 52);
  assertEquals(/[A-Z]/.test(first) && /[0-9]/.test(first) && /#/.test(first), true);
  assertNotEquals(first, temporaryPassword());
});