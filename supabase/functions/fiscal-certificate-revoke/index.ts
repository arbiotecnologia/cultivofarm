/**
 * Fase Fiscal 3.16.2-A — Edge Function `fiscal-certificate-revoke`.
 *
 * Admin-only. Idempotente: se qualquer parte falhar (remoção física do
 * objeto no bucket ou apagamento do material), a função NÃO reporta
 * sucesso. O metadado lógico permanece marcado como revogado e a
 * trilha de auditoria continua íntegra.
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import { isCanonicalSupabaseUrl } from "../_shared/fiscal/canonicalProject.ts";
import { fiscalCorsHeaders } from "../_shared/fiscal/corsAllowlist.ts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function corsHeaders(origin: string | null): { headers: Record<string, string>; allowed: boolean } {
  // H7e: helper canônico (união default ∪ ambiente, origem normalizada, sem wildcard).
  const c = fiscalCorsHeaders(origin, "POST, OPTIONS");
  return { allowed: c.allowed, headers: c.headers };
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

  if (req.method === "OPTIONS") {
    if (!cors.allowed) return new Response("cors_denied", { status: 403, headers });
    return new Response("ok", { headers });
  }
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
  if (!isCanonicalSupabaseUrl(supabaseUrl)) return json({ error: "canonical_project_required" }, 503, headers);
  const authed = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const token = authHeader.replace("Bearer ", "");
  const claims = await authed.auth.getClaims(token);
  const userId = claims.data?.claims?.sub;
  if (!userId) return json({ error: "unauthorized" }, 401, headers);

  const { data: isAdmin } = await authed.rpc("has_role", {
    _user_id: userId, _role: "administrador",
  });
  if (!isAdmin) return json({ error: "permission_denied" }, 403, headers);

  let body: { certificate_id?: string; reason?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_body" }, 400, headers);
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "invalid_body" }, 400, headers);
  const certId = String(body.certificate_id ?? "");
  if (!UUID_RE.test(certId)) return json({ error: "certificate_id_invalid" }, 400, headers);

  // Valida existência antes de qualquer trabalho.
  const cert = await authed.from("fiscal_certificates")
    .select("id, company_settings_id").eq("id", certId).maybeSingle();
  if (cert.error || !cert.data) return json({ error: "certificate_not_found" }, 404, headers);

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const companyAllowed = await admin.rpc("h15_service_actor_company_access", {
    p_actor: userId,
    p_company: cert.data.company_settings_id,
  });
  if (companyAllowed.error || companyAllowed.data !== true) {
    return json({ error: "permission_denied" }, 403, headers);
  }
  const { data: mat, error: materialError } = await admin.from("fiscal_certificate_material")
    .select("object_path").eq("certificate_id", certId).maybeSingle();

  if (materialError) return json({ error: "material_read_failed" }, 503, headers);

  // Revoga logicamente via RPC autenticada.
  const { error: rpcErr } = await authed.rpc("rpc_fiscal_certificate_revoke", {
    p_certificate_id: certId,
    p_reason: String(body.reason ?? "").slice(0, 500),
  });
  if (rpcErr) return json({ error: "revoke_failed" }, 400, headers);

  // Remove material físico. Se falhar em qualquer etapa, NÃO reporta sucesso.
  const cleanupErrors: string[] = [];
  if (mat?.object_path) {
    const rm = await admin.storage.from("fiscal-certificates").remove([mat.object_path]);
    if (rm.error) cleanupErrors.push("storage_remove_failed");
    if (!rm.error) {
      const del = await admin.from("fiscal_certificate_material").delete().eq("certificate_id", certId);
      if (del.error) cleanupErrors.push("material_delete_failed");
    }
  }

  if (cleanupErrors.length > 0) {
    return json({
      revoked: true,
      cleanup_incomplete: true,
      warnings: cleanupErrors,
    }, 502, headers);
  }

  return json({ revoked: true }, 200, headers);
});
