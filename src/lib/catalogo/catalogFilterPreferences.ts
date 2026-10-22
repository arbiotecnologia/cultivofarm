import type { CatalogTipoFiltro, CatalogStatusFiltro } from "@/components/protocolos/CatalogSearchFilters";
import type { CatalogFamilyFilter } from "@/lib/catalogo/catalogFamilyRead";
import { createContext } from "react";

export interface CatalogFilterPreferences {
  search: string;
  tipo: CatalogTipoFiltro;
  family: CatalogFamilyFilter;
  status: CatalogStatusFiltro;
  b2b: "todos" | "sim" | "nao";
  sort: "nome_asc" | "nome_desc" | "tipo" | "codigo";
}
export const defaultCatalogFilters = (): CatalogFilterPreferences => ({
  search: "", tipo: "todos", family: "todos", status: "todos", b2b: "todos", sort: "nome_asc",
});
export interface CatalogFilterBinding {
  initial: CatalogFilterPreferences;
  onChange: (filters: CatalogFilterPreferences) => void;
}

/** Layout-local, volatile preferences ONLY. Never rows, drawers, grants or request scope.
 * undefined partner = unresolved pause; null = resolved missing link, which clears.
 * Identity deliberately excludes lease/readiness/authzEpoch: these still fence all readers.
 */
export function createCatalogFilterMemory() {
  let identity: string | null = null;
  let partner: string | null = null;
  let generation = 0;
  let filters = defaultCatalogFilters();
  return {
    bind(nextIdentity: string | null, nextPartner: string | null | undefined): CatalogFilterBinding {
      if (identity !== nextIdentity || nextIdentity === null || nextPartner === null ||
        (nextPartner !== undefined && partner !== nextPartner)) {
        identity = nextIdentity;
        partner = nextPartner ?? null;
        filters = defaultCatalogFilters();
        generation += 1;
      }
      const captured = generation;
      return { initial: { ...filters }, onChange: next => {
        if (captured === generation && identity !== null && partner !== null) {
          filters = { search: next.search, tipo: next.tipo, family: next.family,
            status: next.status, b2b: next.b2b, sort: next.sort };
        }
      } };
    },
  };
}
/** Existing B2B guard owns this above the epoch boundary, which remounts layouts. */
export const CatalogFilterMemoryContext = createContext<ReturnType<typeof createCatalogFilterMemory> | null>(null);