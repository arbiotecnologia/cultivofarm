import { z } from "zod";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { metadataRetryKey } from "@/lib/catalogo/platformCatalogMetadata";
import { PRODUCT_FAMILIES, type ProductFamily } from "@/lib/catalogo/platformCatalogFamily";

/**
 * Rótulos por família do catálogo GLOBAL — fonte canônica é a tabela
 * `catalog_family_labels` via RPCs platform_* (candidata `scripts/catalog-labels-20261021`,
 * NÃO aplicada). Falha fechada enquanto ausentes. Nunca inferir rótulo por nome/tipo.
 */
export const LABEL_ROTULO_PATTERN = /^[a-z0-9][a-z0-9_]{1,39}$/;
export const LABEL_REASON_MIN = 10;
export const LABEL_REASON_MAX = 500;

const version = z.string().datetime({ offset: true });
export interface CatalogLabel {
  id: string; familia: ProductFamily; rotulo: string; rotulo_exibicao: string; ativo: boolean; updated_at: string;
}
export const catalogLabelSchema: z.ZodType<CatalogLabel> = z.object({
  id: z.string().uuid(),
  familia: z.enum(PRODUCT_FAMILIES),
  rotulo: z.string().regex(LABEL_ROTULO_PATTERN),
  rotulo_exibicao: z.string().min(2).max(80),
  ativo: z.boolean(),
  updated_at: version,
}).strict();
export const catalogLabelListSchema = z.array(catalogLabelSchema).max(200);

const baseReceipt = {
  id: z.string().uuid(), familia: z.enum(PRODUCT_FAMILIES), rotulo: z.string(),
  idempotency_key: z.string().uuid(), audit_id: z.string().uuid(), idempotent: z.boolean(),
};
export const labelCreateReceiptSchema = z.object({ ...baseReceipt, rotulo_exibicao: z.string(), ativo: z.literal(true) }).strict();
export const labelUpdateReceiptSchema = z.object({ ...baseReceipt, rotulo_exibicao: z.string(), updated_at: version }).strict();
export const labelActiveReceiptSchema = z.object({ ...baseReceipt, ativo: z.boolean(), updated_at: version }).strict();

export function labelError(error: unknown) {
  const code = typeof error === "object" && error !== null && "code" in error ? (error as { code?: unknown }).code : undefined;
  if (code === "42501") return "Sem permissão para gerenciar rótulos do catálogo global.";
  if (code === "40001") return "O rótulo mudou ou esta solicitação já foi usada. Recarregue para conferir os dados.";
  if (code === "23505") return "Já existe um rótulo com esta chave nesta família.";
  if (code === "22023") return "Dados inválidos: confira família, chave, nome de exibição e motivo.";
  return "Não foi possível confirmar a operação. Confira os dados antes de tentar novamente.";
}

type Rpc = (name: string, args: Record<string, unknown>) =>
  { abortSignal(signal: AbortSignal): PromiseLike<{ data: unknown; error: unknown }> };
const call = (name: string, args: Record<string, unknown>, signal: AbortSignal) =>
  (supabase.rpc.bind(supabase) as unknown as Rpc)(name, args).abortSignal(signal);

export async function listCatalogLabels(family: ProductFamily, signal: AbortSignal): Promise<CatalogLabel[]> {
  const { data, error } = await call("platform_list_catalog_labels", { p_familia: family }, signal);
  if (signal.aborted) throw new Error("Solicitação encerrada.");
  if (error) throw new Error(labelError(error));
  const parsed = catalogLabelListSchema.safeParse(data);
  if (!parsed.success) throw new Error(labelError(null));
  return parsed.data;
}

/** Cache por escopo de identidade + família; sem retry; falha fechada. */
export function usePlatformCatalogLabels(family: ProductFamily | "", scope: string, enabled: boolean) {
  return useQuery({
    queryKey: ["platform-catalog-labels", scope, family],
    enabled: enabled && family !== "",
    retry: false,
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    queryFn: ({ signal }) => listCatalogLabels(family as ProductFamily, signal),
  });
}

function parseReason(reason: string) {
  const clean = reason.trim();
  if (clean.length < LABEL_REASON_MIN || clean.length > LABEL_REASON_MAX) throw new Error(labelError({ code: "22023" }));
  return clean;
}

export async function createCatalogLabel(input: { familia: ProductFamily; rotulo: string; rotulo_exibicao: string },
  reason: string, key: string, signal: AbortSignal) {
  const rotulo = input.rotulo.trim().toLowerCase();
  const exibicao = input.rotulo_exibicao.trim();
  if (!LABEL_ROTULO_PATTERN.test(rotulo) || exibicao.length < 2 || exibicao.length > 80) throw new Error(labelError({ code: "22023" }));
  const cleanReason = parseReason(reason);
  const { data, error } = await call("platform_create_catalog_label",
    { p_familia: input.familia, p_rotulo: rotulo, p_rotulo_exibicao: exibicao, p_reason: cleanReason, p_idempotency_key: key }, signal);
  if (signal.aborted) throw new Error("Solicitação encerrada.");
  if (error) throw new Error(labelError(error));
  const receipt = labelCreateReceiptSchema.safeParse(data);
  if (!receipt.success || receipt.data.familia !== input.familia || receipt.data.rotulo !== rotulo
    || receipt.data.rotulo_exibicao !== exibicao || receipt.data.idempotency_key !== key)
    throw new Error(labelError(null));
  return receipt.data;
}

export async function updateCatalogLabel(target: { id: string; updated_at: string; rotulo: string },
  exibicao: string, reason: string, key: string, signal: AbortSignal) {
  const clean = exibicao.trim();
  if (clean.length < 2 || clean.length > 80) throw new Error(labelError({ code: "22023" }));
  const cleanReason = parseReason(reason);
  const { data, error } = await call("platform_update_catalog_label",
    { p_id: target.id, p_expected_updated_at: target.updated_at, p_rotulo_exibicao: clean, p_reason: cleanReason, p_idempotency_key: key }, signal);
  if (signal.aborted) throw new Error("Solicitação encerrada.");
  if (error) throw new Error(labelError(error));
  const receipt = labelUpdateReceiptSchema.safeParse(data);
  if (!receipt.success || receipt.data.id !== target.id || receipt.data.rotulo !== target.rotulo
    || receipt.data.rotulo_exibicao !== clean || receipt.data.idempotency_key !== key
    || receipt.data.updated_at === target.updated_at)
    throw new Error(labelError(null));
  return receipt.data;
}

export async function setCatalogLabelActive(target: { id: string; updated_at: string; rotulo: string; ativo: boolean },
  ativo: boolean, reason: string, key: string, signal: AbortSignal) {
  if (target.ativo === ativo) throw new Error("Nenhuma alteração para salvar.");
  const cleanReason = parseReason(reason);
  const { data, error } = await call("platform_set_catalog_label_active",
    { p_id: target.id, p_expected_updated_at: target.updated_at, p_ativo: ativo, p_reason: cleanReason, p_idempotency_key: key }, signal);
  if (signal.aborted) throw new Error("Solicitação encerrada.");
  if (error) throw new Error(labelError(error));
  const receipt = labelActiveReceiptSchema.safeParse(data);
  if (!receipt.success || receipt.data.id !== target.id || receipt.data.rotulo !== target.rotulo
    || receipt.data.ativo !== ativo || receipt.data.idempotency_key !== key
    || receipt.data.updated_at === target.updated_at)
    throw new Error(labelError(null));
  return receipt.data;
}

export function labelRetryKey(scope: string, parts: unknown) {
  return metadataRetryKey(scope, JSON.stringify(parts));
}
