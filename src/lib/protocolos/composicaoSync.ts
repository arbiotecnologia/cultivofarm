/**
 * Helpers puros para sincronizar a composição técnica de um produto na tabela
 * `formulacoes`. Separados do componente para serem testáveis em isolamento.
 */

export interface ComposicaoItem {
  microrganismo_id: string | null;
  component_insumo_id: string | null;
  volume_ml: number;
  proporcao: number | null;
  e_volume_fixo: boolean;
}

export interface FormulacaoInsert {
  produto_id: string;
  microrganismo_id: string | null;
  component_insumo_id: string | null;
  volume_ml: number;
  proporcao: number | null;
  e_volume_fixo: boolean;
  unidade: "mL";
}

/**
 * Limpa a composição vinda do formulário:
 * 1. descarta linhas sem `microrganismo_id` e sem `component_insumo_id` (rows "Selecionar…" vazias);
 * 2. deduplica por `microrganismo_id` (mantém a última ocorrência) para evitar
 *    a violação do índice `UNIQUE (produto_id, microrganismo_id)`;
 * 3. preserva todos os rows de insumo (microrganismo_id == null) sem deduplicar.
 */
export function sanitizeComposicao(items: ComposicaoItem[]): ComposicaoItem[] {
  const valid = items.filter(
    (c) =>
      (typeof c.microrganismo_id === "string" && c.microrganismo_id.trim() !== "") ||
      (typeof c.component_insumo_id === "string" && c.component_insumo_id.trim() !== ""),
  );
  const microMap = new Map<string, ComposicaoItem>();
  const insumos: ComposicaoItem[] = [];
  for (const c of valid) {
    if (c.microrganismo_id) microMap.set(c.microrganismo_id, c);
    else insumos.push(c);
  }
  return [...microMap.values(), ...insumos];
}

/** Monta o payload pronto para `supabase.from("formulacoes").insert(...)`. */
export function buildFormulacoesPayload(
  produtoId: string,
  items: ComposicaoItem[],
): FormulacaoInsert[] {
  return sanitizeComposicao(items).map((c) => ({
    produto_id: produtoId,
    microrganismo_id: c.microrganismo_id || null,
    component_insumo_id: c.component_insumo_id || null,
    volume_ml: c.volume_ml,
    proporcao: c.proporcao || null,
    e_volume_fixo: c.e_volume_fixo,
    unidade: "mL",
  }));
}
