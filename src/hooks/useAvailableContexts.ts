import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type PortalContext = "b2b" | "technical";

export interface AvailableContexts {
  available_contexts: PortalContext[];
  default_context: PortalContext | null;
  must_select_context: boolean;
  has_b2b_access: boolean;
  has_technical_access: boolean;
  is_admin: boolean;
  preferred_context?: PortalContext | null;
  skip_context_selector?: boolean;
}

/**
 * Resolve os contextos de portal reais do usuário via RPC segura.
 * A decisão de portal nunca depende de localStorage nem do frontend —
 * quem determina é `public.get_my_available_portal_contexts()`.
 */
export function useAvailableContexts() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["available-portal-contexts", user?.id],
    enabled: !!user?.id,
    staleTime: 15_000,
    gcTime: 2 * 60_000,
    retry: 1,
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<AvailableContexts> => {
      const { data, error } = await supabase.rpc("get_my_available_portal_contexts");
      if (error) throw error;
      const raw = (data ?? {}) as Partial<AvailableContexts>;
      return {
        available_contexts: (raw.available_contexts ?? []) as PortalContext[],
        default_context: raw.default_context ?? null,
        must_select_context: raw.must_select_context === true,
        has_b2b_access: !!raw.has_b2b_access,
        has_technical_access: !!raw.has_technical_access,
        preferred_context: raw.preferred_context ?? null,
        skip_context_selector: !!raw.skip_context_selector,
      };
    },
  });
}

/** Registra `login_redirect` via RPC segura (metadata fixa no servidor). */
export async function registerLoginRedirect(context: PortalContext) {
  const { data, error } = await supabase.rpc("register_my_login_redirect_secure", {
    p_context: context,
  });
  if (error) {
    // Logamos apenas — falha no log de auditoria não deve bloquear o acesso já autorizado
    console.warn("[multiportal] register_my_login_redirect_secure falhou", error);
  }
  return data;
}
