// P1: no external queue/recipient contract is homologated. No delivery is possible.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), {
  status, headers: { ...corsHeaders, "Content-Type": "application/json" },
});

Deno.serve((req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "METHOD_NOT_ALLOWED" });
  // No privileged action or data is exposed; refusal intentionally needs no identity.
  return json(503, { error: "NOTIF_EXTERNAL_DELIVERY_DISABLED" });
});
