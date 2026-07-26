// Adapter in_app: cria notificações no portal ou operacionais, via RPCs
// SECURITY DEFINER dedicadas (não faz INSERT direto). Ativa-se apenas com
// COMMUNICATION_INAPP_ADAPTER_ENABLED=true.

import type { AdapterResult, RenderedContent, ResolvedAddress, WorkerEnv } from "./adapters.ts";

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
): Promise<AdapterResult> {
  if (!env.DELIVERY_ENABLED || !env.INAPP_ENABLED) {
    return { outcome: "provider_not_configured", code: "inapp_disabled", message: "flag OFF" };
  }
  if (!resolved.ok || resolved.canal !== "in_app") {
    return { outcome: "invalid_recipient", code: "invalid_target", message: "alvo inválido" };
  }
  const titulo = (rendered.assunto ?? "").slice(0, 200) || "Notificação";
  const mensagem = (rendered.corpo ?? "").slice(0, 4000);

  if (resolved.cliente_id) {
    const { data, error } = await supabase.rpc(
      "rpc_create_portal_notification_secure",
      {
        p_cliente_id: resolved.cliente_id,
        p_titulo: titulo,
        p_mensagem: mensagem,
        p_tipo: "informativo",
      },
    );
    if (error) {
      return classifyRpcError(error.message, "inapp_portal_error");
    }
    const id = (data as { notification_id?: string })?.notification_id ?? null;
    return { outcome: "sent", code: "sent", message: "portal", provider_message_id: id };
  }
  if (resolved.user_id) {
    const { data, error } = await supabase.rpc(
      "rpc_create_operational_notification_secure",
      {
        p_usuario_id: resolved.user_id,
        p_titulo: titulo,
        p_mensagem: mensagem,
        p_tipo: "comunicacao",
        p_link: null,
      },
    );
    if (error) {
      return classifyRpcError(error.message, "inapp_operacional_error");
    }
    const id = (data as { notification_id?: string })?.notification_id ?? null;
    return { outcome: "sent", code: "sent", message: "operacional", provider_message_id: id };
  }
  return { outcome: "invalid_recipient", code: "no_target", message: "sem user/cliente" };
}

function classifyRpcError(msg: string, code: string): AdapterResult {
  const lower = (msg ?? "").toLowerCase();
  if (/privilege|permission|insufficient/.test(lower)) {
    return { outcome: "permanent_error", code, message: msg.slice(0, 300) };
  }
  return { outcome: "transient_error", code, message: msg.slice(0, 300) };
}
