// Edge Function: process-communication-outbox (Fase 2)
// - POST-only
// - Autenticação: INTERNAL_FUNCTION_SECRET OU service_role JWT
// - Se COMMUNICATION_DELIVERY_ENABLED != "true" → dry_run puro (sem claim)
// - Integração com adapters reais (todos OFF por default via flags)
// - Cada claim termina em: sent | skipped | cancelled | retry | dead_letter
// - Preserva lease/worker_id em skip/cancel/fail via RPCs da Fase 1/2

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
  payload_snapshot: { payload?: Record<string, unknown> };
  recipient_user_id: string | null;
  recipient_cliente_id: string | null;
};

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
      ok: true,
      dry_run: true,
      disabled: true,
      claimed: 0,
      worker_id: WORKER_ID,
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
    let rendered: { assunto?: string; corpo: string; missing: string[] };
    try {
      rendered = renderTemplate(
        {
          canal: item.template_snapshot.canal,
          assunto: item.template_snapshot.assunto ?? null,
          corpo: item.template_snapshot.corpo,
          variaveisPermitidas: item.template_snapshot.variaveis ?? [],
        },
        { variaveis: (item.payload_snapshot?.payload ?? {}) as Record<string, unknown> },
      );
    } catch (e) {
      const code = e instanceof TemplateRenderError ? `render:${e.code}` : "render_error";
      await terminate(supabase, item.id, {
        outcome: "permanent_error",
        code: code.slice(0, 80),
        message: String((e as Error).message).slice(0, 2000),
      });
      results.push({ id: item.id, canal: item.canal, outcome: "permanent_error", code });
      continue;
    }

    // 1) Resolve endereço no momento do envio (service_role-only RPC).
    const { data: resolvedRaw, error: resErr } = await supabase.rpc(
      "rpc_resolve_outbox_address",
      { p_outbox_id: item.id },
    );
    if (resErr) {
      await failItem(supabase, item.id, false, "resolve_error", resErr.message);
      results.push({ id: item.id, canal: item.canal, outcome: "transient_error", code: "resolve_error" });
      continue;
    }
    const resolved = (resolvedRaw ?? { ok: false, canal: item.canal }) as ResolvedAddress;

    if (!resolved.ok) {
      const outcome = resolved.outcome ?? "skipped";
      const rpcName = outcome === "cancelled"
        ? "rpc_cancel_communication_delivery"
        : "rpc_skip_communication_delivery";
      await supabase.rpc(rpcName, {
        p_outbox_id: item.id,
        p_worker_id: WORKER_ID,
        p_reason: (resolved.reason ?? "resolve_failed").slice(0, 200),
      });
      results.push({ id: item.id, canal: item.canal, outcome, code: resolved.reason ?? "resolve_failed" });
      continue;
    }

    // 2) Dispatch adapter por canal.
    let adapter: AdapterResult;
    const variaveis = (item.payload_snapshot?.payload ?? {}) as Record<string, unknown>;

    if (item.canal === "email") {
      adapter = await sendEmail(env, resolved, item.template_snapshot, rendered);
    } else if (item.canal === "whatsapp") {
      adapter = await sendWhatsapp(env, resolved, item.template_snapshot, rendered, variaveis);
    } else if (item.canal === "in_app") {
      adapter = await sendInApp(env, resolved, rendered, supabase);
    } else {
      adapter = { outcome: "provider_not_configured", code: "unsupported_canal", message: item.canal };
    }

    // 3) Terminação normalizada.
    await terminate(supabase, item.id, adapter);
    results.push({
      id: item.id,
      canal: item.canal,
      outcome: adapter.outcome,
      code: adapter.code,
      // Nunca inclua adapter.message aqui (evita PII acidental). Log restrito
      // à RPC de falha/skip/cancel (que já trunca a 2000 chars no banco).
    });
  }

  return json(200, {
    ok: true,
    dry_run: false,
    worker_id: WORKER_ID,
    claimed: items.length,
    processed: results.length,
    results,
    adapters: {
      email: env.EMAIL_ENABLED ? "enabled" : "disabled",
      whatsapp: env.WHATSAPP_ENABLED ? "enabled" : "disabled",
      in_app: env.INAPP_ENABLED ? "enabled" : "disabled",
    },
  });
});

async function terminate(
  supabase: ReturnType<typeof serviceClient>,
  outboxId: string,
  adapter: AdapterResult,
): Promise<void> {
  switch (adapter.outcome) {
    case "sent":
      await supabase.rpc("rpc_complete_communication_delivery", {
        p_outbox_id: outboxId,
        p_worker_id: WORKER_ID,
        p_provider_message_id: adapter.provider_message_id ?? null,
      });
      return;
    case "opt_out":
      await supabase.rpc("rpc_skip_communication_delivery", {
        p_outbox_id: outboxId,
        p_worker_id: WORKER_ID,
        p_reason: adapter.code,
      });
      return;
    case "provider_not_configured":
    case "invalid_recipient":
      await supabase.rpc("rpc_cancel_communication_delivery", {
        p_outbox_id: outboxId,
        p_worker_id: WORKER_ID,
        p_reason: adapter.code,
      });
      return;
    case "permanent_error":
      await failItem(supabase, outboxId, true, adapter.code, adapter.message);
      return;
    case "transient_error":
      await failItem(supabase, outboxId, false, adapter.code, adapter.message);
      return;
  }
}

async function failItem(
  supabase: ReturnType<typeof serviceClient>,
  outboxId: string,
  permanent: boolean,
  code: string,
  message: string,
) {
  // rpc_fail_communication_delivery (Fase 1): assinatura documentada com
  // p_is_permanent para escalar imediatamente para dead_letter.
  await supabase.rpc("rpc_fail_communication_delivery", {
    p_outbox_id: outboxId,
    p_worker_id: WORKER_ID,
    p_error_code: code.slice(0, 80),
    p_error_message: (message ?? "").slice(0, 2000),
    p_is_permanent: permanent,
  });
}

export { corsHeaders };
