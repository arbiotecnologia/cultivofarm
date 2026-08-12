import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface CQReferencia {
  id: string;
  microrganismo_id: string;
  produto_id: string | null;
  ph_min: number | null;
  ph_max: number | null;
  concentracao_min_ufc_ml: number | null;
  aparencia_esperada: string | null;
  odor_esperado: string | null;
  contaminacao_esperada: string | null;
  observacoes: string | null;
  ativo: boolean;
}

/**
 * Busca a referência CQ mais específica (produto → microrganismo).
 * Retorna null quando não há referência cadastrada.
 */
export function useCQReferencia(
  microrganismoId?: string | null,
  produtoId?: string | null,
) {
  return useQuery({
    queryKey: ["cq-referencia", microrganismoId, produtoId],
    enabled: !!microrganismoId,
    queryFn: async (): Promise<CQReferencia | null> => {
      if (!microrganismoId) return null;

      // 1) tentativa mais específica: microrganismo + produto
      if (produtoId) {
        const { data, error } = await (supabase as any)
          .from("cq_parametros_referencia")
          .select("*")
          .eq("ativo", true)
          .eq("microrganismo_id", microrganismoId)
          .eq("produto_id", produtoId)
          .maybeSingle();
        if (error) throw error;
        if (data) return data as CQReferencia;
      }

      // 2) fallback: apenas microrganismo (produto_id nulo)
      const { data, error } = await (supabase as any)
        .from("cq_parametros_referencia")
        .select("*")
        .eq("ativo", true)
        .eq("microrganismo_id", microrganismoId)
        .is("produto_id", null)
        .maybeSingle();
      if (error) throw error;
      return (data as any | null) ?? null;
    },
  });
}
