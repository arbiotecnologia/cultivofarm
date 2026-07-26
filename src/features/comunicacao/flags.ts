/**
 * Feature flag do Módulo de Comunicação (frontend).
 * Padrão: DESLIGADO. Só liga se VITE_COMUNICACAO_MODULE_ENABLED === "true".
 */
export function isComunicacaoModuleEnabled(): boolean {
  try {
    return import.meta.env?.VITE_COMUNICACAO_MODULE_ENABLED === "true";
  } catch {
    return false;
  }
}
