// Edge Function: test-communication-email
// Teste SMTP controlado usando configuração server-side e o adapter compartilhado.
// Restrito a administradores e bloqueado antes do socket quando o preflight falha.

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeadersFor, handlePreflight, isTrustedOrigin } from "../_shared/comunicacao/cors.ts";
import { readWorkerEnv } from "../_shared/comunicacao/adapters.ts";
import { loadRuntimeConfig } from "../_shared/comunicacao/runtime-config.ts";
import { sendEmail } from "../_shared/comunicacao/email-adapter.ts";
import {
  evaluateControlledSmtpTest,
  sanitizeSmtpTestResult,
} from "../_shared/comunicacao/controlled-smtp-test.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

function json(origin: string | null, status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeadersFor(origin), "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  const origin = req.headers.get("Origin");
  if (req.method === "OPTIONS") return handlePreflight(req);
  if (origin && !isTrustedOrigin(origin)) return json(origin, 403, { ok: false, error: "origin_not_allowed" });
  if (req.method !== "POST") return json(origin, 405, { ok: false, error: "method_not_allowed" });
  if (!SUPABASE_URL || !SERVICE_KEY) return json(origin, 500, { ok: false, error: "not_configured" });

  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return json(origin, 401, { ok: false, error: "unauthorized" });
  const token = auth.slice(7).trim();

  const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: uErr } = await sb.auth.getUser(token);
  if (uErr || !userData?.user) return json(origin, 401, { ok: false, error: "invalid_token" });
  const uid = userData.user.id;
  const { data: roles } = await sb.from("user_roles").select("role").eq("user_id", uid);
  const isAdmin = (roles ?? []).some((r: { role: string }) => r.role === "administrador");
  if (!isAdmin) return json(origin, 403, { ok: false, error: "forbidden" });

  const { data: rateAllowed, error: rateError } = await sb.rpc("rpc_service_check_rate_limit", {
    p_user: uid,
    p_action: "test_smtp",
    p_max: 3,
    p_window_seconds: 300,
  });
  if (rateError || rateAllowed !== true) return json(origin, 429, { ok: false, error: "rate_limited" });

  let body: { to?: string; subject?: string; message?: string } = {};
  try { body = await req.json(); } catch { return json(origin, 400, { ok: false, error: "invalid_json" }); }
  const to = String(body.to ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    return json(origin, 400, { ok: false, error: "invalid_recipient" });
  }
  const env = await loadRuntimeConfig(sb, readWorkerEnv);
  const gate = evaluateControlledSmtpTest(env, to);
  if (!gate.allowed) return json(origin, 403, { ok: false, error: gate.code });

  const subject = String(body.subject ?? "Teste SMTP Cultivo Farm").slice(0, 200);
  const message = String(body.message ?? "Teste controlado da configuração SMTP.").slice(0, 4000);
  const result = await sendEmail(
    env,
    { ok: true, canal: "email", address: gate.recipient },
    { canal: "email", assunto: subject, corpo: message, variaveis: [] },
    { assunto: subject, corpo: message },
  );
  const code = sanitizeSmtpTestResult(result);
  if (result.outcome === "sent") return json(origin, 200, { ok: true, code });
  return json(origin, 502, { ok: false, error: code });
});
