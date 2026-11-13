/**
 * Solicitação de envio de NFS-e pelo provedor configurado da própria empresa.
 * Fail-closed: sem provedor/credencial/habilitação → integration_not_configured.
 * Com configuração, a transmissão permanece bloqueada (transport_not_certified)
 * até homologação com credencial real; nunca grava autorização simulada.
 * Usa somente a chave publicável + JWT do usuário (RLS/RPC preservadas); sem writes.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { fiscalCorsHeaders } from "../_shared/fiscal/corsAllowlist.ts";
import { isCanonicalSupabaseUrl } from "../_shared/fiscal/canonicalProject.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  const cors = fiscalCorsHeaders(req.headers.get("Origin"));
  const headers = { ...cors.headers, "Content-Type": "application/json" };
  const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers });
  if (req.method === "OPTIONS") return cors.allowed ? new Response("ok", { headers: cors.headers }) : reply(403, { code: "origin_forbidden" });
  if (!cors.allowed) return reply(403, { code: "origin_forbidden" });
  if (req.method !== "POST") return reply(405, { code: "method_not_allowed" });

  const url = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  if (!isCanonicalSupabaseUrl(url) || !anon) return reply(503, { code: "environment_not_canonical" });
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return reply(401, { code: "unauthenticated" });

  let body: { invoice_id?: unknown };
  try { body = await req.json(); } catch { return reply(400, { code: "invalid_body" }); }
  if (typeof body.invoice_id !== "string" || !UUID.test(body.invoice_id)) return reply(400, { code: "invoice_id_invalid" });

  const db = createClient(url!, anon, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
  const { data: claims, error: authErr } = await db.auth.getClaims(auth.slice(7));
  if (authErr || !claims?.claims?.sub) return reply(401, { code: "unauthenticated" });

  const { data: inv, error: invErr } = await db.from("fiscal_invoices").select("id, invoice_type, normalized_status").eq("id", body.invoice_id).maybeSingle();
  if (invErr || !inv) return reply(404, { code: "invoice_not_found" });
  if (inv.invoice_type !== "NFSE") return reply(422, { code: "invoice_not_nfse" });
  if (inv.normalized_status !== "DRAFT") return reply(409, { code: "invoice_not_draft" });

  const { data: readiness, error: rErr } = await db.rpc("rpc_service_nfse_readiness_v1");
  if (rErr) return reply(rErr.code === "42501" ? 403 : 500, { code: rErr.code === "42501" ? "forbidden" : "readiness_unavailable" });
  if (!readiness?.ready) return reply(409, { code: "integration_not_configured", missing: readiness?.missing ?? [] });
  if (readiness.provider !== "NFSE_NACIONAL") return reply(409, { code: "provider_not_supported", message: "Provedor configurado ainda não tem integração." });
  return reply(409, { code: "transport_not_certified", message: "Transmissão NFS-e Nacional aguarda homologação com credencial real; a nota permanece em rascunho." });
});
