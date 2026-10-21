// Promoted runtime 2026-10-21 from candidate scripts/technical-attachment-http-20261021 @ 3cd1e4b6.
// config.toml [functions.download-technical-attachment] verify_jwt = true is explicit (incident 2026-10-21).
// Backend homologated externally: Edge v1 ezbr dafbf6c643a7802b515343543ac9484845f6f5a7700127cb05051f6b267d65c4.
import { createClient } from "npm:@supabase/supabase-js@2.110.8";
import { corsHeaders } from "npm:@supabase/supabase-js@2.110.8/cors";
import { serveTechnicalAttachment } from "./core.ts";
import { createTransport, fetchStorageBytes } from "./transport.ts";

const origins = new Set(["https://app.cultivofarm.com.br", "https://cultivofarm.lovable.app",
  "https://id-preview--a79bb3db-f665-466d-bf41-ee8c6cb91fab.lovable.app", "http://localhost:8080"]);
Deno.serve(async req => {
  const origin = req.headers.get("Origin");
  const allowed = origin !== null && origins.has(origin);
  const headers = { ...corsHeaders, "Access-Control-Allow-Origin": allowed ? origin : "null",
    "Access-Control-Allow-Methods": "POST, OPTIONS", "Cache-Control": "private, no-store, max-age=0",
    "CDN-Cache-Control": "no-store", "Surrogate-Control": "no-store", "Vary": "Origin, Authorization" };
  const deny = (status: number) => new Response(JSON.stringify({ error: "Documento indisponível" }), {
    status, headers: { ...headers, "Content-Type": "application/json" } });
  if (origin !== null && !allowed) return deny(403);
  if (req.method === "OPTIONS") return allowed ? new Response(null, { headers }) : deny(403);
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_ANON_KEY");
  const bearer = req.headers.get("Authorization") ?? "";
  if (url !== "https://swzpzcwiasxmjutrmvkm.supabase.co" || !key) return deny(503);
  if (!/^Bearer \S+$/i.test(bearer)) return deny(401);
  const actor = createClient(url, key, { global: { headers: { Authorization: bearer },
    fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }) },
    auth: { persistSession: false, autoRefreshToken: false } });
  const storageKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"); // server only; never returned/logged
  if (!storageKey) return deny(503);
  let verified = false;
  const transport = createTransport({ rpc: async (path, signal) => {
    if (!verified) {
      const claims = await actor.auth.getClaims(bearer.slice(7));
      if (signal.aborted || claims.error || !claims.data?.claims?.sub) return null;
      verified = true;
    }
    const result = await actor.rpc("technical_attachment_download_snapshot", { _name: path }).abortSignal(signal);
    return result.error ? null : result.data;
  } }, (path, signal) => fetchStorageBytes(fetch, url, storageKey, path, signal));
  return serveTechnicalAttachment(req, headers, transport);
});
