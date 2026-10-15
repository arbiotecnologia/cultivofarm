/**
 * Catálogo da etapa Recomendação do assistente de visita (celular).
 * Colunas REAIS (information_schema canônico): microrganismos(nome, nome_cientifico); produtos(nome).
 *
 * - Nova seleção: RPC paginada, global-only e visível no tenant autorizado da visita.
 * - Visualização de recomendação vinculada/histórica: lê os nomes pelos IDs referenciados, sem filtro de ativo,
 *   para nunca apagar o histórico.
 */
export const REC_MICRO_SELECT = "id, nome, nome_cientifico";
export const REC_PRODUTO_SELECT = "id, nome, familia_catalogo";

export interface RecMicro { id: string; nome: string; nome_cientifico: string | null }
export interface RecProduto { id: string; nome: string; familia_catalogo?: string | null }

/** UX somente: o banco revalida seleção, disponibilidade e autorização. */
export function recCanForwardToLab(productId: string | null | undefined, microId: string | null | undefined,
  product: RecProduto | undefined, micro: RecMicro | undefined): boolean {
  if (productId && microId) return false;
  if (productId) return product?.id === productId && product.familia_catalogo === "biologico";
  return !!microId && micro?.id === microId;
}

export function recMicroLabel(m: RecMicro | undefined | null): string {
  if (!m) return "—";
  return m.nome_cientifico && m.nome_cientifico !== m.nome ? `${m.nome} (${m.nome_cientifico})` : m.nome;
}

export function recProdutoLabel(p: RecProduto | undefined | null): string {
  if (!p) return "—";
  const families: Record<string, string> = { biologico: "Biológico", quimico: "Químico", fertilizante: "Fertilizante/Adubo", fertilizante_adubo: "Fertilizante/Adubo" };
  return `${p.nome} · ${families[p.familia_catalogo ?? ""] ?? "Família não informada"}`;
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

export interface RecSelectionItem extends RecProduto { selectable: boolean; in_page: boolean; total: number | null }
export async function fetchRecSelection(client: import("@/lib/catalogo/tenantCatalogVisibility").RpcClient,
  registro: string, entity: "produto" | "microrganismo", search: string, offset: number, include: string[], signal: AbortSignal) {
  let request = client.rpc("tenant_catalog_visit_selection_page", {
    p_registro_id: registro, p_entity_type: entity, p_search: search.trim() || null,
    p_limit: 50, p_offset: offset, p_include_ids: include.length ? include : null,
  });
  if (typeof request.abortSignal === "function") request = request.abortSignal(signal);
  const { data, error } = await request;
  if (error) throw new Error("Não foi possível carregar o catálogo autorizado da visita.");
  if (!Array.isArray(data) || data.some(r => typeof r.id !== "string" || typeof r.nome !== "string"
    || typeof r.selectable !== "boolean" || typeof r.in_page !== "boolean")) throw new Error("Resposta do catálogo inválida.");
  return data as RecSelectionItem[];
}
