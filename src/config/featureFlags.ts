/**
 * Fase Fiscal 3.15 — Feature flags fiscais.
 *
 * NESTA FASE: apenas `fiscalConfigurationUi` é liberada (Central de
 * Configuração Fiscal — SEM emissão). Todas as demais flags — inclusive
 * as de workflow, reconciliação e a TRAVA `fiscalEmissionEnabled` —
 * permanecem `false`.
 */
export type FeatureFlagName =
  | "fiscalConfigurationUi"
  | "fiscalProductProfilesUi"
  | "fiscalServiceProfilesUi"
  | "fiscalCustomerProfilesUi"
  | "fiscalDocumentWorkflowUi"
  | "fiscalDocumentManualEventRpc"
  | "fiscalReconciliationUi"
  | "fiscalReconciliationWrite"
  | "fiscalReadinessCenterUi"
  | "fiscalEmissionEnabled";

export const FEATURE_FLAGS: Record<FeatureFlagName, boolean> = {
  /**
   * Fase Fiscal 3.15 — Central de Configuração Fiscal.
   * Liberada para que o administrador prepare NF-e/NFS-e no momento
   * correto. NÃO autoriza emissão nem conexão com provedor.
   */
  fiscalConfigurationUi: true,
  fiscalProductProfilesUi: false,
  fiscalServiceProfilesUi: false,
  fiscalCustomerProfilesUi: false,
  fiscalDocumentWorkflowUi: false,
  fiscalDocumentManualEventRpc: false,
  fiscalReconciliationUi: false,
  fiscalReconciliationWrite: false,
  fiscalReadinessCenterUi: false,
  /** TRAVA DE EMISSÃO — permanece `false` nesta fase. */
  fiscalEmissionEnabled: false,
};

export function isFeatureEnabled(name: FeatureFlagName): boolean {
  return FEATURE_FLAGS[name] === true;
}
