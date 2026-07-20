import { supabase } from "@/integrations/supabase/client";
import type {
  CatalogSourceEntity,
  ConfidenceLevel,
  SourceType,
} from "@/hooks/useCatalogSources";

export interface SeedSourceRow {
  entidade_tipo: CatalogSourceEntity;
  entidade_id: string;
  fonte_titulo: string;
  fonte_url: string; // obrigatório para deduplicar
  fonte_tipo: SourceType;
  idioma_original?: string | null;
  pais_origem?: string | null;
  resumo_evidencia?: string | null;
  nivel_confianca?: ConfidenceLevel;
  data_consulta?: string | null;
  observacoes?: string | null;
}

/**
 * Faz upsert das fontes evitando duplicidade por (entidade_tipo, entidade_id, fonte_url).
 * Útil para importações e seeds posteriores. Não é executado automaticamente.
 */
function buildSourceKey(row: SeedSourceRow): string {
  const raw = `${row.entidade_tipo}:${row.entidade_id}:${row.fonte_url ?? row.fonte_titulo ?? ""}`.toLowerCase();
  // md5 via Web Crypto isn't sync; the DB trigger also computes source_key,
  // so we send a placeholder when md5 not available. The trigger overrides it.
  return raw;
}

/**
 * Faz upsert das fontes evitando duplicidade por source_key (hash de entidade + url/título).
 * O trigger no banco recalcula source_key, então enviamos um valor inicial qualquer.
 */
export async function upsertSources(rows: SeedSourceRow[]) {
  if (!rows.length) return { inserted: 0 };
  const payload = rows.map((r) => ({ ...r, source_key: buildSourceKey(r) }));
  const { error, data } = await supabase
    .from("catalog_technical_sources" as any)
    .upsert(payload as any, { onConflict: "source_key" })
    .select("id");
  if (error) throw error;
  return { inserted: data?.length ?? 0 };
}
