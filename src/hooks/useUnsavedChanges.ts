import { useCallback, useEffect, useRef } from "react";

/**
 * Fase Corretiva 10 — controle de alterações não salvas.
 *
 * Uso:
 * ```
 * const dirty = useUnsavedChanges(form.formState.isDirty);
 * ```
 *
 * A flag é publicada em um registro global consultado pelo
 * `useSwitchPortal()` antes de trocar de portal. Também instala
 * o `beforeunload` para proteger fechamento acidental da aba.
 */

const registry = new Set<() => boolean>();

export function hasUnsavedChanges(): boolean {
  for (const getter of registry) {
    try {
      if (getter()) return true;
    } catch {
      // ignora getters que quebram
    }
  }
  return false;
}

export function useUnsavedChanges(isDirty: boolean) {
  const dirtyRef = useRef(isDirty);
  dirtyRef.current = isDirty;

  useEffect(() => {
    const getter = () => dirtyRef.current;
    registry.add(getter);

    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (dirtyRef.current) {
        event.preventDefault();
        // exigido por navegadores para exibir o prompt nativo.
        event.returnValue = "";
      }
    };

    window.addEventListener("beforeunload", beforeUnload);
    return () => {
      registry.delete(getter);
      window.removeEventListener("beforeunload", beforeUnload);
    };
  }, []);

  return useCallback(() => dirtyRef.current, []);
}
