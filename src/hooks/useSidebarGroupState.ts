import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import type { NavSection } from "@/config/navigation";

/**
 * Persistência por usuário do estado aberto/fechado dos grupos da sidebar.
 * - Chave localStorage: `sidebar:groups:<userId|anon>`
 * - Grupo do item ativo é forçado aberto (regra 3: nunca esconder rota ativa).
 * - Grupos ainda não interagidos assumem `defaultOpen` (aberto por padrão).
 */
export function useSidebarGroupState(activeSection: NavSection | null) {
  const { user } = useAuth();
  const storageKey = `sidebar:groups:${user?.id ?? "anon"}`;

  const [manualState, setManualState] = useState<Record<string, boolean>>({});

  // Hidrata do localStorage quando o usuário muda.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      setManualState(raw ? JSON.parse(raw) : {});
    } catch {
      setManualState({});
    }
  }, [storageKey]);

  const persist = useCallback(
    (next: Record<string, boolean>) => {
      setManualState(next);
      try {
        localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        /* quota / disponibilidade — ignora */
      }
    },
    [storageKey],
  );

  const isOpen = useCallback(
    (section: NavSection, defaultOpen = true): boolean => {
      // Grupo ativo nunca pode ficar fechado.
      if (activeSection && section === activeSection) return true;
      if (Object.prototype.hasOwnProperty.call(manualState, section)) {
        return manualState[section];
      }
      return defaultOpen;
    },
    [manualState, activeSection],
  );

  const setOpen = useCallback(
    (section: NavSection, open: boolean) => {
      persist({ ...manualState, [section]: open });
    },
    [manualState, persist],
  );

  return useMemo(() => ({ isOpen, setOpen }), [isOpen, setOpen]);
}
