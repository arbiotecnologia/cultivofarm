// Adapter in_app: usa rpc_dispatch_inapp_notification com idempotência por
// outbox_id. Reexecução retorna o mesmo notification_id sem novo INSERT.

import type { AdapterResult, RenderedContent, ResolvedAddress, WorkerEnv } from "./adapters-types.ts";

type SbLike = {
  rpc: (
    name: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
};

export async function sendInApp(
  env: WorkerEnv,
  resolved: ResolvedAddress,
  rendered: RenderedContent,
  supabase: SbLike,
  outboxId?: string,
): Promise<AdapterResult> {
  if (!env.DELIVERY_ENABLED || !env.INAPP_ENABLED) {
    return { outcome: "provider_not_configured", code: "inapp_disabled", message: "flag OFF" };
  }
  if (!resolved.ok || resolved.canal !== "in_app") {
    return { outcome: "invalid_recipient", code: "invalid_target", message: "alvo inválido" };
  }
  if (!outboxId) {
    return { outcome: "permanent_error", code: "inapp_missing_outbox_id", message: "outbox_id obrigatório" };
  }
  if (!resolved.cliente_id && !resolved.user_id) {
    return { outcome: "invalid_recipient", code: "no_target", message: "sem user/cliente" };
  }

  const titulo = (rendered.assunto ?? "").slice(0, 200) || "Notificação";
  const mensagem = (rendered.corpo ?? "").slice(0, 4000);

  const { data, error } = await supabase.rpc("rpc_dispatch_inapp_notification", {
    p_outbox_id: outboxId,
    p_cliente_id: resolved.cliente_id ?? null,
    p_user_id: resolved.user_id ?? null,
    p_titulo: titulo,
    p_mensagem: mensagem,
  });
  if (error) return classifyRpcError(error.message, "inapp_dispatch_error");

  const d = (data ?? {}) as { notification_id?: string; idempotent?: boolean };
  return {
    outcome: "sent",
    code: d.idempotent ? "sent_idempotent" : "sent",
    message: "in_app",
    provider_message_id: d.notification_id ?? null,
  };
}

function classifyRpcError(msg: string, code: string): AdapterResult {
  const lower = (msg ?? "").toLowerCase();
  if (/privilege|permission|insufficient/.test(lower)) {
    return { outcome: "permanent_error", code, message: msg.slice(0, 300) };
  }
  return { outcome: "transient_error", code, message: msg.slice(0, 300) };
}
