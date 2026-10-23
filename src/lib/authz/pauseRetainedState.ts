// Retenção VOLÁTIL de estado de UI não autoritativo durante uma pausa
// transitória de autorização (timeout do monitor → conteúdo oculto →
// recuperação com o MESMO fingerprint).
//
// Limites (fail-closed preservado):
// * Somente memória de processo: nunca localStorage/sessionStorage/IndexedDB.
// * A chave inclui identidade (usuário/organização/papéis) e a ÉPOCA de
//   autorização. Revogação ou troca de vínculo mudam a época e tornam o
//   estado retido inalcançável — nada é restaurado após mudança real.
// * Nada é EXIBIDO enquanto a autorização está expirada: o boundary continua
//   ocultando o conteúdo; o estado retido apenas re-semeia a UI depois de
//   uma nova confirmação do MESMO vetor de autorização.
// * Não reter aqui dados que autorizem acesso (tokens, URLs assinadas,
//   fingerprints). Apenas estado de formulário/navegação da página.

const MAX_ENTRIES = 8;
const store = new Map<string, unknown>();

export function pauseStateKey(parts: {
  userId: string | null | undefined;
  organizationId: string | null | undefined;
  roles: readonly string[];
  epoch: number;
}): string {
  return JSON.stringify([
    parts.userId ?? "",
    parts.organizationId ?? "",
    [...parts.roles].sort(),
    parts.epoch,
  ]);
}

export function readPauseState<T>(key: string): T | null {
  return store.has(key) ? (store.get(key) as T) : null;
}

export function writePauseState<T>(key: string, value: T): void {
  if (store.has(key)) store.delete(key);
  store.set(key, value);
  // Poda por ordem de inserção: entradas de épocas/identidades antigas
  // tornam-se inalcançáveis pela chave e são descartadas.
  while (store.size > MAX_ENTRIES) {
    const oldest = store.keys().next().value;
    if (oldest === undefined) break;
    store.delete(oldest);
  }
}

export function clearPauseState(key: string): void {
  store.delete(key);
}

/** Troca de identidade/saída: descarta TODA retenção (mesma sessão de aba). */
export function clearAllPauseStates(): void {
  store.clear();
}

// retrigger: verificacao de build pos-restauracao (sem efeito funcional)
