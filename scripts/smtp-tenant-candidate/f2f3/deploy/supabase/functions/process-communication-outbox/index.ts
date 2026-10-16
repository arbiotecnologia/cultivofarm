// Edge Function: process-communication-outbox (runtime DB wiring)
// - POST-only. Autorização: INTERNAL_FUNCTION_SECRET OU service_role JWT.
// - Configuração runtime é carregada da DB (rpc_service_load_provider_runtime_config).
//   Se ausente, cai para env; se erro, fail-closed (não envia nada).
// - Segredos ficam somente em memória da invocação; nunca logados.

import {
  corsHeaders,
  json,
  requirePost,
  serviceClient,
} from "../_shared/auth-guard.ts";
import {
  renderTemplate,
  TemplateRenderError,
  type ComunicacaoCanal,
} from "../_shared/communication-render.ts";
import type {
  AdapterResult,
  AdapterSnapshot,
  ResolvedAddress,
} from "../_shared/comunicacao/adapters.ts";
import { readWorkerEnv } from "../_shared/comunicacao/adapters.ts";
import { loadRuntimeConfig } from "../_shared/comunicacao/runtime-config.ts";
import { sendEmail } from "../_shared/comunicacao/email-adapter.ts";
import { sendWhatsapp } from "../_shared/comunicacao/whatsapp-adapter.ts";
import { sendInApp } from "../_shared/comunicacao/inapp-adapter.ts";
import { runTenantLane } from "./tenant-lane/lane.ts";
import { authorizeLaneInvoker, isTenantLaneRequest } from "./tenant-lane/invoker-auth.ts";
import { tenantSmtpDeps, TENANT_PINNING_PROVEN } from "../tenant-email-settings/f2f3/deno-runtime.ts";

// F4b tenant SMTP lane: reviewed flag starts FALSE. Independent of the global NOTIF3 containment below,
// which stays exactly as is (global DELIVERY_ENABLED/WhatsApp/in_app untouched). The lane only processes
// jobs created by the server contract (platform_private.tenant_smtp_dispatch_jobs); credentials only via
// the executor claim; no global fallback; no retry of a job after IO.
export const TENANT_SMTP_LANE_REVIEWED = false;

const INTERNAL_SECRET = Deno.env.get("INTERNAL_FUNCTION_SECRET") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
// Dedicated lane-only credential (never valid for the global route below).
const LANE_INVOKER_SECRET = Deno.env.get("TENANT_SMTP_LANE_INVOKER_SECRET") ?? "";

const WORKER_ID = `worker-${Deno.env.get("DENO_DEPLOYMENT_ID") ?? "local"}-${crypto.randomUUID().slice(0, 8)}`;
const BATCH_SIZE = 10;
const LEASE_SECONDS = 90;

type ClaimRow = {
  id: string;
  canal: ComunicacaoCanal;
  template_snapshot: AdapterSnapshot;
  payload_snapshot: Record<string, unknown>;
  recipient_user_id: string | null;
  recipient_cliente_id: string | null;
};

type SbClient = ReturnType<typeof serviceClient>;

function authorize(req: Request): { ok: true } | { ok: false; res: Response } {
  const auth = req.headers.get("Authorization") ?? "";
  const secret = req.headers.get("x-internal-secret") ?? "";
  if (INTERNAL_SECRET.length > 0 && secret.length > 0 && secret === INTERNAL_SECRET) return { ok: true };
  if (auth.startsWith("Bearer ") && SERVICE_KEY.length > 0) {
    const token = auth.slice("Bearer ".length).trim();
    if (token === SERVICE_KEY) return { ok: true };
  }
  return { ok: false, res: json(401, { ok: false, error: "unauthorized" }) };
}

Deno.serve(async (req: Request) => {
  const pre = requirePost(req);
  if (pre) return pre;
  // Tenant SMTP lane: ONLY the dedicated header/secret authorizes it; global credentials are not accepted here.
  if (isTenantLaneRequest(req)) {
    if (!authorizeLaneInvoker(req, LANE_INVOKER_SECRET)) return json(401, { ok: false, error: "unauthorized" });
    if (!TENANT_SMTP_LANE_REVIEWED || !TENANT_PINNING_PROVEN) return json(503, { ok: false, error: "TENANT_SMTP_LANE_UNAVAILABLE" });
    try {
      const summary = await runTenantLane(serviceClient(), WORKER_ID.replace(/[^A-Za-z0-9._-]/g, "").slice(0, 80), tenantSmtpDeps);
      return json(summary.stopped === "claim_error" || summary.stopped === "finish_error" ? 500 : 200, { ok: true, lane: "tenant_smtp", ...summary });
    } catch {
      return json(500, { ok: false, error: "TENANT_SMTP_LANE_INTERNAL" });
    }
  }

  // Global route: unchanged authentication (x-tenant-smtp-secret is ignored here).
  const authz = authorize(req);
  if (!authz.ok) return authz.res;
  if (new URL(req.url).searchParams.has("lane")) return json(400, { ok: false, error: "unknown_lane" });

  // NOTIF-3: internal credentials do not prove source/tenant/recipient.
  // No runtime secret load, claim, adapter or ledger effects while contained.
  const deliveryContractAvailable = false;
  if (!deliveryContractAvailable) return json(503, { ok: false, error: "NOTIF3_GLOBAL_CONTRACT_UNAVAILABLE" });

  const supabase = serviceClient();
  const env = await loadRuntimeConfig(supabase, readWorkerEnv);

  if (!env.DELIVERY_ENABLED) {
    return json(200, {
      ok: true, dry_run: true, disabled: true,
      claimed: 0, worker_id: WORKER_ID, source: env.source,
    });
  }

  const { data: claimed, error: claimErr } = await supabase.rpc(
    "rpc_claim_communication_outbox",
    { p_batch_size: BATCH_SIZE, p_worker_id: WORKER_ID, p_lease_seconds: LEASE_SECONDS },
  );
  if (claimErr) {
    console.warn("[worker] claim_failed", { name: (claimErr as { name?: string } | null)?.name ?? "unknown" });
    return json(500, { ok: false, error: "claim_failed" });
  }
  const items = (claimed ?? []) as ClaimRow[];
  const results: Array<Record<string, unknown>> = [];

  for (const item of items) {
    const variaveis = (item.payload_snapshot ?? {}) as Record<string, unknown>;
    let rendered: { assunto?: string; corpo: string; missing: string[] };
    try {
      rendered = renderTemplate(
        {
          canal: item.template_snapshot.canal,
          assunto: item.template_snapshot.assunto ?? null,
          corpo: item.template_snapshot.corpo,
          variaveisPermitidas: item.template_snapshot.variaveis ?? [],
        },
        { variaveis },
      );
    } catch (e) {
      const code = e instanceof TemplateRenderError ? `render:${e.code}` : "render_error";
      await terminate(supabase, item.id, {
        outcome: "permanent_error", code: code.slice(0, 80),
        message: String((e as Error).message).slice(0, 2000),
      }, results, item.canal);
      continue;
    }

    const { data: resolvedRaw, error: resErr } = await supabase.rpc(
      "rpc_resolve_outbox_address", { p_outbox_id: item.id },
    );
    if (resErr) {
      await terminate(supabase, item.id, {
        outcome: "transient_error", code: "resolve_error",
        message: resErr.message.slice(0, 300),
      }, results, item.canal);
      continue;
    }
    const resolved = (resolvedRaw ?? { ok: false, canal: item.canal }) as ResolvedAddress;

    if (!resolved.ok) {
      const outcome = resolved.outcome ?? "skipped";
      const reason = (resolved.reason ?? "resolve_failed").slice(0, 200);
      const term: AdapterResult = outcome === "cancelled"
        ? { outcome: "invalid_recipient", code: reason, message: reason }
        : { outcome: "opt_out", code: reason, message: reason };
      await terminate(supabase, item.id, term, results, item.canal);
      continue;
    }

    let adapter: AdapterResult;
    if (item.canal === "email") {
      adapter = await sendEmail(env, resolved, item.template_snapshot, rendered);
    } else if (item.canal === "whatsapp") {
      adapter = await sendWhatsapp(env, resolved, item.template_snapshot, rendered, variaveis);
    } else if (item.canal === "in_app") {
      adapter = await sendInApp(env, resolved, rendered, supabase, item.id);
    } else {
      adapter = { outcome: "permanent_error", code: "unsupported_canal", message: item.canal };
    }

    await terminate(supabase, item.id, adapter, results, item.canal);
  }

  const termination_failures = results.filter(
    (r) => (r as Record<string, unknown>).terminator === "terminalization_failed",
  ).length;

  return json(termination_failures > 0 ? 500 : 200, {
    ok: termination_failures === 0,
    dry_run: false,
    worker_id: WORKER_ID,
    source: env.source,
    claimed: items.length,
    processed: results.length,
    termination_failures,
    results,
    adapters: {
      email: env.EMAIL_ENABLED ? "enabled" : "disabled",
      whatsapp: env.WHATSAPP_ENABLED ? "enabled" : "disabled",
      in_app: env.INAPP_ENABLED ? "enabled" : "disabled",
    },
  });
});

const TERMINAL_RPC_ALLOWLIST = new Set<string>([
  "rpc_complete_communication_delivery",
  "rpc_skip_communication_delivery",
  "rpc_cancel_communication_delivery",
  "rpc_defer_communication_delivery",
  "rpc_fail_communication_delivery_v2",
]);

async function terminate(
  supabase: SbClient,
  outboxId: string,
  adapter: AdapterResult,
  results: Array<Record<string, unknown>>,
  canal: ComunicacaoCanal,
): Promise<void> {
  const push = (extra: Record<string, unknown> = {}) =>
    results.push({ id: outboxId, canal, outcome: adapter.outcome, code: adapter.code, ...extra });

  let rpcName: string;
  let rpcArgs: Record<string, unknown>;

  switch (adapter.outcome) {
    case "sent":
      rpcName = "rpc_complete_communication_delivery";
      rpcArgs = { p_outbox_id: outboxId, p_worker_id: WORKER_ID, p_provider_message_id: adapter.provider_message_id ?? null };
      break;
    case "opt_out":
      rpcName = "rpc_skip_communication_delivery";
      rpcArgs = { p_outbox_id: outboxId, p_worker_id: WORKER_ID, p_reason: adapter.code };
      break;
    case "invalid_recipient":
      rpcName = "rpc_cancel_communication_delivery";
      rpcArgs = { p_outbox_id: outboxId, p_worker_id: WORKER_ID, p_reason: adapter.code };
      break;
    case "provider_not_configured":
    case "deferred":
      rpcName = "rpc_defer_communication_delivery";
      rpcArgs = { p_outbox_id: outboxId, p_worker_id: WORKER_ID, p_reason: adapter.code, p_delay_seconds: 600 };
      break;
    case "permanent_error":
      rpcName = "rpc_fail_communication_delivery_v2";
      rpcArgs = { p_outbox_id: outboxId, p_worker_id: WORKER_ID, p_error_code: adapter.code.slice(0, 80), p_error_message: (adapter.message ?? "").slice(0, 2000), p_is_permanent: true };
      break;
    case "transient_error":
      rpcName = "rpc_fail_communication_delivery_v2";
      rpcArgs = { p_outbox_id: outboxId, p_worker_id: WORKER_ID, p_error_code: adapter.code.slice(0, 80), p_error_message: (adapter.message ?? "").slice(0, 2000), p_is_permanent: false };
      break;
  }

  const safeName = TERMINAL_RPC_ALLOWLIST.has(rpcName) ? rpcName : "unknown_terminal_rpc";
  const { error } = await supabase.rpc(rpcName, rpcArgs);
  if (error) { push({ terminator: "terminalization_failed", terminator_rpc: safeName }); return; }
  push({ terminator: "ok", terminator_rpc: safeName });
}

export { corsHeaders };
