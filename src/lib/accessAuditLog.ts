import { supabase } from "@/integrations/supabase/client";

/**
 * Contextos aceitos pela RPC `log_my_access_denied_secure`.
 * Inclui `producer` para auditar tentativas em rotas exclusivas do Portal Produtor.
 */
export type AuditContext = "b2b" | "technical" | "producer";

/**
 * Fase Corretiva 8 — registra tentativa de acesso negado via RPC segura.
 *
 * Nunca aceita user_id nem URL completa. `routeGroup` é sanitizado no servidor.
 * Falhas de log NÃO devem impedir o redirect — sempre retorna void.
 *
 * Deduplicação leve para evitar múltiplos registros em re-renders rápidos.
 */
const recentlyLogged = new Map<string, number>();
const DEDUP_MS = 5_000;

export async function logAccessDeniedOnce(
  context: AuditContext,
  routeGroup?: string | null
): Promise<void> {
  const key = `${context}:${routeGroup ?? ""}`;
  const now = Date.now();
  const last = recentlyLogged.get(key) ?? 0;
  if (now - last < DEDUP_MS) return;
  recentlyLogged.set(key, now);

  try {
    await (supabase as any).rpc("log_my_access_denied_secure", {
      p_context: context,
      p_route_group: routeGroup ?? null,
    });
  } catch (e) {
    console.warn("[multiportal] log_my_access_denied_secure falhou", e);
  }
}

/** Extrai um "route_group" curto a partir do pathname atual. */
export function routeGroupFromPath(pathname: string): string | null {
  if (!pathname) return null;
  const segs = pathname.split("/").filter(Boolean);
  if (segs.length === 0) return null;
  return segs.slice(0, 2).join("/");
}
