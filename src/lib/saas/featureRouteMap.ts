/**
 * Fase S3 — mapa rota → funcionalidade SaaS (chave da funcionalidade no catálogo).
 *
 * Gate ADICIONAL aos guards de perfil: nunca libera o que o perfil não libera.
 * Rotas sem mapeamento (dashboards gerais, cadastros, administração) não são
 * afetadas pelo plano. A autoridade real permanece no servidor.
 */
const PREFIXOS: ReadonlyArray<readonly [string, string]> = [
  ["/operacao/dashboard-producao", "ordens_producao"],
  ["/operacao/planejamento", "ordens_producao"],
  ["/cockpit-laboratorio", "ordens_producao"],
  ["/ordens-servico", "ordens_producao"],
  ["/lotes", "lotes_qualidade"],
  ["/controle-qualidade", "lotes_qualidade"],
  ["/envase", "envase"],
  ["/estoque", "estoque_embalagens"],
  ["/base-tecnica", "catalogo_precos"],
  ["/comercial/condicoes-pagamento", "catalogo_precos"],
  ["/comercial/pedidos-b2b", "pedidos_b2b"],
  ["/comercial/solicitacoes-b2b", "pedidos_b2b"],
  ["/comercial/simulador", "simulacoes"],
  ["/visita-tecnica", "visitas_tecnicas"],
  ["/agenda-tecnica", "visitas_tecnicas"],
  ["/monitoramento-alertas", "recomendacoes_alertas"],
  ["/previsao-agronomica", "recomendacoes_alertas"],
  ["/financeiro/receber", "contas_receber"],
  ["/financeiro/pagar", "contas_pagar"],
  ["/financeiro/fluxo-caixa", "fluxo_caixa"],
  ["/financeiro/notas-fiscais", "emissao_nfe_nfse"],
  ["/fiscal", "emissao_nfe_nfse"],
  ["/comunicacao", "envios_automaticos"],
  ["/dashboard/executivo", "paineis_executivos"],
  ["/executivo", "paineis_executivos"],
  ["/bi-agronomico", "paineis_executivos"],
  ["/bi-operacional", "paineis_executivos"],
  ["/relatorios", "relatorios_operacionais"],
  // Portais especializados — somente correspondências inequívocas.
  ["/app/visita", "visitas_tecnicas"],
  ["/app/checkin", "visitas_tecnicas"],
  ["/portal-parceiro/pedidos", "pedidos_b2b"],
  ["/portal-parceiro/solicitacoes", "pedidos_b2b"],
  ["/portal-parceiro/novo", "pedidos_b2b"],
  ["/portal-parceiro/catalogo", "catalogo_precos"],
  ["/portal-parceiro/simulador", "simulacoes"],
  ["/portal-parceiro/simulacoes", "simulacoes"],
  ["/portal-parceiro/simulacoes-equipe", "simulacoes"],
  ["/portal-parceiro/fichas", "fichas_tecnicas"],
];

/** Funcionalidade exigida pela rota, ou null se a rota não depende de plano. */
export function featureForPath(path: string): string | null {
  const limpo = path.split("?")[0].replace(/\/+$/, "") || "/";
  for (const [prefixo, feature] of PREFIXOS) {
    if (limpo === prefixo || limpo.startsWith(prefixo + "/")) return feature;
  }
  return null;
}

export type EntitlementState =
  | { status: "loading" | "error" }
  | { status: "legacy_unversioned" | "blocked" | "no_subscription" }
  | { status: "platform_superadmin" }
  | { status: "ready"; features: ReadonlySet<string> };

/**
 * Decide se o plano permite a rota. Carregamento ou erro ficam fail-closed
 * nas rotas contratáveis; rotas fora do mapa continuam inalteradas.
 */
export function isPathEntitled(path: string, state: EntitlementState): boolean {
  const feature = featureForPath(path);
  if (!feature) return true;
  if (state.status === "platform_superadmin") return true;
  if (state.status !== "ready") return false;
  return state.features.has(feature);
}
