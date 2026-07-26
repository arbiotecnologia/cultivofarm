/**
 * Feature flag do Módulo de Comunicação (frontend).
 *
 * Fonte única de verdade: `FEATURE_FLAGS.comunicacaoModule`, que por sua vez
 * lê `import.meta.env.VITE_COMUNICACAO_MODULE_ENABLED === "true"` (default
 * `false` quando ausente). Rota, guard, menu e qualquer consumidor devem
 * chamar `isComunicacaoModuleEnabled()` ou `isFeatureEnabled("comunicacaoModule")`.
 */
import { isFeatureEnabled } from "@/config/featureFlags";

export function isComunicacaoModuleEnabled(): boolean {
  return isFeatureEnabled("comunicacaoModule");
}
