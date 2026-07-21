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
  | "fiscalCustomerProfilesUi"
  | "fiscalDocumentWorkflowUi"
  | "fiscalDocumentManualEventRpc"
  | "fiscalReconciliationUi"
  | "fiscalReconciliationWrite"
  | "fiscalReadinessCenterUi"
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
  /**
   * Fase Fiscal 3.4 — Habilita a tela de Perfis Fiscais de Clientes
   * (`/configuracoes/fiscal/clientes`). Isolada; NÃO autoriza emissão.
   * Vinculada 1:1 a `clientes.id` via FK real.
   */
  fiscalCustomerProfilesUi: false,
  /**
   * Fase Fiscal 3.5 — Habilita a rota `/fiscal/documentos` (workflow
   * documental manual e auditável). Nunca expõe emissão. Item de menu só
   * aparece com esta flag em `true`, o que NÃO é o caso nesta fase.
   */
  fiscalDocumentWorkflowUi: false,
  /**
   * Fase Fiscal 3.5 — Gate secundário para permitir chamar
   * `rpc_fiscal_event_manual` a partir da UI. Mantido `false` até
   * validação em runtime de staging (auth, papéis e event_type).
   * A trava de emissão (`fiscalEmissionEnabled`) permanece independente.
   */
  fiscalDocumentManualEventRpc: false,
  /**
   * Fase Fiscal 3.6 — Habilita a rota `/fiscal/reconciliacao` (fila +
   * relatório interno somente leitura). Nunca autoriza emissão nem
   * mutações. Menu só é exposto quando true (não é o caso nesta fase).
   */
  fiscalReconciliationUi: false,
  /**
   * Fase Fiscal 3.6 — Gate secundário para ações de vínculo/desvínculo
   * assistido em `fiscal_invoices` (nunca em AR/entregas). Mantido
   * `false` até certificação de staging cobrindo policies, locked_at
   * e disponibilidade da RPC de eventos manuais.
   */
  fiscalReconciliationWrite: false,
  /**
   * Fase Fiscal 3.7 — Habilita a rota `/fiscal/prontidao` (Central de
   * Prontidão para Homologação — SOMENTE LEITURA). Nunca autoriza
   * emissão, escrita ou mutação. Menu só é exposto quando `true`
   * (não é o caso nesta fase). Fonte exclusiva: as 5 views fiscais
   * canônicas já tipadas.
   */
  fiscalReadinessCenterUi: false,
  /** TRAVA DE EMISSÃO. Nunca deve ser `true` nesta fase. Não conecta nada — apenas indica intenção. */
  fiscalEmissionEnabled: false,
};

export function isFeatureEnabled(name: FeatureFlagName): boolean {
  return FEATURE_FLAGS[name] === true;
}
