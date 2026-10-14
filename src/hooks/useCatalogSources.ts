import { assertGlobalCatalogWriteBlocked } from "@/lib/catalogo/globalCatalogWriteContainment";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const SOURCE_TYPES = [
  "artigo_cientifico",
  "revisao_cientifica",
  "orgao_oficial",
  "embrapa",
  "universidade",
  "fabricante",
  "patente",
  "boletim_tecnico",
  "outro",
] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

export const CONFIDENCE_LEVELS = ["alto", "medio", "baixo"] as const;
export type ConfidenceLevel = (typeof CONFIDENCE_LEVELS)[number];

export type CatalogSourceEntity =
  | "microrganismo"
  | "produto"
  | "ficha_microrganismo"
  | "ficha_produto";

export interface CatalogSource {
  id: string;
  entidade_tipo: CatalogSourceEntity;
  entidade_id: string;
  fonte_titulo: string;
  fonte_url: string | null;
  fonte_tipo: SourceType;
  idioma_original: string | null;
  pais_origem: string | null;
  resumo_evidencia: string | null;
  nivel_confianca: ConfidenceLevel;
  data_consulta: string | null;
  observacoes: string | null;
  created_at: string;
  updated_at: string;
}

export function useCatalogSources(
  entidadeTipo: CatalogSourceEntity | null | undefined,
  entidadeId: string | null | undefined,
) {
  return useQuery({
    queryKey: ["catalog-sources", entidadeTipo, entidadeId],
    enabled: !!entidadeTipo && !!entidadeId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("catalog_technical_sources" as any)
        .select("*")
        .eq("entidade_tipo", entidadeTipo!)
        .eq("entidade_id", entidadeId!)
        .order("data_consulta", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return ((data ?? []) as unknown) as CatalogSource[];
    },
  });
}

export function useUpsertCatalogSource(
  entidadeTipo: CatalogSourceEntity,
  entidadeId: string,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      payload: Partial<CatalogSource> & { fonte_titulo: string; fonte_tipo: SourceType },
    ) => {
      assertGlobalCatalogWriteBlocked();
      const { id, ...rest } = payload;
      const row: any = { ...rest, entidade_tipo: entidadeTipo, entidade_id: entidadeId };
      if (id) {
        const { error } = await supabase
          .from("catalog_technical_sources" as any)
          .update(row)
          .eq("id", id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("catalog_technical_sources" as any).insert(row);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["catalog-sources", entidadeTipo, entidadeId] });
      qc.invalidateQueries({ queryKey: ["effective-catalog-sources"] });
      qc.invalidateQueries({ queryKey: ["catalogo-tecnico"] });
    },
  });
}

export function useDeleteCatalogSource(
  entidadeTipo: CatalogSourceEntity,
  entidadeId: string,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      assertGlobalCatalogWriteBlocked();
      const { error } = await supabase
        .from("catalog_technical_sources" as any)
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["catalog-sources", entidadeTipo, entidadeId] });
      qc.invalidateQueries({ queryKey: ["effective-catalog-sources"] });
      qc.invalidateQueries({ queryKey: ["catalogo-tecnico"] });
    },
  });
}

export const SOURCE_TYPE_LABEL: Record<SourceType, string> = {
  artigo_cientifico: "Artigo científico",
  revisao_cientifica: "Revisão científica",
  orgao_oficial: "Órgão oficial",
  embrapa: "Embrapa",
  universidade: "Universidade",
  fabricante: "Fabricante",
  patente: "Patente",
  boletim_tecnico: "Boletim técnico",
  outro: "Outro",
};

export const CONFIDENCE_LABEL: Record<ConfidenceLevel, string> = {
  alto: "Alto",
  medio: "Médio",
  baixo: "Baixo",
};
