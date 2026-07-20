import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { CatalogSource } from "@/hooks/useCatalogSources";

type Kind = "micro" | "produto";

/**
 * Returns catalog technical sources linked either to the main entity
 * (microrganismo/produto) or to its technical profile (ficha_microrganismo/ficha_produto),
 * de-duplicated by id.
 */
export function useEffectiveCatalogSources(
  kind: Kind,
  entityId: string | null | undefined,
  profileId: string | null | undefined,
) {
  const entityType = kind === "micro" ? "microrganismo" : "produto";
  const profileType = kind === "micro" ? "ficha_microrganismo" : "ficha_produto";

  const query = useQuery({
    queryKey: ["effective-catalog-sources", entityType, entityId, profileType, profileId],
    enabled: !!entityId,
    queryFn: async (): Promise<CatalogSource[]> => {
      const ids: { tipo: string; id: string }[] = [];
      if (entityId) ids.push({ tipo: entityType, id: entityId });
      if (profileId) ids.push({ tipo: profileType, id: profileId });

      const results = await Promise.all(
        ids.map(({ tipo, id }) =>
          supabase
            .from("catalog_technical_sources" as any)
            .select("*")
            .eq("entidade_tipo", tipo)
            .eq("entidade_id", id),
        ),
      );

      const merged = new Map<string, CatalogSource>();
      results.forEach(({ data }) => {
        ((data ?? []) as unknown as CatalogSource[]).forEach((s) => {
          if (!merged.has(s.id)) merged.set(s.id, s);
        });
      });
      return Array.from(merged.values());
    },
  });

  const sources = query.data ?? [];
  return {
    sources,
    count: sources.length,
    hasSources: sources.length > 0,
    isLoading: query.isLoading,
    refetch: query.refetch,
  };
}
