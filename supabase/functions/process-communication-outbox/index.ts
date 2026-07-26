// deno-lint-ignore-file no-explicit-any
// Edge Function: process-communication-outbox
// - POST-only
// - Requer x-internal-secret ou service_role
// - Se COMMUNICATION_DELIVERY_ENABLED != "true", retorna dry_run
// - Adapters retornam provider_not_configured (nenhuma rede)
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const DELIVERY_ENABLED = Deno.env.get("COMMUNICATION_DELIVERY_ENABLED") === "true";
const INAPP_ADAPTER_ENABLED = Deno.env.get("COMMUNICATION_INAPP_ADAPTER_ENABLED") === "true";
const INTERNAL_SECRET = Deno.env.get("COMMUNICATION_WORKER_INTERNAL_SECRET") ?? "";

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { ok: false, error: "method_not_allowed" });

  const providedSecret = req.headers.get("x-internal-secret") ?? "";
  const authHeader = req.headers.get("authorization") ?? "";
  const isServiceRole = authHeader.includes(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "___never___");
  const isInternal = INTERNAL_SECRET.length > 0 && providedSecret === INTERNAL_SECRET;
  if (!isServiceRole && !isInternal) {
    return json(401, { ok: false, error: "unauthorized" });
  }

  if (!DELIVERY_ENABLED) {
    return json(200, { ok: true, dry_run: true, disabled: true, claimed: 0 });
  }

  // Fase 1: mesmo com delivery enabled, adapters retornam provider_not_configured
  // Fluxo real será cabeado na Fase 2 com secrets configurados.
  return json(200, {
    ok: true,
    dry_run: false,
    claimed: 0,
    adapters: {
      email: "provider_not_configured",
      whatsapp: "provider_not_configured",
      in_app: INAPP_ADAPTER_ENABLED ? "enabled_no_op" : "disabled",
      push: "provider_not_configured",
    },
  });
});
