import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import {
  isB2BQueryKey,
  isTechnicalQueryKey,
  B2B_SESSION_KEYS,
  TECHNICAL_SESSION_KEYS,
} from "@/lib/portalQueryKeys";
import { hasUnsavedChanges } from "@/hooks/useUnsavedChanges";
import { clearActivePortalContext } from "@/lib/activePortalContext";
import { broadcastPortalEvent } from "@/lib/portalBroadcast";
import { useAvailableContexts } from "@/hooks/useAvailableContexts";
import { useRef } from "react";

/**
 * useSwitchPortal — troca de contexto B2B ↔ Técnico sem logout.
 *
 * Hardening:
 * - cancela e remove queries do portal atual;
 * - invalida `available-portal-contexts`, `profile` e `notifications`;
 * - limpa contexto ativo antes de reenviar ao seletor;
 * - registra a troca via canal entre abas para sincronização.
 */
export function useSwitchPortal() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { ready, scope } = useAvailableContexts();
  const current = useRef({ scope, epoch: 0 });
  if (current.current.scope !== scope) { current.current.scope = scope; current.current.epoch += 1; }

  return useCallback(
    async (options?: { force?: boolean }) => {
      if (!ready) return false;
      const startedScope = scope;
      const epoch = current.current.epoch;
      const currentPath =
        typeof window !== "undefined" ? window.location.pathname : "";
      const leavingB2B = currentPath.startsWith("/portal-parceiro");
      const leavingTechnical =
        currentPath.startsWith("/app") && currentPath !== "/app/login";

      if (!options?.force && hasUnsavedChanges()) {
        const proceed = window.confirm(
          "Existem alterações não salvas. Deseja sair deste portal e descartá-las?"
        );
        if (!proceed) return false;
      }

      try {
        const predicate = (queryKey: unknown) => {
          if (leavingB2B && isB2BQueryKey(queryKey)) return true;
          if (leavingTechnical && isTechnicalQueryKey(queryKey)) return true;
          if (!leavingB2B && !leavingTechnical) {
            return isB2BQueryKey(queryKey) || isTechnicalQueryKey(queryKey);
          }
          return false;
        };

        await queryClient.cancelQueries({
          predicate: (q) => predicate(q.queryKey),
        });
        queryClient.removeQueries({
          predicate: (q) => predicate(q.queryKey),
        });

        // Invalida chaves globais que devem refletir novo contexto/permissões.
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["available-portal-contexts"] }),
          queryClient.invalidateQueries({ queryKey: ["profile"] }),
          queryClient.invalidateQueries({ queryKey: ["notifications"] }),
        ]);

        if (current.current.scope !== startedScope || current.current.epoch !== epoch) return false;
        try {
          const keys = leavingB2B
            ? B2B_SESSION_KEYS
            : leavingTechnical
              ? TECHNICAL_SESSION_KEYS
              : [...B2B_SESSION_KEYS, ...TECHNICAL_SESSION_KEYS];
          keys.forEach((k) => sessionStorage.removeItem(k));
        } catch {
          /* sessionStorage indisponível */
        }

        clearActivePortalContext();
        broadcastPortalEvent({ type: "portal_switched", at: Date.now() });

        navigate("/selecionar-portal?intent=switch", { replace: true });
      } catch {
        return false;
      }
      return true;
    },
    [navigate, queryClient, ready, scope]
  );
}

