/**
 * Fase S4 (transição S3→S4) — lógica pura da tela "Meu Plano".
 *
 * Compõe o catálogo (módulos/funcionalidades) com os entitlements efetivos da
 * empresa (`get_my_entitlements`) para exibição SOMENTE LEITURA. Nenhuma
 * decisão de autorização nasce daqui — o gate real continua no servidor
 * (RPCs/triggers) e no `featureRouteMap`/`RoleGuard`.
 */

export interface CatalogoFeature {
  id: string;
  module_id: string;
  key: string;
  name: string;
  active: boolean;
}

export interface CatalogoModulo {
  id: string;
  key: string;
  name: string;
  active: boolean;
}

export interface EntitlementEfetivo {
  module_key: string;
  feature_key: string;
  limit_value: number | null;
}

export interface FeatureExibicao {
  key: string;
  name: string;
  incluida: boolean;
  limitValue: number | null;
}

export interface ModuloExibicao {
  key: string;
  name: string;
  features: FeatureExibicao[];
}

export const STATUS_ASSINATURA_LABEL: Record<string, string> = {
  TRIAL: "Período de teste",
  ACTIVE: "Ativa",
  PAST_DUE: "Pagamento em atraso",
  SUSPENDED: "Suspensa",
  CANCELLED: "Cancelada",
  EXPIRED: "Expirada",
};

/**
 * Agrupa o catálogo por módulo e marca o que a empresa tem direito de usar.
 * Funcionalidades inativas do catálogo não aparecem; entitlement órfão
 * (feature fora do catálogo) é ignorado — a tela é informativa, nunca amplia.
 */
export function comporModulos(
  modulos: CatalogoModulo[],
  features: CatalogoFeature[],
  entitlements: EntitlementEfetivo[],
): ModuloExibicao[] {
  const porChave = new Map(entitlements.map((e) => [e.feature_key, e]));
  const featuresPorModulo = new Map<string, CatalogoFeature[]>();
  for (const f of features) {
    if (!f.active) continue;
    const arr = featuresPorModulo.get(f.module_id) ?? [];
    arr.push(f);
    featuresPorModulo.set(f.module_id, arr);
  }
  return modulos
    .filter((m) => m.active)
    .map((m) => ({
      key: m.key,
      name: m.name,
      features: (featuresPorModulo.get(m.id) ?? [])
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
        .map((f) => ({
          key: f.key,
          name: f.name,
          incluida: porChave.has(f.key),
          limitValue: porChave.get(f.key)?.limit_value ?? null,
        })),
    }))
    .filter((m) => m.features.length > 0);
}

/** Total de funcionalidades incluídas (para o resumo do cartão). */
export function totalIncluidas(modulos: ModuloExibicao[]): number {
  return modulos.reduce(
    (acc, m) => acc + m.features.filter((f) => f.incluida).length,
    0,
  );
}

/** Formata o limite contratado da funcionalidade, se houver. */
export function formatarLimite(valor: number | null): string | null {
  if (valor === null || valor === undefined || Number.isNaN(Number(valor)))
    return null;
  return Number(valor).toLocaleString("pt-BR");
}
