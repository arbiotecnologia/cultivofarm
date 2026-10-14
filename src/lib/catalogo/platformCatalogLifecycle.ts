import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { metadataError } from "@/lib/catalogo/platformCatalogMetadata";

/** Tipos legados de aplicação realmente suportados pelo enum `tipo_produto`. Famílias novas dependem de B1. */
export const legacyProductTypes = ["inseticida", "fungicida", "solo", "inoculante", "solubilizador"] as const;
const optionalText = z.string().max(10000).nullable();
// Escala (<= 6 casas) é revalidada no servidor; aqui só finito e positivo.
const positive = z.number().finite().positive().max(1_000_000);
export const createPayloadSchema = z.object({
  nome: z.string().trim().min(1).max(500),
  tipo: z.enum(legacyProductTypes),
  descricao: optionalText, modo_acao: optionalText, funcao_completa: optionalText, modo_aplicacao: optionalText,
  dose_ml_ha: positive.nullable(),
  composicao: z.array(z.object({ microrganismo_id: z.string().uuid(), volume_ml: positive,
    proporcao: z.number().finite().positive().max(100).nullable() }).strict()).max(50)
    .refine((items) => new Set(items.map((i) => i.microrganismo_id)).size === items.length),
}).strict();
export type CreatePayload = z.infer<typeof createPayloadSchema>;
const reasonSchema = z.string().trim().min(10).max(500);
const createReceipt = z.object({ id: z.string().uuid(), codigo: z.string().min(1), updated_at: z.string().datetime({ offset: true }),
  composicao_count: z.number().int().nonnegative(), idempotency_key: z.string().uuid(), audit_id: z.string().uuid(), idempotent: z.boolean() }).strict();
const statusReceipt = z.object({ id: z.string().uuid(), ativo: z.boolean(), updated_at: z.string().datetime({ offset: true }),
  idempotency_key: z.string().uuid(), audit_id: z.string().uuid(), idempotent: z.boolean() }).strict();

// Ponte local até a RPC candidata ser revisada/aplicada e os tipos canônicos regenerados externamente.
type Rpc = (name: "platform_create_global_product" | "platform_set_global_product_status", args: Record<string, unknown>) =>
  { abortSignal(signal: AbortSignal): PromiseLike<{ data: unknown; error: unknown }> };
const rpc = () => supabase.rpc.bind(supabase) as unknown as Rpc;

export async function createGlobalProduct(payload: CreatePayload, reason: string, key: string, signal: AbortSignal) {
  const body = createPayloadSchema.parse(payload);
  const cleanReason = reasonSchema.parse(reason);
  const { data, error } = await rpc()("platform_create_global_product", {
    p_payload: body, p_reason: cleanReason, p_idempotency_key: key }).abortSignal(signal);
  if (signal.aborted) throw new Error("Solicitação encerrada.");
  if (error) throw new Error(metadataError(error));
  const receipt = createReceipt.safeParse(data);
  if (!receipt.success || receipt.data.idempotency_key !== key || receipt.data.composicao_count !== body.composicao.length)
    throw new Error(metadataError(null));
  return receipt.data;
}

export async function setGlobalProductStatus(id: string, expectedUpdatedAt: string, ativo: boolean, reason: string, key: string, signal: AbortSignal) {
  const cleanReason = reasonSchema.parse(reason);
  const { data, error } = await rpc()("platform_set_global_product_status", {
    p_id: id, p_expected_updated_at: expectedUpdatedAt, p_ativo: ativo, p_reason: cleanReason, p_idempotency_key: key,
  }).abortSignal(signal);
  if (signal.aborted) throw new Error("Solicitação encerrada.");
  if (error) throw new Error(metadataError(error));
  const receipt = statusReceipt.safeParse(data);
  if (!receipt.success || receipt.data.id !== id || receipt.data.ativo !== ativo || receipt.data.idempotency_key !== key
    || receipt.data.updated_at === expectedUpdatedAt) throw new Error(metadataError(null));
  return receipt.data;
}
