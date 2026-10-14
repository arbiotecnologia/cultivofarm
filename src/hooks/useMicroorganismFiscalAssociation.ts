/**
 * Fase Fiscal 3.20 — Hooks tipados para microrganismos com associação a
 * produtos canônicos e reutilização do MESMO `product_fiscal_profiles`.
 *
 * ─────────────────────────────────────────────────────────────────────
 * TIPOS
 *   A coluna `product_id` (aditiva pela migration canônica
 *   `supabase/migrations/20260804000000_fiscal_microrganismos_product_association.sql`)
 *   ainda NÃO está no arquivo canônico
 *   `src/integrations/supabase/cultivofarm.types.ts` — `types.ts` só regenera após
 *   a migration ser promovida pelo mecanismo oficial. Para evitar
 *   `as any` e casts espalhados na UI, este módulo confina o boundary
 *   de tipagem a uma única linha por operação (select/update), via
 *   `as unknown as ...` estritamente local.
 *
 *   AÇÃO AO REGENERAR `types.ts`: remover as interfaces narrow abaixo
 *   e substituir os casts por acesso direto ao Row/Update oficial.
 *
 * SEGURANÇA
 *   - Nenhum join por nome; associação exige `product_id` explícito.
 *   - Nenhum backfill automático.
 *   - Mutações escrevem SOMENTE `product_id`; nenhum outro campo do
 *     microrganismo é alterado aqui.
 *   - Erros de RLS/permissão são propagados como `permission_denied`
 *     (nunca convertidos em sucesso silencioso).
 *
 * CARDINALIDADE
 *   A migration NÃO impõe UNIQUE em `product_id`. Vários microrganismos
 *   podem apontar para o mesmo produto canônico. Este hook, portanto,
 *   não trata 23505 como conflito específico de associação — tal código
 *   só chegaria por outra restrição não relacionada e é propagado com
 *   a mensagem original.
 * ─────────────────────────────────────────────────────────────────────
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { assertGlobalCatalogWriteBlocked } from "@/lib/catalogo/globalCatalogWriteContainment";
import type { Database } from "@/integrations/supabase/cultivofarm.types";

type MicroorganismRowOfficial =
  Database["public"]["Tables"]["microrganismos"]["Row"];

/**
 * Extensão narrow — reflete a coluna aditiva definida em
 * `supabase/migrations/20260804000000_fiscal_microrganismos_product_association.sql`.
 * Remover após regeneração canônica de `types.ts`.
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
      // Boundary narrow: apenas o retorno do select é reformado para
      // incluir product_id, coluna aditiva ainda não regenerada em
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

/**
 * Associa (ou desassocia com `productId = null`) um microrganismo a um
 * produto canônico. NÃO altera nenhum outro campo do microrganismo.
 *
 * Nenhum código de erro específico é convertido em conflito de
 * associação: a migration não impõe unicidade em `product_id`.
 */
export function useAssociateMicroorganism() {
  const qc = useQueryClient();
  return useMutation<
    { id: string; product_id: string | null },
    Error,
    { microorganismId: string; productId: string | null }
  >({
    mutationFn: async ({ microorganismId, productId }) => {
      // P1 contido: migration 20261014192417 global_microorganism_fiscal_association_containment
      // revogou EXECUTE da RPC (alterava product_id GLOBAL). Falha ANTES de qualquer chamada.
      assertGlobalCatalogWriteBlocked();
      // Boundary narrow: a RPC canônica
      // `rpc_associate_microorganism_fiscal_product` (migration
      // 20260805000000) autoriza `administrador` e `financeiro`
      // (coerente com a rota /configuracoes/fiscal/produtos) e
      // atualiza EXCLUSIVAMENTE microrganismos.product_id. O UPDATE
      // direto foi removido para não exigir ampliação de policy da
      // tabela. Cast local `as never` no nome da função enquanto o
      // types.ts canônico não é regenerado; remover no próximo
      // ciclo de regeneração.
      const args = {
        p_microorganism_id: microorganismId,
        p_product_id: productId,
      };
      const { data, error } = await (supabase.rpc as unknown as (
        fn: string,
        args: { p_microorganism_id: string; p_product_id: string | null },
      ) => Promise<{ data: unknown; error: unknown }>)(
        "rpc_associate_microorganism_fiscal_product",
        args,
      );
      if (error) {
        if (isPermissionError(error)) throw new Error("permission_denied");
        const msg = (error as { message?: string }).message ?? "";
        if (/not_found|product_not_found|P0002/i.test(msg)) {
          throw new Error(/product_not_found/i.test(msg) ? "product_not_found" : "not_found");
        }
        throw new Error(msg || "unknown_error");
      }
      const rows = (Array.isArray(data) ? data : data ? [data] : []) as Array<{
        id: string;
        product_id: string | null;
      }>;
      const row = rows[0];
      if (!row) throw new Error("not_found");
      return { id: row.id, product_id: row.product_id ?? null };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: MICROORGANISM_FISCAL_KEYS.root });
      qc.invalidateQueries({ queryKey: ["fiscal", "product-profiles"] });
    },
  });
}

