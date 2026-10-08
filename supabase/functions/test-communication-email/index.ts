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
import type { WorkerEnv } from "../_shared/comunicacao/adapters-types.ts";
import { buildSmtpReadiness } from "../_shared/comunicacao/smtp-readiness.ts";
import { z } from "npm:zod@3.25.76";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

function json(origin: string | null, status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeadersFor(origin), "Content-Type": "application/json" },
  });
}

type DiagnosticMode = "connection" | "send";
type SmtpProviderRoute = "current" | "kinghost_smtpi";

const DiagnosticBodySchema = z.object({
  mode: z.enum(["connection", "send"]).default("send"),
  candidate_provider_route: z.enum(["current", "kinghost_smtpi"]).optional(),
  confirm_controlled_send: z.literal(true).optional(),
  to: z.string().trim().email().max(254).optional(),
}).strict();

function buildSmtpCandidateRuntime(
  env: WorkerEnv,
  route: SmtpProviderRoute,
): { ok: true; env: WorkerEnv } | { ok: false; code: "candidate_not_applicable" } {
  if (route === "current") return { ok: true, env: { ...env } };
  if (Number(env.SMTP_PORT) !== 465) return { ok: false, code: "candidate_not_applicable" };
  const host = (env.SMTP_HOST ?? "").trim().toLowerCase().replace(/\.$/, "");
  const candidateHost = host === "smtp.kinghost.net"
    ? "smtpi.kinghost.net"
    : host === "smtp.uni5.net" ? "smtpi.uni5.net" : null;
  return candidateHost
    ? { ok: true, env: { ...env, SMTP_HOST: candidateHost } }
    : { ok: false, code: "candidate_not_applicable" };
}

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
  // NOTIF-3: diagnostics must not fetch credentials/open sockets/send mail.
  const diagnosticContractAvailable = false;
  if (!diagnosticContractAvailable) return json(origin, 503, { ok: false, error: "NOTIF3_GLOBAL_CONTRACT_UNAVAILABLE" });
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

  let rawBody: unknown;
  try { rawBody = await req.json(); } catch { return json(origin, 400, { ok: false, error: "invalid_json" }); }
  const parsedBody = DiagnosticBodySchema.safeParse(rawBody);
  if (!parsedBody.success) return json(origin, 400, { ok: false, error: "invalid_payload" });
  const body = parsedBody.data;
  const mode: DiagnosticMode = body.mode;
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

  if (body.confirm_controlled_send !== true) {
    await auditDiagnostic(sb, uid, "smtp_send_test", "blocked", "smtp_not_ready", "preflight", null);
    return json(origin, 400, { ok: false, error: "controlled_test_confirmation_required" });
  }
  const controlledRecipient = "teste@refilinformatica.com.br";
  if (body.to !== undefined && body.to.trim().toLowerCase() !== controlledRecipient) {
    await auditDiagnostic(sb, uid, "smtp_send_test", "blocked", "smtp_not_ready", "preflight", null);
    return json(origin, 400, { ok: false, error: "recipient_not_allowed" });
  }
  const { data: settings, error: settingsError } = await sb
    .from("communication_provider_settings")
    .select("id,updated_at,smtp_host,smtp_port,smtp_user,smtp_from,secret_smtp_password,delivery_enabled,email_delivery_enabled,test_mode_enabled,allowed_emails")
    .eq("id", 1)
    .maybeSingle();
  const { data: latestPass, error: passError } = await sb
    .from("communication_provider_settings_audit")
    .select("action,outcome,safe_code,stage,created_at")
    .in("action", ["smtp_connection_test", "smtp_connection_candidate_test"])
    .eq("outcome", "success")
    .eq("safe_code", "smtp_connection_ok")
    .eq("stage", "quit")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { data: latestAmbiguousSend, error: sendAuditError } = await sb
    .from("communication_provider_settings_audit")
    .select("outcome,created_at")
    .eq("action", "smtp_send_test")
    .eq("outcome", "ambiguous")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (settingsError || passError || sendAuditError || !settings) {
    await auditDiagnostic(sb, uid, "smtp_send_test", "blocked", "smtp_not_ready", "preflight", null);
    return json(origin, 503, { ok: false, error: "smtp_not_ready" });
  }
  const readiness = buildSmtpReadiness(settings, latestPass);
  if (latestAmbiguousSend?.outcome === "ambiguous") {
    await auditDiagnostic(sb, uid, "smtp_send_test", "blocked", "smtp_not_ready", "preflight", null);
    return json(origin, 409, { ok: false, error: "controlled_test_retry_blocked_ambiguous" });
  }
  const gate = evaluateControlledSmtpTest(env, controlledRecipient, readiness.controlled_test_send_ready);
  if (!gate.allowed) {
    const code = gate.code;
    const auditCode = code === "smtp_port_blocked_by_edge_runtime" ? code : "smtp_not_ready";
    await auditDiagnostic(sb, uid, "smtp_send_test", "blocked", auditCode, "preflight", null);
    return json(origin, 403, { ok: false, error: code });
  }

  const subject = "Teste controlado SMTP — Cultivo Farm";
  const message = "Mensagem de diagnóstico controlado. O aceite pelo servidor SMTP não comprova a entrega na caixa postal.";
  const diagnosticEnv = { ...env, DELIVERY_ENABLED: true, EMAIL_ENABLED: true };
  const result = await sendEmail(
    diagnosticEnv,
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
  return json(origin, result.certainty === "ambiguous" ? 409 : 502, {
    ok: false,
    error: responseCode,
    ambiguous: result.certainty === "ambiguous",
    stage: result.stage ?? "send",
  });
});
