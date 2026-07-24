/**
 * Fase Fiscal 3.20 — Hooks tipados para microrganismos com associação a
 * produtos canônicos e reutilização do MESMO `product_fiscal_profiles`.
 *
 * ─────────────────────────────────────────────────────────────────────
 * TIPOS
 *   A coluna `product_id` (aditiva pela migration 20260804000000) ainda
 *   NÃO está no arquivo canônico `src/integrations/supabase/types.ts` —
 *   `types.ts` só regenera após a migration ser promovida. Para evitar
 *   casts amplos (`as any`) em toda a UI, este módulo define tipos
 *   NARROWS locais que ESTENDEM os oficiais e são aplicados APENAS no
 *   contorno da chamada Supabase (uma única linha por operação).
 *
 * SEGURANÇA
 *   - Nenhum join por nome; associação exige `product_id` explícito.
 *   - Nenhum backfill automático.
 *   - Mutações escrevem SOMENTE `product_id`; nenhum outro campo do
 *     microrganismo é alterado aqui.
 *   - Erros de RLS/permissão são propagados como `permission_denied`
 *     (nunca convertidos em sucesso silencioso).
 * ─────────────────────────────────────────────────────────────────────
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type MicroorganismRowOfficial =
  Database["public"]["Tables"]["microrganismos"]["Row"];

/**
 * Extensão narrow — reflete a coluna aditiva definida em
 * restoration/20260804000000_fiscal_microrganismos_product_association.sql.
 * Manter esta interface até a regeneração canônica de `types.ts`.
 */
export interface MicroorganismRow extends MicroorganismRowOfficial {
  product_id: string | null;
}

export interface MicroorganismListItem {
  id: string;
  nome: string;
  codigo: string | null;
  product_id: string | null;
  ativo: boolean;
}

export const MICROORGANISM_FISCAL_KEYS = {
  root: ["fiscal", "microrganismos"] as const,
  list: (search: string) =>
    [...MICROORGANISM_FISCAL_KEYS.root, "list", search] as const,
} as const;

function isPermissionError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: string; status?: number; message?: string };
  if (e.code === "42501" || e.code === "PGRST301") return true;
  if (e.status === 401 || e.status === 403) return true;
  if (typeof e.message === "string" && /permission|denied|rls/i.test(e.message))
    return true;
  return false;
}

/**
 * Lista completa de microrganismos ativos (dataset pequeno, ~24 linhas).
 * Retorna também `product_id` para permitir reutilização do perfil
 * fiscal do produto canônico associado, sem duplicar perfil.
 */
export function useMicroorganismList(
  search: string,
  options: { enabled?: boolean } = {},
) {
  const enabled = options.enabled ?? true;
  return useQuery<MicroorganismListItem[], Error>({
    queryKey: MICROORGANISM_FISCAL_KEYS.list(search),
    enabled,
    queryFn: async () => {
      const term = search.trim().replace(/[,()]/g, " ").slice(0, 100);
      // Cast narrow no CONTORNO: apenas o retorno do select é reformado
      // para incluir product_id, coluna aditiva ainda não regenerada em
      // types.ts. Nenhuma outra parte da UI toca o cast.
      let q = supabase
        .from("microrganismos")
        .select("id, nome, codigo, ativo, product_id" as string)
        .eq("ativo", true)
        .order("nome", { ascending: true });
      if (term) {
        q = q.or(`nome.ilike.%${term}%,codigo.ilike.%${term}%`);
      }
      const { data, error } = await q;
      if (error) {
        if (isPermissionError(error)) throw new Error("permission_denied");
        throw new Error(error.message);
      }
      const rows = ((data ?? []) as unknown) as Array<{
        id: string;
        nome: string;
        codigo: string | null;
        ativo: boolean;
        product_id: string | null;
      }>;
      return rows.map((r) => ({
        id: r.id,
        nome: r.nome,
        codigo: r.codigo ?? null,
        product_id: r.product_id ?? null,
        ativo: r.ativo,
      }));
    },
  });
}

export class MicroorganismAssociationConflictError extends Error {
  constructor() {
    super("association_conflict");
    this.name = "MicroorganismAssociationConflictError";
  }
}

/**
 * Associa (ou desassocia com `productId = null`) um microrganismo a um
 * produto canônico. NÃO altera nenhum outro campo do microrganismo.
 */
export function useAssociateMicroorganism() {
  const qc = useQueryClient();
  return useMutation<
    { id: string; product_id: string | null },
    Error,
    { microorganismId: string; productId: string | null }
  >({
    mutationFn: async ({ microorganismId, productId }) => {
      // Cast narrow no CONTORNO: payload contém apenas product_id (uuid|null).
      const payload = { product_id: productId } as unknown as Database["public"]["Tables"]["microrganismos"]["Update"];
      const { data, error } = await supabase
        .from("microrganismos")
        .update(payload)
        .eq("id", microorganismId)
        .select("id, product_id" as string)
        .maybeSingle();
      if (error) {
        if (isPermissionError(error)) throw new Error("permission_denied");
        // Violação de unique index parcial (dois microrganismos para o
        // mesmo produto) chega como 23505.
        const code = (error as { code?: string }).code;
        if (code === "23505") throw new MicroorganismAssociationConflictError();
        throw new Error(error.message);
      }
      if (!data) throw new Error("not_found");
      const row = data as unknown as { id: string; product_id: string | null };
      return { id: row.id, product_id: row.product_id ?? null };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: MICROORGANISM_FISCAL_KEYS.root });
      qc.invalidateQueries({ queryKey: ["fiscal", "product-profiles"] });
    },
  });
}
