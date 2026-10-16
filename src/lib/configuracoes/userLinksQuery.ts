import { supabase } from "@/integrations/supabase/client";
import { RPC_VINCULOS_USUARIOS, parseVinculos } from "./userLinks";

// This read-only RPC is absent from the canonical generated schema.
// Narrow the receiver, never extract its method: SupabaseClient.rpc needs `this`.
interface UserLinksRpcClient {
  rpc(fn: typeof RPC_VINCULOS_USUARIOS, args: { p_user_ids: string[] }): {
    abortSignal(signal: AbortSignal): PromiseLike<{ data: unknown; error: unknown }>;
  };
}

export async function carregarVinculosUsuarios(userIds: string[], signal: AbortSignal) {
  const client = supabase as unknown as UserLinksRpcClient;
  const { data, error } = await client.rpc(RPC_VINCULOS_USUARIOS, {
    p_user_ids: userIds,
  }).abortSignal(signal);
  if (error) throw new Error("Não foi possível carregar os vínculos.");
  return parseVinculos(data);
}