import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";

/**
 * Gestão GLOBAL de `b2b_enabled` (Platform Superadmin). Ponte local para RPCs candidatas
 * NÃO aplicadas (`scripts/rbac-audit/proposed-platform-global-b2b-enabled.sql`); falha fechada
 * enquanto ausentes. Altera somente a disponibilidade comercial: ativo, preços, dose,
 * composição, apresentações, fichas e fiscal não são enviados nem alterados.
 * Liberar exige item ativo; ficha técnica aprovada continua sendo gate separado do portal técnico.
 */
export type B2BItemTipo = "produto" | "microrganismo";
const version = z.string().datetime({ offset: true });
export const b2bStateSchema = z.object({
  item_tipo: z.enum(["produto", "microrganismo"]), id: z.string().uuid(), nome: z.string(), codigo: z.string().nullable(),
  ativo: z.boolean(), b2b_enabled: z.boolean(), updated_at: version,
}).strict();
export type B2BState = z.infer<typeof b2bStateSchema>;
export const b2bReceiptSchema = z.object({
  item_tipo: z.enum(["produto", "microrganismo"]), id: z.string().uuid(), ativo: z.boolean(), b2b_enabled: z.boolean(),
  updated_at: version, idempotency_key: z.string().uuid(), audit_id: z.string().uuid(), idempotent: z.boolean(),
}).strict();
export const b2bReasonSchema = z.string().trim().min(10).max(500);

type Rpc = (name: "platform_read_global_b2b_state" | "platform_set_global_b2b_enabled", args: Record<string, unknown>) =>
  { abortSignal(signal: AbortSignal): PromiseLike<{ data: unknown; error: unknown }> };
const rpc = () => supabase.rpc.bind(supabase) as unknown as Rpc;

export function b2bError(error: unknown) {
  const code = typeof error === "object" && error !== null && "code" in error ? (error as { code?: unknown }).code : undefined;
  const message = typeof error === "object" && error !== null && "message" in error ? String((error as { message?: unknown }).message) : "";
  if (message === "catalog_b2b_requires_active") return "Ative o item antes de liberá-lo para o B2B.";
  if (code === "40001") return "O item mudou ou esta solicitação já foi usada. Reabra para conferir os dados.";
  if (code === "42501") return "Sem permissão para alterar a disponibilidade B2B do catálogo global.";
  return "Não foi possível confirmar a alteração. Confira os dados antes de tentar novamente.";
}

export async function readB2BState(tipo: B2BItemTipo, id: string, signal: AbortSignal): Promise<B2BState> {
  const { data, error } = await rpc()("platform_read_global_b2b_state", { p_item_tipo: tipo, p_id: id }).abortSignal(signal);
  const parsed = b2bStateSchema.safeParse(data);
  if (signal.aborted || error || !parsed.success || parsed.data.id !== id || parsed.data.item_tipo !== tipo)
    throw new Error("Não foi possível carregar a disponibilidade B2B do item.");
  return parsed.data;
}

/** Pré-validação local apenas de UX; o servidor decide (ativo, CAS, motivo, ator). */
export function canRequestB2B(state: B2BState, target: boolean) {
  if (state.b2b_enabled === target) return false;
  return target ? state.ativo : true;
}

export async function setB2BEnabled(state: B2BState, target: boolean, reason: string, key: string, signal: AbortSignal) {
  if (!canRequestB2B(state, target)) throw new Error(target && !state.ativo ? "Ative o item antes de liberá-lo para o B2B." : "Nenhuma alteração para salvar.");
  const cleanReason = b2bReasonSchema.parse(reason);
  const { data, error } = await rpc()("platform_set_global_b2b_enabled", {
    p_item_tipo: state.item_tipo, p_id: state.id, p_expected_updated_at: state.updated_at, p_b2b_enabled: target,
    p_reason: cleanReason, p_idempotency_key: key,
  }).abortSignal(signal);
  if (signal.aborted) throw new Error("Solicitação encerrada.");
  if (error) throw new Error(b2bError(error));
  const receipt = b2bReceiptSchema.safeParse(data);
  if (!receipt.success || receipt.data.idempotency_key !== key || receipt.data.id !== state.id
    || receipt.data.item_tipo !== state.item_tipo || receipt.data.b2b_enabled !== target
    || receipt.data.ativo !== state.ativo || receipt.data.updated_at === state.updated_at)
    throw new Error(b2bError(null));
  return receipt.data;
}
