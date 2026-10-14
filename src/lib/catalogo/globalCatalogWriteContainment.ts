/**
 * Contenção de escrita do catálogo técnico GLOBAL (migrations externas
 * 20261014183555 global_catalog_descendants_write_containment e
 * global_catalog_sources_versions_write_containment).
 *
 * Fichas, fontes, alvos, culturas, versões, volumes, problemas e parâmetros
 * de CQ são globais (sem owner). Perfis de empresa apenas consultam.
 * Não existe writer auditado de plataforma para esses descendentes; até que
 * exista, qualquer caminho de UI que tente gravar deve falhar explicitamente
 * ANTES de chamar o banco — nunca reportar sucesso com 0 linhas.
 */
export const GLOBAL_CATALOG_WRITE_BLOCKED_MESSAGE =
  "Catálogo técnico global disponível somente para consulta. Alterações exigem fluxo auditado da plataforma, ainda não disponível.";

export class GlobalCatalogWriteBlockedError extends Error {
  constructor() {
    super(GLOBAL_CATALOG_WRITE_BLOCKED_MESSAGE);
    this.name = "GlobalCatalogWriteBlockedError";
  }
}

/** Sempre lança. Chamar no início de qualquer mutação de catálogo global. */
export function assertGlobalCatalogWriteBlocked(): never {
  throw new GlobalCatalogWriteBlockedError();
}

/** Capacidade de edição de catálogo global pela UI de empresa: sempre false. */
export const TENANT_CAN_EDIT_GLOBAL_CATALOG = false as const;
