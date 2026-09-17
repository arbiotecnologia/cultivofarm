/** Historical mutating harness disabled. No clients, credentials or data operations. */
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

Deno.serve((req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  return new Response(JSON.stringify({
    error: "harness_disabled",
    code: "HML_HARNESS_DISABLED_NON_CANONICAL_TARGET",
  }), { status: 410, headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
