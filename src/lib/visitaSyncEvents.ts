/**
 * Eventos locais de sincronização do Wizard Mobile de Visita Técnica.
 * Uso apenas para UX — nunca como autorização.
 */

export const TECHNICAL_VISIT_SYNCED_EVENT = "technical-visit-synced";

export interface TechnicalVisitSyncedDetail {
  localId: string;
  clientUuid: string;
  remoteId: string;
  version?: number | null;
}

export function emitTechnicalVisitSynced(detail: TechnicalVisitSyncedDetail) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<TechnicalVisitSyncedDetail>(TECHNICAL_VISIT_SYNCED_EVENT, { detail })
  );
}
