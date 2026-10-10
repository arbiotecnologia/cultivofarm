import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";

export const metadataFields = ["nome", "descricao", "modo_acao", "funcao_completa", "modo_aplicacao"] as const;
const optionalText = z.string().max(10000).nullable();
export const metadataValuesSchema = z.object({
  nome: z.string().trim().min(1).max(500), descricao: optionalText,
  modo_acao: optionalText, funcao_completa: optionalText, modo_aplicacao: optionalText,
}).strict();
export const metadataDetailSchema = metadataValuesSchema.extend({
  id: z.string().uuid(), updated_at: z.string().datetime({ offset: true }),
}).strict();
export type MetadataDetail = z.infer<typeof metadataDetailSchema>;
export type MetadataValues = z.infer<typeof metadataValuesSchema>;
export const metadataPatchSchema = metadataValuesSchema.partial().strict().refine((p) => Object.keys(p).length > 0);
const receiptSchema = z.object({ id: z.string().uuid(), updated_at: z.string().datetime({ offset: true }),
  idempotency_key: z.string().uuid(), idempotent: z.boolean(), audit_id: z.string().uuid() }).strict();
// Local bridge until reviewed candidate RPCs are applied and canonical types regenerated externally.
type Rpc = (name: "platform_read_global_product_metadata" | "platform_update_global_product_metadata", args: Record<string, unknown>) =>
  { abortSignal(signal: AbortSignal): PromiseLike<{ data: unknown; error: unknown }> };
export function metadataError(error: unknown) {
  const code = typeof error === "object" && error !== null && "code" in error ? error.code : undefined;
  if (code === "40001") return "O produto mudou ou esta solicitação já foi usada. Reabra a edição para conferir os dados.";
  if (code === "42501") return "Sem permissão para editar o catálogo global.";
  return "Não foi possível confirmar a alteração. Confira os dados antes de tentar novamente.";
}
export async function readMetadata(id: string, signal: AbortSignal): Promise<MetadataDetail> {
  const rpc = supabase.rpc.bind(supabase) as unknown as Rpc;
  const { data, error } = await rpc("platform_read_global_product_metadata", { p_id: id }).abortSignal(signal);
  const parsed = metadataDetailSchema.safeParse(data);
  if (signal.aborted || error || !parsed.success || parsed.data.id !== id) throw new Error("Não foi possível carregar os dados do produto.");
  return parsed.data;
}
export async function updateMetadata(detail: MetadataDetail, values: MetadataValues, reason: string, key: string, signal: AbortSignal) {
  const validated = metadataValuesSchema.parse(values);
  const patch: Partial<MetadataValues> = {};
  for (const field of metadataFields) if (validated[field] !== detail[field]) patch[field] = validated[field];
  metadataPatchSchema.parse(patch);
  const cleanReason = z.string().trim().min(10).max(500).parse(reason);
  const rpc = supabase.rpc.bind(supabase) as unknown as Rpc;
  const { data, error } = await rpc("platform_update_global_product_metadata", {
    p_id: detail.id, p_expected_updated_at: detail.updated_at, p_patch: patch,
    p_reason: cleanReason, p_idempotency_key: key,
  }).abortSignal(signal);
  if (signal.aborted) throw new Error("Solicitação encerrada.");
  if (error) throw new Error(metadataError(error));
  const receipt = receiptSchema.safeParse(data);
  if (!receipt.success || receipt.data.id !== detail.id || receipt.data.idempotency_key !== key || receipt.data.updated_at === detail.updated_at)
    throw new Error(metadataError(null));
  return receipt.data;
}
