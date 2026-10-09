/** Optional attachments never replace persisted prerequisites or server permissions. */
export function wizardUnlockedUpTo(progress: { identificacao: boolean; checkin: boolean; campo: boolean; diagnostico: boolean; recomendacao: boolean }): number {
  if (!progress.identificacao) return 1;
  if (!progress.checkin) return 2;
  if (!progress.campo) return 3;
  if (!progress.diagnostico) return 4;
  if (!progress.recomendacao) return 5;
  return 8;
}
