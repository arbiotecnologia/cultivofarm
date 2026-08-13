import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import type { SidebarPortalId } from "@/components/nav/types";

/**
 * Persistência por usuário E por portal do estado de recolhimento da navegação
 * lateral. Cobre os três níveis da especificação:
 *   (a) sidebar inteira  → `sidebar:state:v1:<user>:<portal>`
 *   (b) seção accordion  → `sidebar:groups:v3:<user>:<portal>` (chave = seção)
 *   (c) item com filhos  → mesma chave v3 (chave = `item:<id>`)
 *
 * Regras:
 * - Estado nunca é herdado entre contas (userId compõe a chave).
 * - Chaves legadas (`sidebar:groups:` sem v3) são descartadas — jamais podem
 *   ocultar grupos novos.
 * - Seção/item que contém a rota ativa é aberto automaticamente ao navegar,
 *   mas o usuário continua podendo fechá-lo (a indicação de rota ativa é
 *   preservada pela própria sidebar).
 */
export const NAV_COLLAPSE_STORAGE_VERSION = "v3";
export const SIDEBAR_STATE_STORAGE_VERSION = "v1";

const LEGACY_GROUPS_PREFIX = "sidebar:groups:";

export function groupsStorageKey(
  userId: string | null | undefined,
  portal: SidebarPortalId,
): string {
  return `sidebar:groups:${NAV_COLLAPSE_STORAGE_VERSION}:${userId ?? "anon"}:${portal}`;
}

export function sidebarStateStorageKey(
  userId: string | null | undefined,
  portal: SidebarPortalId,
): string {
  return `sidebar:state:${SIDEBAR_STATE_STORAGE_VERSION}:${userId ?? "anon"}:${portal}`;
}

export function itemCollapseKey(itemId: string): string {
  return `item:${itemId}`;
}

/** Aceita apenas pares `string -> boolean`; qualquer outro formato vira `{}`. */
export function sanitizeCollapseState(raw: unknown): Record<string, boolean> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, boolean> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof key === "string" && key.length > 0 && typeof value === "boolean") {
      out[key] = value;
    }
  }
  return out;
}

/** Remove chaves `sidebar:groups:*` de versões anteriores à atual. */
export function purgeLegacyCollapseKeys(userId?: string | null): void {
  try {
    // Remoção explícita (ambientes cujo localStorage não é enumerável).
    for (const uid of [userId ?? null, "anon"]) {
      const suffix = uid ?? "anon";
      localStorage.removeItem(`${LEGACY_GROUPS_PREFIX}${suffix}`);
      localStorage.removeItem(`${LEGACY_GROUPS_PREFIX}v2:${suffix}`);
    }
    const keys =
      typeof localStorage.key === "function" && typeof localStorage.length === "number"
        ? Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i))
        : Object.keys(localStorage);
    const doomed: string[] = [];
    for (const key of keys) {
      if (!key) continue;
      if (
        key.startsWith(LEGACY_GROUPS_PREFIX) &&
        !key.startsWith(`${LEGACY_GROUPS_PREFIX}${NAV_COLLAPSE_STORAGE_VERSION}:`)
      ) {
        doomed.push(key);
      }
    }
    doomed.forEach((k) => localStorage.removeItem(k));
  } catch {
    /* indisponível — ignora */
  }
}

function readState(key: string): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(key);
    return raw ? sanitizeCollapseState(JSON.parse(raw)) : {};
  } catch {
    return {};
  }
}

export interface NavCollapseApi {
  isOpen: (key: string, defaultOpen?: boolean) => boolean;
  setOpen: (key: string, open: boolean) => void;
  /** Chave de persistência efetiva — exposta para testes/diagnóstico. */
  storageKey: string;
}

/**
 * @param portal   portal atual (compõe a chave)
 * @param autoOpenKeys chaves que devem abrir automaticamente ao navegar
 *                     (seção da rota ativa e itens com filho ativo)
 */
export function useNavCollapseState(
  portal: SidebarPortalId,
  autoOpenKeys: string[] = [],
): NavCollapseApi {
  const { user } = useAuth();
  const storageKey = groupsStorageKey(user?.id, portal);
  const [state, setState] = useState<Record<string, boolean>>({});

  // Hidrata ao trocar de usuário/portal e limpa versões legadas.
  useEffect(() => {
    purgeLegacyCollapseKeys(user?.id);
    setState(readState(storageKey));
  }, [storageKey]);

  const persist = useCallback(
    (next: Record<string, boolean>) => {
      setState(next);
      try {
        localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        /* quota — ignora */
      }
    },
    [storageKey],
  );

  // Abertura automática ao navegar: só dispara quando o conjunto muda.
  const autoKey = autoOpenKeys.filter(Boolean).sort().join("|");
  const lastAuto = useRef<string>("");
  useEffect(() => {
    if (!autoKey || autoKey === lastAuto.current) return;
    lastAuto.current = autoKey;
    setState((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const k of autoKey.split("|")) {
        if (next[k] !== true) {
          next[k] = true;
          changed = true;
        }
      }
      if (!changed) return prev;
      try {
        localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        /* ignora */
      }
      return next;
    });
  }, [autoKey, storageKey]);

  const isOpen = useCallback(
    (key: string, defaultOpen = true) =>
      Object.prototype.hasOwnProperty.call(state, key) ? state[key] : defaultOpen,
    [state],
  );

  const setOpen = useCallback(
    (key: string, open: boolean) => persist({ ...sanitizeCollapseState(state), [key]: open }),
    [state, persist],
  );

  return useMemo(() => ({ isOpen, setOpen, storageKey }), [isOpen, setOpen, storageKey]);
}

/**
 * Estado (a): recolhimento da sidebar inteira, por usuário e portal.
 * Retorna par controlado para `SidebarProvider`.
 */
export function useSidebarOpenState(portal: SidebarPortalId): {
  open: boolean;
  setOpen: (open: boolean) => void;
} {
  const { user } = useAuth();
  const key = sidebarStateStorageKey(user?.id, portal);
  const [open, setOpenState] = useState(true);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      setOpenState(raw === null ? true : raw === "true");
    } catch {
      setOpenState(true);
    }
  }, [key]);

  const setOpen = useCallback(
    (next: boolean) => {
      setOpenState(next);
      try {
        localStorage.setItem(key, String(next));
      } catch {
        /* ignora */
      }
    },
    [key],
  );

  return { open, setOpen };
}
