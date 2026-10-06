/**
 * Fase Fiscal 3.16 — Feature flags fiscais.
 *
 * NESTA FASE liberamos apenas o necessário para PREPARAÇÃO/HOMOLOGAÇÃO:
 * `fiscalConfigurationUi`, perfis (produtos/serviços/clientes), workflow
 * de rascunho e a Central de Prontidão (somente leitura).
 *
 * Permanecem `false`: `fiscalReconciliationUi`, `fiscalReconciliationWrite`,
 * `fiscalDocumentManualEventRpc` (eventos manuais aguardam certificação
 * dedicada) e a TRAVA `fiscalEmissionEnabled`.
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
  | "fiscalEmissionEnabled"
  | "comunicacaoModule"
  | "comunicacaoBroadcastTab"
  | "saasPaymentsOperational";

export const FEATURE_FLAGS: Record<FeatureFlagName, boolean> = {
  /** Central de Configuração Fiscal (Fase 3.15). */
  fiscalConfigurationUi: true,
  /** Perfis fiscais de produtos (Fase 3.2) — liberados em 3.16. */
  fiscalProductProfilesUi: true,
  /** Perfis fiscais de serviços (Fase 3.3) — liberados em 3.16. */
  fiscalServiceProfilesUi: true,
  /** Perfis fiscais de clientes (Fase 3.4) — liberados em 3.16. */
  fiscalCustomerProfilesUi: true,
  /** Wizard de rascunho NF-e/NFS-e (Fase 3.5 + 3.16). */
  fiscalDocumentWorkflowUi: true,
  /** RPC de eventos manuais — permanece `false` até certificação dedicada. */
  fiscalDocumentManualEventRpc: false,
  /** Reconciliação assistida — permanece leitura interna, sem UI liberada. */
  fiscalReconciliationUi: false,
  fiscalReconciliationWrite: false,
  /** Central de Prontidão (Fase 3.7) — liberada em 3.16 (somente leitura). */
  fiscalReadinessCenterUi: true,
  /** TRAVA DE EMISSÃO — permanece `false` em toda esta fase. */
  fiscalEmissionEnabled: false,
  /**
   * Módulo de Comunicação (Fase 1) — fonte única de verdade.
   * Habilita-se EXCLUSIVAMENTE via `VITE_COMUNICACAO_MODULE_ENABLED === "true"`.
   * Ausente ou diferente disso ⇒ `false`. Rota, guard e menu consomem este valor.
   */
  comunicacaoModule: readComunicacaoModuleEnvFlag(),
  /**
   * Aba de Broadcast administrativo (Fase 2). Só aparece quando o
   * módulo estiver habilitado E esta flag específica for `true`.
   */
  comunicacaoBroadcastTab: readComunicacaoBroadcastTabEnvFlag(),
  /** Fundação criada, porém nenhuma cobrança ou integração externa pode operar. */
  saasPaymentsOperational: false,
};

function readComunicacaoModuleEnvFlag(): boolean {
  try {
    return import.meta.env.VITE_COMUNICACAO_MODULE_ENABLED === "true";
  } catch {
    return false;
  }
}

function readComunicacaoBroadcastTabEnvFlag(): boolean {
  try {
    return import.meta.env.VITE_COMUNICACAO_BROADCAST_TAB_ENABLED === "true";
  } catch {
    return false;
  }
}

export function isFeatureEnabled(name: FeatureFlagName): boolean {
  return FEATURE_FLAGS[name] === true;
}
