// Edge Function: process-communication-outbox (Fase 2 v2 corretiva)
// - POST-only
// - Autenticação: INTERNAL_FUNCTION_SECRET OU service_role JWT
// - Se COMMUNICATION_DELIVERY_ENABLED != "true" → dry_run puro (sem claim)
// - payload_snapshot é o objeto de variáveis DIRETAMENTE (não .payload)
// - Canal desabilitado / config inválida → DEFER (não cancel)
// - Falha permanente vs transitória usa rpc_fail_communication_delivery_v2
// - Erros de TODAS as RPCs de terminação são verificados e logados sem PII

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
import {
  readWorkerEnv,
  type AdapterResult,
  type AdapterSnapshot,
  type ResolvedAddress,
} from "../_shared/comunicacao/adapters.ts";
import { sendEmail } from "../_shared/comunicacao/email-adapter.ts";
import { sendWhatsapp } from "../_shared/comunicacao/whatsapp-adapter.ts";
import { sendInApp } from "../_shared/comunicacao/inapp-adapter.ts";

const INTERNAL_SECRET = Deno.env.get("INTERNAL_FUNCTION_SECRET") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const WORKER_ID = `worker-${Deno.env.get("DENO_DEPLOYMENT_ID") ?? "local"}-${crypto.randomUUID().slice(0, 8)}`;
const BATCH_SIZE = 10;
const LEASE_SECONDS = 90;

type ClaimRow = {
  id: string;
  canal: ComunicacaoCanal;
  template_snapshot: AdapterSnapshot;
  // Objeto de variáveis DIRETAMENTE (formato salvo pela expansão do evento).
  payload_snapshot: Record<string, unknown>;
  recipient_user_id: string | null;
  recipient_cliente_id: string | null;
};

type SbClient = ReturnType<typeof serviceClient>;

function authorize(req: Request): { ok: true } | { ok: false; res: Response } {
  const auth = req.headers.get("Authorization") ?? "";
  const secret = req.headers.get("x-internal-secret") ?? "";
  if (INTERNAL_SECRET.length > 0 && secret.length > 0 && secret === INTERNAL_SECRET) {
    return { ok: true };
  }
  if (auth.startsWith("Bearer ") && SERVICE_KEY.length > 0) {
    const token = auth.slice("Bearer ".length).trim();
    if (token === SERVICE_KEY) return { ok: true };
  }
  return { ok: false, res: json(401, { ok: false, error: "unauthorized" }) };
}

Deno.serve(async (req: Request) => {
  const pre = requirePost(req);
  if (pre) return pre;
  const authz = authorize(req);
  if (!authz.ok) return authz.res;

  const env = readWorkerEnv();
  if (!env.DELIVERY_ENABLED) {
    return json(200, {
      ok: true, dry_run: true, disabled: true,
      claimed: 0, worker_id: WORKER_ID,
    });
  }

  const supabase = serviceClient();

  const { data: claimed, error: claimErr } = await supabase.rpc(
    "rpc_claim_communication_outbox",
    { p_batch_size: BATCH_SIZE, p_worker_id: WORKER_ID, p_lease_seconds: LEASE_SECONDS },
  );
  if (claimErr) {
    return json(500, { ok: false, error: "claim_failed", detail: claimErr.message });
  }
  const items = (claimed ?? []) as ClaimRow[];
  const results: Array<Record<string, unknown>> = [];

  for (const item of items) {
    // payload_snapshot é o objeto de variáveis diretamente.
    const variaveis = (item.payload_snapshot ?? {}) as Record<string, unknown>;

    // 1) Render seguro (nunca chama rede).
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
        outcome: "permanent_error",
        code: code.slice(0, 80),
        message: String((e as Error).message).slice(0, 2000),
      }, results, item.canal);
      continue;
    }

    // 2) Resolve endereço no momento do envio.
    const { data: resolvedRaw, error: resErr } = await supabase.rpc(
      "rpc_resolve_outbox_address",
      { p_outbox_id: item.id },
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

    // 3) Dispatch adapter por canal.
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

  // Se qualquer RPC de terminação falhou, respondemos ok:false + HTTP 500 sem
  // vazar mensagens brutas nem PII. Itens cujo terminate falhou permanecem
  // como 'processing' até expirar o lease e serem reclaim-ados — entrega é
  // at-least-once para email/whatsapp e idempotente para in_app.
  const termination_failures = results.filter(
    (r) => (r as Record<string, unknown>).terminator === "terminalization_failed",
  ).length;

  return json(termination_failures > 0 ? 500 : 200, {
    ok: termination_failures === 0,
    dry_run: false,
    worker_id: WORKER_ID,
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

// Allowlist explícita de nomes de RPC terminais — evita expor nomes arbitrários.
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
  // Nunca ecoamos adapter.message no results (evita PII acidental).
  const push = (extra: Record<string, unknown> = {}) =>
    results.push({ id: outboxId, canal, outcome: adapter.outcome, code: adapter.code, ...extra });

  let rpcName: string;
  let rpcArgs: Record<string, unknown>;

  switch (adapter.outcome) {
    case "sent":
      rpcName = "rpc_complete_communication_delivery";
      rpcArgs = {
        p_outbox_id: outboxId,
        p_worker_id: WORKER_ID,
        p_provider_message_id: adapter.provider_message_id ?? null,
      };
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
      rpcArgs = {
        p_outbox_id: outboxId, p_worker_id: WORKER_ID,
        p_reason: adapter.code, p_delay_seconds: 600,
      };
      break;
    case "permanent_error":
      rpcName = "rpc_fail_communication_delivery_v2";
      rpcArgs = {
        p_outbox_id: outboxId, p_worker_id: WORKER_ID,
        p_error_code: adapter.code.slice(0, 80),
        p_error_message: (adapter.message ?? "").slice(0, 2000),
        p_is_permanent: true,
      };
      break;
    case "transient_error":
      rpcName = "rpc_fail_communication_delivery_v2";
      rpcArgs = {
        p_outbox_id: outboxId, p_worker_id: WORKER_ID,
        p_error_code: adapter.code.slice(0, 80),
        p_error_message: (adapter.message ?? "").slice(0, 2000),
        p_is_permanent: false,
      };
      break;
  }

  const safeName = TERMINAL_RPC_ALLOWLIST.has(rpcName) ? rpcName : "unknown_terminal_rpc";

  const { error } = await supabase.rpc(rpcName, rpcArgs);
  if (error) {
    // Falha da RPC de terminação: reporta código genérico + nome allowlisted da RPC.
    // NÃO inclui error.message bruto (pode conter PII/segredos do provedor).
    push({ terminator: "terminalization_failed", terminator_rpc: safeName });
    return;
  }
  push({ terminator: "ok", terminator_rpc: safeName });
}


export { corsHeaders };
