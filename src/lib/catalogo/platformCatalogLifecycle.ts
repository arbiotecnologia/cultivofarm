import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { metadataError } from "@/lib/catalogo/platformCatalogMetadata";

/** Tipos legados de aplicação realmente suportados pelo enum `tipo_produto`. Famílias novas dependem de B1. */
export const legacyProductTypes = ["inseticida", "fungicida", "solo", "inoculante", "solubilizador"] as const;
const optionalText = z.string().max(10000).nullable();
/** Até 6 casas decimais, alinhado a `pg_catalog.scale(...) <= 6` no servidor (JSON usa String(n)). */
export function hasMaxSixDecimals(n: number) {
  const text = String(n);
  if (/e/i.test(text)) return false;
  const dot = text.indexOf(".");
  return dot < 0 || text.length - dot - 1 <= 6;
}
const positive = z.number().finite().positive().max(1_000_000).refine(hasMaxSixDecimals);
export const createPayloadSchema = z.object({
  nome: z.string().trim().min(1).max(500),
  tipo: z.enum(legacyProductTypes),
  descricao: optionalText, modo_acao: optionalText, funcao_completa: optionalText, modo_aplicacao: optionalText,
  dose_ml_ha: positive.nullable(),
  composicao: z.array(z.object({ microrganismo_id: z.string().uuid(), volume_ml: positive,
    proporcao: z.number().finite().positive().max(100).refine(hasMaxSixDecimals).nullable() }).strict()).max(50)
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

export const MICRO_PAGE_LIMIT = 20;
export const microPageSchema = z.object({
  items: z.array(z.object({ id: z.string().uuid(), codigo: z.string().nullable(), nome: z.string(), ativo: z.boolean() }).strict()).max(MICRO_PAGE_LIMIT),
  has_more: z.boolean(),
}).strict();
export type MicroPage = z.infer<typeof microPageSchema>;
type MicroRpc = (name: "platform_read_global_microorganisms", args: { p_search: string; p_limit: number; p_offset: number; p_only_active: boolean }) =>
  { abortSignal(signal: AbortSignal): PromiseLike<{ data: unknown; error: unknown }> };
/** Leitor mínimo candidato (só ativos para novas seleções); falha fechada se ausente ou resposta fora do contrato. */
export async function readActiveMicroorganisms(search: string, offset: number, signal: AbortSignal): Promise<MicroPage> {
  const call = supabase.rpc.bind(supabase) as unknown as MicroRpc;
  const { data, error } = await call("platform_read_global_microorganisms", {
    p_search: search.trim().slice(0, 120), p_limit: MICRO_PAGE_LIMIT, p_offset: offset, p_only_active: true }).abortSignal(signal);
  const parsed = microPageSchema.safeParse(data);
  if (signal.aborted || error || !parsed.success || parsed.data.items.some((i) => !i.ativo))
    throw new Error("Não foi possível consultar os microrganismos.");
  return parsed.data;
}

/** Converte texto do formulário (vírgula ou ponto) em número; vazio → null; inválido → NaN. */
export function parseDecimal(text: string): number | null {
  const t = text.trim().replace(",", ".");
  if (t === "") return null;
  return /^\d+(\.\d+)?$/.test(t) ? Number(t) : NaN;
}
