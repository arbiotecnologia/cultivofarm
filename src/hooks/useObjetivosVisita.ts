import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Retorna as sugestões de objetivo de visita técnica para uma cultura,
 * combinando sugestões genéricas (cultura_id NULL) + específicas da cultura.
 * Lista final é deduplicada por texto e ordenada (genéricas no fim).
 */
export function useObjetivosVisita(culturaId?: string | null) {
  return useQuery({
    queryKey: ["objetivos-visita-sugestoes", culturaId ?? null],
    queryFn: async () => {
      let q = supabase
        .from("objetivos_visita_sugestoes")
        .select("texto, ordem, cultura_id")
        .eq("ativo", true);

      if (culturaId) {
        q = q.or(`cultura_id.eq.${culturaId},cultura_id.is.null`);
      } else {
        q = q.is("cultura_id", null);
      }

      const { data, error } = await q;
      if (error) throw error;

      const rows = (data || []).slice().sort((a, b) => {
        // específicas (cultura_id != null) primeiro
        const aGen = a.cultura_id ? 0 : 1;
        const bGen = b.cultura_id ? 0 : 1;
        if (aGen !== bGen) return aGen - bGen;
        if ((a.ordem ?? 0) !== (b.ordem ?? 0)) return (a.ordem ?? 0) - (b.ordem ?? 0);
        return (a.texto || "").localeCompare(b.texto || "");
      });

      const seen = new Set<string>();
      const result: string[] = [];
      for (const r of rows) {
        const t = (r.texto || "").trim();
        if (!t || seen.has(t.toLowerCase())) continue;
        seen.add(t.toLowerCase());
        result.push(t);
      }
      return result;
    },
    staleTime: 5 * 60 * 1000,
  });
}
