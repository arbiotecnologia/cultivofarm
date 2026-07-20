import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  isB2BQueryKey,
  isTechnicalQueryKey,
  B2B_SESSION_KEYS,
  TECHNICAL_SESSION_KEYS,
} from "@/lib/portalQueryKeys";
import { hasUnsavedChanges } from "@/hooks/useUnsavedChanges";

/**
 * useSwitchPortal — troca de contexto B2B ↔ Técnico sem logout.
 *
 * Fase 9 — remove apenas as chaves do contexto atual (nunca cancela tudo).
 * Fase 10 — bloqueia a troca quando há alterações não salvas, exceto se
 *           o chamador confirmar `{ force: true }`.
 *
 * O contexto atual é inferido pela URL: `/portal-parceiro/*` = B2B,
 * `/app/*` = técnico. Fluxos administrativos não chamam este hook.
 */
export function useSwitchPortal() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  return useCallback(
    async (options?: { force?: boolean }) => {
      const currentPath =
        typeof window !== "undefined" ? window.location.pathname : "";
      const leavingB2B = currentPath.startsWith("/portal-parceiro");
      const leavingTechnical =
        currentPath.startsWith("/app") && currentPath !== "/app/login";

      // Fase 10 — proteção de alterações não salvas.
      if (!options?.force && hasUnsavedChanges()) {
        const proceed = window.confirm(
          "Existem alterações não salvas. Deseja sair deste portal e descartá-las?"
        );
        if (!proceed) return false;
      }

      try {
        // Cancela apenas as queries do portal que estamos deixando.
        const predicate = (queryKey: unknown) => {
          if (leavingB2B && isB2BQueryKey(queryKey)) return true;
          if (leavingTechnical && isTechnicalQueryKey(queryKey)) return true;
          // fallback: se rota não bate, ainda limpamos as duas famílias.
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

        // sessionStorage efêmero por contexto.
        try {
          const keys = leavingB2B
            ? B2B_SESSION_KEYS
            : leavingTechnical
              ? TECHNICAL_SESSION_KEYS
              : [...B2B_SESSION_KEYS, ...TECHNICAL_SESSION_KEYS];
          keys.forEach((k) => sessionStorage.removeItem(k));
        } catch {
          // sessionStorage indisponível
        }

        // Preserva registros offline; apenas revalida sessão.
        await supabase.auth.getSession();
      } finally {
        navigate("/selecionar-portal", { replace: true });
      }
      return true;
    },
    [navigate, queryClient]
  );
}
