import { z } from "zod";
import { useQueries } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PRODUCT_FAMILIES, type ProductFamily } from "@/lib/catalogo/platformCatalogFamily";

/**
 * Nomes de exibição dos rótulos ATIVOS para leitores autorizados (qualquer perfil ativo,
 * inclusive técnico B2B e tenant) via RPC `catalog_family_labels_read` — nunca a RPC
 * administrativa nem consulta direta à tabela `catalog_family_labels` (sem grants).
 * Renomear a exibição na Gestão da plataforma reflete aqui após invalidação do cache.
 * Falha fechada: sem a RPC, o mapa fica vazio e o leitor exibe a chave crua do rótulo.
 */
export const activeLabelSchema = z.object({
  familia: z.enum(PRODUCT_FAMILIES),
  rotulo: z.string().regex(/^[a-z0-9][a-z0-9_]{1,39}$/),
  rotulo_exibicao: z.string().min(2).max(80),
}).strict();
export const activeLabelListSchema = z.array(activeLabelSchema).max(200);
export type ActiveLabel = z.infer<typeof activeLabelSchema>;

type Rpc = (name: string, args: Record<string, unknown>) =>
  { abortSignal(signal: AbortSignal): PromiseLike<{ data: unknown; error: unknown }> };

export async function readActiveCatalogLabels(family: ProductFamily, signal: AbortSignal): Promise<ActiveLabel[]> {
  const { data, error } = await (supabase.rpc.bind(supabase) as unknown as Rpc)(
    "catalog_family_labels_read", { p_familia: family }).abortSignal(signal);
  if (signal.aborted) throw new Error("Solicitação encerrada.");
  if (error) throw new Error("catalog_label_read_unavailable");
  const parsed = activeLabelListSchema.safeParse(data);
  if (!parsed.success) throw new Error("catalog_label_read_unavailable");
  return parsed.data;
}

/** Chave composta: a unicidade canônica é (familia, rotulo); a mesma chave em famílias distintas não colide. */
export const labelNameKey = (familia: string, rotulo: string) => `${familia}\u0000${rotulo}`;
/** Mapa (familia, rotulo) → nome de exibição, por escopo de identidade. Falha fechada: mapa vazio. */
export function useCatalogLabelNames(scope: string, enabled: boolean): Record<string, string> {
  const queries = useQueries({
    queries: PRODUCT_FAMILIES.map((family) => ({
      queryKey: ["catalog-labels-read", scope, family],
      enabled,
      retry: false,
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      queryFn: ({ signal }: { signal: AbortSignal }) => readActiveCatalogLabels(family, signal),
    })),
  });
  const map: Record<string, string> = {};
  for (const q of queries) for (const l of q.data ?? []) map[labelNameKey(l.familia, l.rotulo)] = l.rotulo_exibicao;
  return map;
}

/** Nome de exibição do rótulo: fonte canônica → fallback informado → chave crua. */
export function labelDisplayName(names: Record<string, string>, familia: string, rotulo: string, fallback?: string) {
  return names[labelNameKey(familia, rotulo)] ?? fallback ?? rotulo;
}
