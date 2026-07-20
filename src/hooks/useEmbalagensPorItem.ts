import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { embalagemVolumes, fmtL } from "@/lib/envaseFormat";

function sortTipos(tipos: Set<string>): string[] {
  return Array.from(tipos).sort((a, b) => {
    const va = embalagemVolumes[a] ?? Number.MAX_SAFE_INTEGER;
    const vb = embalagemVolumes[b] ?? Number.MAX_SAFE_INTEGER;
    return va - vb;
  });
}

export function formatEmbalagens(tipos: string[]): string {
  if (!tipos.length) return "—";
  return tipos
    .map((t) => (embalagemVolumes[t] != null ? fmtL(embalagemVolumes[t]) : t))
    .join(" · ");
}

export function useEmbalagensPorItem() {
  return useQuery({
    queryKey: ["embalagens-por-item"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("envase")
        .select("tipo_embalagem, lotes!inner(produto_id, microrganismo_id)");
      if (error) throw error;

      const prodMap = new Map<string, Set<string>>();
      const microMap = new Map<string, Set<string>>();

      ((data ?? []) as any[]).forEach((row) => {
        const tipo = row.tipo_embalagem as string;
        const lote = row.lotes;
        if (!tipo || !lote) return;
        if (lote.produto_id) {
          if (!prodMap.has(lote.produto_id)) prodMap.set(lote.produto_id, new Set());
          prodMap.get(lote.produto_id)!.add(tipo);
        }
        if (lote.microrganismo_id) {
          if (!microMap.has(lote.microrganismo_id)) microMap.set(lote.microrganismo_id, new Set());
          microMap.get(lote.microrganismo_id)!.add(tipo);
        }
      });

      const porProdutoId = new Map<string, string[]>();
      prodMap.forEach((s, k) => porProdutoId.set(k, sortTipos(s)));
      const porMicrorganismoId = new Map<string, string[]>();
      microMap.forEach((s, k) => porMicrorganismoId.set(k, sortTipos(s)));

      return { porProdutoId, porMicrorganismoId };
    },
  });
}
