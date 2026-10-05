/**
 * Fase Corretiva 3 — Contexto visual ativo.
 *
 * ATENÇÃO: este valor NUNCA autoriza acesso. É consumido apenas pela UI para
 * decidir qual "modo" do MobileLayout renderizar (produtor vs técnico) quando
 * o usuário possui mais de um contexto disponível. A autorização real segue
 * sendo feita pelos guards + RPC `get_my_available_portal_contexts`.
 */

export type ActivePortalContext = "b2b" | "technical" | "producer" | "admin";

const STORAGE_KEY = "active_portal_context";
const PORTAL_CLIENT_STORAGE_KEY = "portal_active_cliente_id";

export function setActivePortalContext(ctx: ActivePortalContext): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, ctx);
  } catch {
    /* sessionStorage indisponível — ignora */
  }
}

export function getActivePortalContext(): ActivePortalContext | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (raw === "b2b" || raw === "technical" || raw === "producer" || raw === "admin") {
      return raw;
    }
    return null;
  } catch {
    return null;
  }
}

export function clearActivePortalContext(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(PORTAL_CLIENT_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
