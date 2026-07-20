/**
 * Fase Hardening — Sincronização entre abas via BroadcastChannel + storage event.
 *
 * Este canal transporta APENAS eventos de UI (troca/limpeza de portal e logout).
 * Ele NUNCA autoriza acesso: toda decisão continua nas RPCs seguras + RLS.
 */

const CHANNEL_NAME = "arbio:portal";
const FALLBACK_KEY = "arbio:portal:event";

export type PortalBroadcastEvent =
  | { type: "portal_switched"; at: number }
  | { type: "portal_cleared"; at: number }
  | { type: "signed_out"; at: number };

function getChannel(): BroadcastChannel | null {
  if (typeof window === "undefined") return null;
  if (typeof BroadcastChannel === "undefined") return null;
  try {
    return new BroadcastChannel(CHANNEL_NAME);
  } catch {
    return null;
  }
}

export function broadcastPortalEvent(event: PortalBroadcastEvent): void {
  const ch = getChannel();
  try {
    ch?.postMessage(event);
  } catch {
    /* noop */
  } finally {
    try {
      ch?.close();
    } catch {
      /* noop */
    }
  }
  // Fallback: storage event chega em todas as abas do mesmo origin.
  try {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(FALLBACK_KEY, JSON.stringify(event));
      window.localStorage.removeItem(FALLBACK_KEY);
    }
  } catch {
    /* noop */
  }
}

export function subscribePortalEvents(
  handler: (event: PortalBroadcastEvent) => void
): () => void {
  if (typeof window === "undefined") return () => {};
  const ch = getChannel();
  const onMessage = (ev: MessageEvent) => {
    if (ev?.data && typeof ev.data === "object" && "type" in ev.data) {
      handler(ev.data as PortalBroadcastEvent);
    }
  };
  ch?.addEventListener("message", onMessage);

  const onStorage = (ev: StorageEvent) => {
    if (ev.key !== FALLBACK_KEY || !ev.newValue) return;
    try {
      const parsed = JSON.parse(ev.newValue) as PortalBroadcastEvent;
      handler(parsed);
    } catch {
      /* noop */
    }
  };
  window.addEventListener("storage", onStorage);

  return () => {
    try {
      ch?.removeEventListener("message", onMessage);
      ch?.close();
    } catch {
      /* noop */
    }
    window.removeEventListener("storage", onStorage);
  };
}
