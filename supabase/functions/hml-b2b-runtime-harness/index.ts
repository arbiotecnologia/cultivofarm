/** Historical mutating harness disabled. No clients, credentials or data operations. */
const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "OPTIONS, POST",
};

Deno.serve((req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  return new Response(JSON.stringify({
    error: "harness_disabled",
    code: "HML_HARNESS_DISABLED_NON_CANONICAL_TARGET",
  }), { status: 410, headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
