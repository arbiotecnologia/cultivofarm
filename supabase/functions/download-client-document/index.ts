// REVIEW ONLY — intended path supabase/functions/download-client-document/index.ts.
import { createClient } from "npm:@supabase/supabase-js@2.110.8";
import { corsHeaders } from "npm:@supabase/supabase-js@2.110.8/cors";
import { serveDocument } from "./download.ts";
import { createTransport } from "./transport.ts";

const origins = new Set(["https://app.cultivofarm.com.br", "https://cultivofarm.lovable.app",
  "https://id-preview--a79bb3db-f665-466d-bf41-ee8c6cb91fab.lovable.app", "http://localhost:8080"]);
Deno.serve(async req => {
  const origin = req.headers.get("Origin");
  const allowed = origin !== null && origins.has(origin);
  const headers = { ...corsHeaders, "Access-Control-Allow-Origin": allowed ? origin : "null",
    "Access-Control-Allow-Methods": "POST, OPTIONS", "Cache-Control": "private, no-store, max-age=0",
    "CDN-Cache-Control": "no-store", "Surrogate-Control": "no-store", "Vary": "Origin, Authorization" };
  const deny = (status: number) => new Response(JSON.stringify({ error: "Documento indisponível" }), {
    status, headers: { ...headers, "Content-Type": "application/json" },
  });
  // Missing Origin is allowed for authenticated non-browser callers, not a CORS grant.
  if (origin !== null && !allowed) return deny(403);
  if (req.method === "OPTIONS") return allowed ? new Response(null, { headers }) : deny(403);
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_ANON_KEY");
  const bearer = req.headers.get("Authorization") ?? "";
  if (url !== "https://swzpzcwiasxmjutrmvkm.supabase.co" || !key) return deny(503);
  if (!/^Bearer \S+$/i.test(bearer)) return deny(401);
  // Actor client only proves authority; it never downloads through the denied GET.
  const actor = createClient(url, key, { global: { headers: { Authorization: bearer },
    fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }) },
    auth: { persistSession: false, autoRefreshToken: false } });
  // Existing server secret only; never passed to actor/PostgREST/browser or logged.
  const storageKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!storageKey) return deny(503);
  let verified = false;
  const transport = createTransport({ rpc: async (path, signal) => {
    if (!verified) {
      const claims = await actor.auth.getClaims(bearer.slice(7));
      if (signal.aborted || claims.error || !claims.data?.claims?.sub) return null;
      verified = true;
    }
    const result = await actor.rpc("client_document_download_snapshot", { _name: path }).abortSignal(signal);
    return result.error ? null : result.data;
  } }, async (path, signal) => {
    const credentialHeaders: Record<string, string> = { apikey: storageKey };
    if (!storageKey.startsWith("sb_secret_")) credentialHeaders.Authorization = `Bearer ${storageKey}`;
    const encoded = path.split("/").map(encodeURIComponent).join("/");
    const response = await fetch(`${url}/storage/v1/object/authenticated/clientes-docs/${encoded}`, {
      headers: credentialHeaders, signal, cache: "no-store", redirect: "error",
    });
    if (!response.ok || signal.aborted) { void response.body?.cancel().catch(() => undefined); return null; }
    return response.body;
  });
  return serveDocument(req, headers, transport);
});