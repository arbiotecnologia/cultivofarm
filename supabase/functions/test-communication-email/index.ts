// Edge Function: test-communication-email
// Teste SMTP controlado usando configuração server-side e o adapter compartilhado.
// Restrito ao Superadmin de Plataforma e bloqueado antes do socket quando o preflight falha.

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeadersFor, handlePreflight, isTrustedOrigin } from "../_shared/comunicacao/cors.ts";
import { readWorkerEnv } from "../_shared/comunicacao/adapters.ts";
import { loadRuntimeConfig } from "../_shared/comunicacao/runtime-config.ts";
import { sendEmail } from "../_shared/comunicacao/email-adapter.ts";
import {
  evaluateControlledSmtpTest,
  sanitizeSmtpTestResult,
} from "../_shared/comunicacao/controlled-smtp-test.ts";
import { getSmtpConfigError } from "../_shared/comunicacao/adapters-types.ts";
import { probeSmtpProviderInDeno } from "../_shared/comunicacao/smtp-provider-probe-deno.ts";
import {
  buildSmtpCandidateRuntime,
  type SmtpProviderRoute,
} from "../_shared/comunicacao/smtp-candidate-route.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

function json(origin: string | null, status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeadersFor(origin), "Content-Type": "application/json" },
  });
}

type DiagnosticMode = "connection" | "send";

async function auditDiagnostic(
  sb: ReturnType<typeof createClient<any>>,
  actor: string,
  action: "smtp_connection_test" | "smtp_connection_candidate_test" | "smtp_send_test",
  outcome: "success" | "failure" | "ambiguous" | "blocked",
  safeCode: string,
  stage: string,
  latencyMs: number | null,
) {
  await sb.rpc("rpc_service_record_smtp_diagnostic", {
    p_actor: actor,
    p_action: action,
    p_outcome: outcome,
    p_safe_code: safeCode,
    p_stage: stage,
    p_latency_ms: latencyMs,
  });
}

function actorRef(userId: string): string {
  return userId.length >= 8 ? `${userId.slice(0, 4)}…${userId.slice(-4)}` : "masked";
}

function safeLog(event: string, actor: string, code: string, stage: string, latencyMs: number | null) {
  console.info(JSON.stringify({ event, actor_id: actorRef(actor), safe_code: code, stage, latency_ms: latencyMs }));
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
  const { data: isSuperadmin, error: authorizationError } = await sb.rpc("is_platform_superadmin", {
    _user_id: uid,
  });
  if (authorizationError) return json(origin, 500, { ok: false, error: "authorization_check_failed" });
  if (isSuperadmin !== true) return json(origin, 403, { ok: false, error: "forbidden" });

  let body: { mode?: DiagnosticMode; candidate_provider_route?: unknown; to?: string; subject?: string; message?: string } = {};
  try { body = await req.json(); } catch { return json(origin, 400, { ok: false, error: "invalid_json" }); }
  const mode: DiagnosticMode = body.mode ?? "send";
  if (mode !== "connection" && mode !== "send") return json(origin, 400, { ok: false, error: "invalid_mode" });
  const requestedRoute = body.candidate_provider_route ?? "current";
  if (requestedRoute !== "current" && requestedRoute !== "kinghost_smtpi") {
    return json(origin, 400, { ok: false, error: "candidate_not_applicable" });
  }
  if (mode !== "connection" && requestedRoute !== "current") {
    return json(origin, 400, { ok: false, error: "candidate_not_applicable" });
  }
  const route = requestedRoute as SmtpProviderRoute;

  const baseRateAction = mode === "connection" ? "test_smtp_connection" : "test_smtp";
  const rateAction = route === "kinghost_smtpi" ? "test_smtp_connection_candidate" : baseRateAction;
  const { data: rateAllowed, error: rateError } = await sb.rpc("rpc_service_check_rate_limit", {
    p_user: uid,
    p_action: rateAction,
    p_max: mode === "connection" ? 5 : 3,
    p_window_seconds: 300,
  });
  if (rateError || rateAllowed !== true) return json(origin, 429, { ok: false, error: "rate_limited" });

  const env = await loadRuntimeConfig(sb, readWorkerEnv);
  if (mode === "connection") {
    const candidate = buildSmtpCandidateRuntime(env, route);
    const auditAction = route === "kinghost_smtpi" ? "smtp_connection_candidate_test" : "smtp_connection_test";
    if (!candidate.ok) {
      await auditDiagnostic(sb, uid, auditAction, "blocked", candidate.code, "connect", 0);
      safeLog(auditAction, uid, candidate.code, "connect", 0);
      return json(origin, 400, {
        ok: false, code: candidate.code, stage: "connect", tls: false,
        authenticated: false, latency_ms: 0, route,
      });
    }
    const configError = getSmtpConfigError(candidate.env);
    if (configError) {
      const code = configError === "email_config_invalid" ? "smtp_config_invalid" : configError;
      await auditDiagnostic(sb, uid, auditAction, "blocked", code, "connect", 0);
      safeLog(auditAction, uid, code, "connect", 0);
      return json(origin, 400, { ok: false, code, stage: "connect", tls: false, authenticated: false, latency_ms: 0, route });
    }
    const result = await probeSmtpProviderInDeno(candidate.env);
    await auditDiagnostic(sb, uid, auditAction, result.ok ? "success" : "failure", result.code, result.stage, result.latency_ms);
    safeLog(auditAction, uid, result.code, result.stage, result.latency_ms);
    return json(origin, result.ok ? 200 : 502, { ...result, route });
  }

  const to = String(body.to ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    return json(origin, 400, { ok: false, error: "invalid_recipient" });
  }
  const gate = evaluateControlledSmtpTest(env, to);
  if (!gate.allowed) {
    const code = gate.code;
    const auditCode = code === "smtp_port_blocked_by_edge_runtime" ? code : "smtp_not_ready";
    await auditDiagnostic(sb, uid, "smtp_send_test", "blocked", auditCode, "preflight", null);
    return json(origin, 403, { ok: false, error: code });
  }

  const subject = String(body.subject ?? "Teste SMTP Cultivo Farm").slice(0, 200);
  const message = String(body.message ?? "Teste controlado da configuração SMTP.").slice(0, 4000);
  const result = await sendEmail(
    env,
    { ok: true, canal: "email", address: gate.recipient },
    { canal: "email", assunto: subject, corpo: message, variaveis: [] },
    { assunto: subject, corpo: message },
  );
  const code = sanitizeSmtpTestResult(result);
  const responseCode = result.outcome === "sent" ? "smtp_send_accepted" : code;
  const outcome = result.outcome === "sent" ? "success" : result.certainty === "ambiguous" ? "ambiguous" : "failure";
  const auditCode = result.outcome === "sent" ? "smtp_send_accepted" : result.certainty === "ambiguous" ? "smtp_send_ambiguous" : "smtp_send_failed";
  const auditStage = ["connect", "send", "response", "preflight", "config"].includes(result.stage ?? "") ? result.stage ?? "send" : "send";
  await auditDiagnostic(sb, uid, "smtp_send_test", outcome, auditCode, auditStage, null);
  safeLog("smtp_send_test", uid, responseCode, result.stage ?? "send", null);
  if (result.outcome === "sent") return json(origin, 200, { ok: true, code: responseCode, accepted: true });
  return json(origin, 502, { ok: false, error: responseCode, ambiguous: result.certainty === "ambiguous", stage: result.stage ?? "send" });
});
