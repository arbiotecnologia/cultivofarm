/**
 * Feature flags do Módulo de Comunicação (frontend).
 *
 * Fonte única: `FEATURE_FLAGS`, que lê `import.meta.env.VITE_*`.
 *   - `VITE_COMUNICACAO_MODULE_ENABLED === "true"` → módulo visível.
 *   - `VITE_COMUNICACAO_BROADCAST_TAB_ENABLED === "true"` → aba Comunicados.
 * Default é sempre `false` (ausência ou valor diverso).
 *
 * Gestores veem em modo somente leitura; administradores podem publicar.
 * O gate de permissão real está na RPC (has_role).
 */
import { isFeatureEnabled } from "@/config/featureFlags";

export function isComunicacaoModuleEnabled(): boolean {
  return isFeatureEnabled("comunicacaoModule");
}

export function isComunicacaoBroadcastTabEnabled(): boolean {
  return isFeatureEnabled("comunicacaoModule") && isFeatureEnabled("comunicacaoBroadcastTab");
}
