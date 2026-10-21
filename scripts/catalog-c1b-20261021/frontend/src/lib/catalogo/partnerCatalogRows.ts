import type { CatalogItem } from "../../hooks/usePartnerCatalog";
import type { CatalogoUnificadoRow } from "@/hooks/useCatalogoUnificado";

/** Only a projection of authorized RPC rows, never an additional catalogue read. */
export function partnerCatalogRows(items: readonly CatalogItem[]): CatalogoUnificadoRow[] {
  return items.map(item => ({
    id: item.item_id, tipo: item.item_tipo, nome: item.nome, codigo: item.codigo,
    subtitulo: null, funcao: null, ativo: true, b2b_enabled: true,
    ficha_status: item.ficha_status, ficha_resumo: item.resumo_curto,
    explicacao_b2b: item.explicacao_b2b, beneficios_agronomicos: item.beneficios_principais,
    explicacao_produtor: null, explicacao_tecnica: null, mecanismo_acao: null,
    fontes_count: 0, alvos_count: 0,
    // Internal fields and financial values do not enter the read-only sheet.
    raw: { familia_catalogo: item.familia_catalogo },
  }));
}