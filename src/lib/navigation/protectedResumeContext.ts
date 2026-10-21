/**
 * Retomada de contexto de NAVEGAÇÃO somente após pausa por TIMEOUT confirmado
 * do monitor de autorização.
 *
 * Memória do módulo (nunca storage persistente): principal (usuário/empresa/
 * papéis), rota, ID do cliente e marca de pausa. Única aba retomável:
 * "documentos". Nenhum dado de formulário, Blob, URL ou resposta.
 *
 * Ciclo de vida (pontos canônicos no AuthProvider):
 * - rememberResume: consumidor autorizado com cliente aberto na aba Documentos.
 * - armResumeOnTimeout: onExpire("timeout") do monitor; TTL conta daqui.
 * - clearResume: qualquer outro expire (ineligible/error/offline), nova época,
 *   latch, logout, troca de identidade/empresa/papéis, fechamento/navegação.
 * - takeResume: consumo único, exige pausa armada, mesmo principal e TTL.
 * Quem consome DEVE refazer a leitura autorizada e só reabrir se o registro
 * ainda vier nela.
 */
export const RESUME_TTL_MS = 120_000;
export const RESUMABLE_TAB = "documentos";

type Slot = { principal: string; route: string; recordId: string; pausedAt: number | null };
let slot: Slot | null = null;

export function resumePrincipalKey(userId: string | null | undefined, organizationId: string | null | undefined, roles: readonly string[] | null | undefined): string | null {
  if (!userId || !organizationId || !roles || roles.length === 0) return null;
  return JSON.stringify([userId, organizationId, [...roles].sort()]);
}

/** Só registra a aba Documentos; qualquer outra aba descarta. Reinicia a pausa. */
export function rememberResume(principal: string | null, route: string, recordId: string, tab: string): void {
  if (!principal || !recordId || tab !== RESUMABLE_TAB) { slot = null; return; }
  slot = { principal, route, recordId, pausedAt: null };
}

export function clearResume(): void { slot = null; }

/** Chamado SOMENTE no expire por timeout do monitor. Principal divergente descarta. */
export function armResumeOnTimeout(principal: string | null, now: number = Date.now()): void {
  if (!slot) return;
  if (!principal || slot.principal !== principal) { slot = null; return; }
  if (slot.pausedAt === null) slot = { ...slot, pausedAt: now };
}

/** Principal diferente/ausente descarta. */
export function observeResumePrincipal(principal: string | null): void {
  if (slot && slot.principal !== principal) slot = null;
}

/** Consome uma vez; exige pausa armada por timeout dentro do TTL. */
export function takeResume(principal: string | null, route: string, now: number = Date.now()): { recordId: string; tab: typeof RESUMABLE_TAB } | null {
  const s = slot;
  slot = null;
  if (!s || s.pausedAt === null || !principal || s.principal !== principal || s.route !== route) return null;
  const elapsed = now - s.pausedAt;
  if (elapsed < 0 || elapsed > RESUME_TTL_MS) return null;
  return { recordId: s.recordId, tab: RESUMABLE_TAB };
}

/** Somente para testes. */
export function __peekResumeForTests(): Readonly<Slot> | null { return slot; }
