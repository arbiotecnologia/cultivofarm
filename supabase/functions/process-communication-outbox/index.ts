// Edge Function: process-communication-outbox
// - POST only
// - Autenticação: internal secret (INTERNAL_FUNCTION_SECRET) OU service_role JWT
// - Se COMMUNICATION_DELIVERY_ENABLED != "true", NÃO faz claim (dry_run puro)
// - Adapters retornam provider_not_configured sem chamadas de rede
// - Renderiza usando módulo compartilhado (_shared/communication-render.ts)

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

const DELIVERY_ENABLED =
  Deno.env.get("COMMUNICATION_DELIVERY_ENABLED") === "true";
const INAPP_ADAPTER_ENABLED =
  Deno.env.get("COMMUNICATION_INAPP_ADAPTER_ENABLED") === "true";
const INTERNAL_SECRET =
  Deno.env.get("INTERNAL_FUNCTION_SECRET") ?? "";
const SERVICE_KEY =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const WORKER_ID =
  `worker-${Deno.env.get("DENO_DEPLOYMENT_ID") ?? "local"}-${crypto.randomUUID().slice(0, 8)}`;
const BATCH_SIZE = 10;
const LEASE_SECONDS = 90;

type ClaimRow = {
  id: string;
  canal: ComunicacaoCanal;
  template_snapshot: {
    assunto?: string | null;
    corpo: string;
    variaveis: string[];
    canal: ComunicacaoCanal;
  };
  payload_snapshot: { payload?: Record<string, unknown> };
  recipient_user_id: string | null;
  recipient_cliente_id: string | null;
};

function authorize(req: Request): { ok: true } | { ok: false; res: Response } {
  const auth = req.headers.get("Authorization") ?? "";
  const secret = req.headers.get("x-internal-secret") ?? "";
  // Comparação EXATA (nunca substring); ambas condições opcionais.
  if (
    INTERNAL_SECRET.length > 0 &&
    secret.length > 0 &&
    secret === INTERNAL_SECRET
  ) {
    return { ok: true };
  }
  if (auth.startsWith("Bearer ") && SERVICE_KEY.length > 0) {
    const token = auth.slice("Bearer ".length).trim();
    if (token === SERVICE_KEY) return { ok: true };
  }
  return { ok: false, res: json(401, { ok: false, error: "unauthorized" }) };
}

async function runAdapter(
  canal: ComunicacaoCanal,
): Promise<{ code: string; message: string }> {
  // Sem chamadas de rede. Sempre "provider_not_configured" nesta fase.
  if (canal === "in_app" && INAPP_ADAPTER_ENABLED) {
    return { code: "provider_not_configured", message: "in_app rpc não cabeada nesta fase" };
  }
  return { code: "provider_not_configured", message: `${canal} sem provider` };
}

Deno.serve(async (req: Request) => {
  const pre = requirePost(req);
  if (pre) return pre;

  const authz = authorize(req);
  if (!authz.ok) return authz.res;

  if (!DELIVERY_ENABLED) {
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
    try {
      // Renderiza usando o módulo canônico compartilhado
      renderTemplate(
        {
          canal: item.template_snapshot.canal,
          assunto: item.template_snapshot.assunto ?? null,
          corpo: item.template_snapshot.corpo,
          variaveisPermitidas: item.template_snapshot.variaveis ?? [],
        },
        { variaveis: (item.payload_snapshot?.payload ?? {}) as Record<string, unknown> },
      );

      const outcome = await runAdapter(item.canal);
      // Adapter sempre falha (sem provider) -> chama fail RPC
      const { error: failErr } = await supabase.rpc(
        "rpc_fail_communication_delivery",
        {
          p_outbox_id: item.id,
          p_worker_id: WORKER_ID,
          p_error_code: outcome.code,
          p_error_message: outcome.message,
        },
      );
      results.push({
        id: item.id,
        canal: item.canal,
        adapter: outcome.code,
        fail_error: failErr?.message ?? null,
      });
    } catch (e) {
      const msg = e instanceof TemplateRenderError ? `render:${e.code}` : "render_error";
      const { error: failErr } = await supabase.rpc(
        "rpc_fail_communication_delivery",
        {
          p_outbox_id: item.id,
          p_worker_id: WORKER_ID,
          p_error_code: msg.slice(0, 80),
          p_error_message: String((e as Error).message).slice(0, 2000),
        },
      );
      results.push({
        id: item.id,
        canal: item.canal,
        adapter: "render_failed",
        fail_error: failErr?.message ?? null,
      });
    }
  }

  return json(200, {
    ok: true,
    dry_run: false,
    worker_id: WORKER_ID,
    claimed: items.length,
    processed: results.length,
    results,
    adapters: {
      email: "provider_not_configured",
      whatsapp: "provider_not_configured",
      in_app: INAPP_ADAPTER_ENABLED ? "enabled_no_op" : "disabled",
      push: "provider_not_configured",
    },
  });
});

// Reexporta corsHeaders para linting/uso em testes locais.
export { corsHeaders };
