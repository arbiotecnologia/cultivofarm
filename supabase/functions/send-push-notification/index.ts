// P1: the legacy payload has no proven source/tenant/recipient contract.
// Intentionally fail closed before subscriptions, queue writes or network delivery.
import { authenticate, json, requirePost } from "../_shared/auth-guard.ts";

Deno.serve(async (req) => {
  const early = requirePost(req);
  if (early) return early;
  const auth = await authenticate(req);
  if ("error" in auth) return auth.error;
  return json(503, { error: "NOTIF_EXTERNAL_DELIVERY_DISABLED" });
});
