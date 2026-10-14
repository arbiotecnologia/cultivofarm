import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";

/**
 * Família explícita do catálogo GLOBAL (Platform Superadmin). Ponte local para RPCs candidatas
 * NÃO aplicadas (`scripts/rbac-audit/proposed-platform-global-product-family.sql`); falha fechada
 * enquanto ausentes. `tipo` (enum legado de finalidade) é preservado e nunca usado para inferir família.
 */
export const PRODUCT_FAMILIES = ["quimico", "biologico", "fertilizante_adubo"] as const;
export type ProductFamily = (typeof PRODUCT_FAMILIES)[number];
export const FAMILY_CLASSES: Record<ProductFamily, readonly string[]> = {
  biologico: ["biofungicida", "bioinseticida", "inoculante", "solubilizador"],
  quimico: ["fungicida", "inseticida", "herbicida"],
  fertilizante_adubo: [],
};
export const FAMILY_LABEL: Record<ProductFamily, string> = {
  quimico: "Produtos Químicos", biologico: "Produtos Biológicos", fertilizante_adubo: "Fertilizantes/Adubos",
};
export const CLASS_LABEL: Record<string, string> = {
  biofungicida: "Biofungicida", bioinseticida: "Bioinseticida", inoculante: "Inoculante", solubilizador: "Solubilizador",
  fungicida: "Fungicida", inseticida: "Inseticida", herbicida: "Herbicida",
};

/** Abas do catálogo global, nesta ordem exata. Microrganismos reutiliza o painel existente. */
export const CATALOG_TABS = [
  { value: "quimicos", label: "Produtos Químicos", family: "quimico" as ProductFamily },
  { value: "biologicos", label: "Produtos Biológicos", family: "biologico" as ProductFamily },
  { value: "microrganismos", label: "Microrganismos" },
  { value: "fertilizantes", label: "Fertilizantes/Adubos", family: "fertilizante_adubo" as ProductFamily },
] as const;
export type CatalogView = (typeof CATALOG_TABS)[number]["value"] | "culturas";
/** `familia` = padrão da aba (somente a família); `todos`/`pendentes` = revisão administrativa global. */
export type ReviewFilter = "familia" | "todos" | "pendentes";

export function parseCatalogView(value: string | null): CatalogView {
  if (value === "culturas") return "culturas";
  return CATALOG_TABS.some((t) => t.value === value) ? (value as CatalogView) : "quimicos";
}
export function parseReview(value: string | null): ReviewFilter {
  return value === "pendentes" || value === "todos" ? value : "familia";
}

/** Coerência família↔classe (espelho do CHECK do servidor; o servidor decide). */
export function isClassAllowed(family: ProductFamily, classe: string | null) {
  return classe === null || FAMILY_CLASSES[family].includes(classe);
}

const version = z.string().datetime({ offset: true });
export const familyReceiptSchema = z.object({
  id: z.string().uuid(), familia_catalogo: z.enum(PRODUCT_FAMILIES), classe_catalogo: z.string().nullable(),
  updated_at: version, idempotency_key: z.string().uuid(), audit_id: z.string().uuid(), idempotent: z.boolean(),
}).strict();
export const familyReasonSchema = z.string().trim().min(10).max(500);

export interface FamilyTarget { id: string; updated_at: string; familia_catalogo: ProductFamily | null; classe_catalogo: string | null }

type Rpc = (name: "platform_set_global_product_family", args: Record<string, unknown>) =>
  { abortSignal(signal: AbortSignal): PromiseLike<{ data: unknown; error: unknown }> };

export function familyError(error: unknown) {
  const code = typeof error === "object" && error !== null && "code" in error ? (error as { code?: unknown }).code : undefined;
  if (code === "40001") return "O produto mudou ou esta solicitação já foi usada. Reabra para conferir os dados.";
  if (code === "42501") return "Sem permissão para classificar o catálogo global.";
  return "Não foi possível confirmar a classificação. Confira os dados antes de tentar novamente.";
}

export async function setProductFamily(target: FamilyTarget, family: ProductFamily, classe: string | null,
  reason: string, key: string, signal: AbortSignal) {
  if (!isClassAllowed(family, classe)) throw new Error("Classe não pertence à família escolhida.");
  if (target.familia_catalogo === family && target.classe_catalogo === classe) throw new Error("Nenhuma alteração para salvar.");
  const cleanReason = familyReasonSchema.parse(reason);
  const rpc = supabase.rpc.bind(supabase) as unknown as Rpc;
  const { data, error } = await rpc("platform_set_global_product_family", {
    p_id: target.id, p_expected_updated_at: target.updated_at, p_familia: family, p_classe: classe,
    p_reason: cleanReason, p_idempotency_key: key,
  }).abortSignal(signal);
  if (signal.aborted) throw new Error("Solicitação encerrada.");
  if (error) throw new Error(familyError(error));
  const receipt = familyReceiptSchema.safeParse(data);
  if (!receipt.success || receipt.data.id !== target.id || receipt.data.idempotency_key !== key
    || receipt.data.familia_catalogo !== family || receipt.data.classe_catalogo !== classe
    || receipt.data.updated_at === target.updated_at)
    throw new Error(familyError(null));
  return receipt.data;
}
