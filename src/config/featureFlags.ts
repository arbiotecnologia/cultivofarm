/**
 * Fase Fiscal 3.1 — Feature flags fiscais (tipadas, centralizadas, locais).
 *
 * Convenções:
 * - Defaults SEMPRE `false` em todos os ambientes.
 * - Nenhuma flag lê de `import.meta.env` público — flags NÃO são segredos e
 *   NÃO autorizam emissão. Ativação deliberada só via edição de código +
 *   revisão + testes.
 * - `fiscalEmissionEnabled` é uma TRAVA de segurança: precisa permanecer
 *   `false` até que a arquitetura de emissão (provedor, certificado,
 *   idempotência real, auditoria SEFAZ) esteja completa e homologada.
 *   Testes desta fase asseguram que ela permanece `false`.
 *
 * Tipagem: os valores são `boolean` (não literais) — permite que o app
 * atualize a flag por código deliberado sem invalidar comparações.
 */
export type FeatureFlagName =
  | "fiscalConfigurationUi"
  | "fiscalProductProfilesUi"
  | "fiscalServiceProfilesUi"
  | "fiscalEmissionEnabled";

export const FEATURE_FLAGS: Record<FeatureFlagName, boolean> = {
  /** Habilita a tela de Configuração Fiscal da Empresa e o item de menu associado. */
  fiscalConfigurationUi: false,
  /**
   * Fase Fiscal 3.2 — Habilita a tela de Perfis Fiscais de Produtos
   * (`/configuracoes/fiscal/produtos`). Isolada; NÃO autoriza emissão.
   */
  fiscalProductProfilesUi: false,
  /**
   * Fase Fiscal 3.3 — Habilita a tela de Perfis Fiscais de Serviços
   * (`/configuracoes/fiscal/servicos`). Isolada; NÃO autoriza emissão.
   * Não existe catálogo canônico de serviços — `source_reference` é a
   * referência transitória, `service_id` é opcional e sem FK.
   */
  fiscalServiceProfilesUi: false,
  /** TRAVA DE EMISSÃO. Nunca deve ser `true` nesta fase. Não conecta nada — apenas indica intenção. */
  fiscalEmissionEnabled: false,
};

export function isFeatureEnabled(name: FeatureFlagName): boolean {
  return FEATURE_FLAGS[name] === true;
}
