import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fmtL } from "@/lib/envaseFormat";
import { brl } from "@/lib/financial/format";

export interface CatalogoVolume {
  id: string;
  item_tipo: "produto" | "microrganismo";
  produto_id: string | null;
  microrganismo_id: string | null;
  volume_ml: number;
  rotulo: string | null;
  preco_brl: number;
  moeda: string;
  ativo: boolean;
  ordem: number;
  updated_at?: string | null;
  preco_litro_brl?: number | null;
  valor_dose_100ml_brl?: number | null;
  doses_por_volume?: number | null;
}

export function formatVolumeLabel(v: Pick<CatalogoVolume, "volume_ml" | "rotulo">): string {
  if (v.rotulo && v.rotulo.trim()) return v.rotulo.trim();
  return fmtL(v.volume_ml);
}

export function precoPorLitro(v: Pick<CatalogoVolume, "volume_ml" | "preco_brl" | "preco_litro_brl">): number {
  if (v.preco_litro_brl != null) return Number(v.preco_litro_brl);
  const litros = v.volume_ml / 1000;
  if (!litros) return 0;
  return v.preco_brl / litros;
}

export function valorDose100ml(v: Pick<CatalogoVolume, "volume_ml" | "preco_brl" | "preco_litro_brl" | "valor_dose_100ml_brl">): number {
  if (v.valor_dose_100ml_brl != null) return Number(v.valor_dose_100ml_brl);
  return precoPorLitro(v) / 10;
}

export function dosesPorVolume(v: Pick<CatalogoVolume, "volume_ml" | "doses_por_volume">): number {
  if (v.doses_por_volume != null) return Number(v.doses_por_volume);
  return v.volume_ml / 100;
}

export function formatPrecoLitro(v: Pick<CatalogoVolume, "volume_ml" | "preco_brl" | "preco_litro_brl">): string {
  return `${brl(precoPorLitro(v))}/L`;
}

export function formatDose100ml(v: Pick<CatalogoVolume, "volume_ml" | "preco_brl" | "preco_litro_brl" | "valor_dose_100ml_brl">): string {
  return `${brl(valorDose100ml(v))} / 100 mL`;
}

export function formatVolumesCatalogo(list: CatalogoVolume[]): string {
  if (!list.length) return "Não informado";
  return list
    .filter((v) => v.ativo)
    .map((v) => {
      const doses = Math.round(dosesPorVolume(v));
      return `${formatVolumeLabel(v)} — ${brl(v.preco_brl)} · ${formatPrecoLitro(v)} · ${formatDose100ml(v)} · ${doses} doses`;
    })
    .join(" · ");
}

function sortVolumes(list: CatalogoVolume[]): CatalogoVolume[] {
  return [...list].sort((a, b) => {
    if (a.ordem !== b.ordem) return a.ordem - b.ordem;
    return a.volume_ml - b.volume_ml;
  });
}

export function useCatalogoVolumes() {
  return useQuery({
    queryKey: ["catalogo-volumes"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("catalogo_volumes" as any)
        .select("*")
        .eq("ativo", true);
      if (error) throw error;
      const rows = ((data ?? []) as any[]).map((r) => ({
        ...r,
        volume_ml: Number(r.volume_ml),
        preco_brl: Number(r.preco_brl),
        ordem: Number(r.ordem ?? 0),
      })) as CatalogoVolume[];

      const porProdutoId = new Map<string, CatalogoVolume[]>();
      const porMicrorganismoId = new Map<string, CatalogoVolume[]>();
      rows.forEach((v) => {
        if (v.produto_id) {
          const arr = porProdutoId.get(v.produto_id) ?? [];
          arr.push(v);
          porProdutoId.set(v.produto_id, arr);
        }
        if (v.microrganismo_id) {
          const arr = porMicrorganismoId.get(v.microrganismo_id) ?? [];
          arr.push(v);
          porMicrorganismoId.set(v.microrganismo_id, arr);
        }
      });
      porProdutoId.forEach((arr, k) => porProdutoId.set(k, sortVolumes(arr)));
      porMicrorganismoId.forEach((arr, k) => porMicrorganismoId.set(k, sortVolumes(arr)));

      return { porProdutoId, porMicrorganismoId, rows };
    },
  });
}
