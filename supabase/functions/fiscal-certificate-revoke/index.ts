/**
 * Fase Fiscal 3.16 — Edge Function `fiscal-certificate-revoke`.
 *
 * Admin-only. Marca metadado como revogado (logical delete),
 * remove objeto do bucket privado. Idempotente. NÃO faz DELETE físico
 * do registro de auditoria.
 *
 * NÃO IMPLANTAR nesta execução.
 */
import { createClient } from "npm:@supabase/supabase-js@2";

function corsHeaders(origin: string | null): { headers: Record<string, string>; allowed: boolean } {
  const allow = (Deno.env.get("FISCAL_CORS_ALLOWLIST") ?? "")
    .split(",").map((s) => s.trim()).filter(Boolean);
  const allowed = !!origin && allow.includes(origin);
  return {
    allowed,
    headers: {
      "Access-Control-Allow-Origin": allowed ? origin! : "null",
      "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Vary": "Origin",
    },
  };
}

function json(body: unknown, status: number, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  const cors = corsHeaders(origin);
  const headers = cors.headers;
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (!cors.allowed) return json({ error: "cors_origin_not_allowed" }, 403, headers);
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405, headers);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401, headers);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceKey) {
    return json({ error: "server_misconfigured" }, 500, headers);
  }
  const authed = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const token = authHeader.replace("Bearer ", "");
  const claims = await authed.auth.getClaims(token);
  const userId = claims.data?.claims?.sub;
  if (!userId) return json({ error: "unauthorized" }, 401, headers);

  const { data: isAdmin } = await authed.rpc("has_role", {
    _user_id: userId,
    _role: "administrador",
  });
  if (!isAdmin) return json({ error: "permission_denied" }, 403, headers);

  let body: { certificate_id?: string; reason?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_body" }, 400, headers);
  }
  if (!body.certificate_id) return json({ error: "certificate_id_required" }, 400, headers);

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  // Busca object_path para remover fisicamente
  const { data: mat } = await admin.from("fiscal_certificate_material")
    .select("object_path")
    .eq("certificate_id", body.certificate_id)
    .maybeSingle();

  // Revoga logicamente via RPC autenticada (auth.uid dentro)
  const { error: rpcErr } = await authed.rpc("rpc_fiscal_certificate_revoke", {
    p_certificate_id: body.certificate_id,
    p_reason: (body.reason ?? "").slice(0, 500),
  });
  if (rpcErr) return json({ error: rpcErr.message }, 400, headers);

  // Remove material criptografado
  if (mat?.object_path) {
    await admin.storage.from("fiscal-certificates").remove([mat.object_path]);
    await admin.from("fiscal_certificate_material").delete().eq("certificate_id", body.certificate_id);
  }

  return json({ revoked: true }, 200, headers);
});
