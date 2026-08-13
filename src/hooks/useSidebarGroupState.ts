import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { DESKTOP_SECTION_ORDER, type NavSection } from "@/config/navigation";

/**
 * Persistência por usuário do estado aberto/fechado dos grupos da sidebar.
 * - Chave localStorage: `sidebar:groups:v2:<userId|anon>`
 * - Grupo do item ativo é forçado aberto (regra 3: nunca esconder rota ativa).
 * - Grupos ainda não interagidos assumem `defaultOpen` (aberto por padrão).
 * - Migração/versionamento: estados legados (v1) e valores inválidos são
 *   descartados — nunca podem ocultar um grupo existente.
 */
export const SIDEBAR_GROUPS_STORAGE_VERSION = "v2";

const LEGACY_PREFIX = "sidebar:groups:";

export function storageKeyFor(userId: string | null | undefined): string {
  return `sidebar:groups:${SIDEBAR_GROUPS_STORAGE_VERSION}:${userId ?? "anon"}`;
}

const VALID_SECTIONS = new Set<string>(DESKTOP_SECTION_ORDER as string[]);

/** Aceita apenas seções conhecidas com valor booleano. */
export function sanitizeGroupState(raw: unknown): Record<string, boolean> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, boolean> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (VALID_SECTIONS.has(key) && typeof value === "boolean") out[key] = value;
  }
  return out;
}

export function useSidebarGroupState(activeSection: NavSection | null) {
  const { user } = useAuth();
  const storageKey = storageKeyFor(user?.id);

  const [manualState, setManualState] = useState<Record<string, boolean>>({});

  // Hidrata do localStorage quando o usuário muda, descartando formatos legados.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      setManualState(raw ? sanitizeGroupState(JSON.parse(raw)) : {});
      // Limpeza do estado v1 (sem versão), que podia esconder grupos novos.
      const legacyKey = `${LEGACY_PREFIX}${user?.id ?? "anon"}`;
      if (localStorage.getItem(legacyKey) !== null) localStorage.removeItem(legacyKey);
    } catch {
      setManualState({});
    }
  }, [storageKey, user?.id]);

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
      persist({ ...sanitizeGroupState(manualState), [section]: open });
    },
    [manualState, persist],
  );

  return useMemo(() => ({ isOpen, setOpen }), [isOpen, setOpen]);
}
