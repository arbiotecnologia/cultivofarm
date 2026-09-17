/**
 * Identidade oficial do produto.
 *
 * Fonte única para nome, nome curto e slogan. Nomes históricos de documentos
 * já emitidos, migrations e auditorias NÃO são reescritos a partir daqui.
 */
export const APP_NAME = "Cultivo Farm" as const;
export const APP_SHORT_NAME = "Cultivo Farm" as const;
export const APP_SLOGAN = "Tecnologia que cultiva resultados" as const;

/** Título padrão de páginas/documentos gerados pelo sistema. */
export function brandTitle(section?: string): string {
  return section ? `${section} | ${APP_NAME}` : APP_NAME;
}
