/**
 * Catálogo da etapa Recomendação do assistente de visita (celular).
 * Colunas REAIS (information_schema canônico): microrganismos(nome, nome_cientifico); produtos(nome).
 *
 * - Nova seleção: somente itens ativos. NÃO aplica a ocultação por empresa (não integrada neste seletor).
 * - Visualização de recomendação vinculada/histórica: lê os nomes pelos IDs referenciados, sem filtro de ativo,
 *   para nunca apagar o histórico.
 */
export const REC_MICRO_SELECT = "id, nome, nome_cientifico";
export const REC_PRODUTO_SELECT = "id, nome";

export interface RecMicro { id: string; nome: string; nome_cientifico: string | null }
export interface RecProduto { id: string; nome: string }

export function recMicroLabel(m: RecMicro | undefined | null): string {
  if (!m) return "—";
  return m.nome_cientifico && m.nome_cientifico !== m.nome ? `${m.nome} (${m.nome_cientifico})` : m.nome;
}

export function recProdutoLabel(p: RecProduto | undefined | null): string {
  return p?.nome || "—";
}

/** IDs referenciados pelas recomendações já registradas (sem nulos/duplicatas, ordenados para cache). */
export function recReferencedIds(rows: ReadonlyArray<{ microrganismo_id?: string | null; produto_biologico_sugerido_id?: string | null }>) {
  const micro = new Set<string>(); const prod = new Set<string>();
  for (const r of rows) {
    if (r.microrganismo_id) micro.add(r.microrganismo_id);
    if (r.produto_biologico_sugerido_id) prod.add(r.produto_biologico_sugerido_id);
  }
  return { micro: [...micro].sort(), prod: [...prod].sort() };
}

/**
 * Opções do seletor: itens ativos + o valor atual do formulário, se ele não estiver entre os ativos
 * (aparece desativado, apenas para leitura — não é nova seleção).
 */
export function recSelectOptions<T extends { id: string }>(active: readonly T[], current: string | null | undefined, historic: ReadonlyMap<string, T>) {
  const opts = active.map((item) => ({ item, selectable: true }));
  if (current && !active.some((a) => a.id === current)) {
    const h = historic.get(current);
    if (h) opts.push({ item: h, selectable: false });
  }
  return opts;
}

export function recCatalogErrorMessage(err: unknown): string {
  const msg = (err as { message?: string } | null)?.message ?? "";
  return msg ? `Não foi possível carregar o catálogo: ${msg}` : "Não foi possível carregar o catálogo.";
}
