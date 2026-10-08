import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

/** STORAGE-1: closed before authentication, domain reads, credentials or transport. */
export function handler(req: Request): Response {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  return new Response(JSON.stringify({
    success: false,
    error: "Envio e geração de link de PDF indisponíveis até validação do contrato de autorização.",
    code: "STORAGE1_PDF_CONTRACT_UNAVAILABLE",
  }), {
    status: 503,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

if (import.meta.main) Deno.serve(handler);
