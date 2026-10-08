import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type PortalContext = "b2b" | "technical" | "admin";

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
  const { user, profile, roles, loading } = useAuth();
  const queryClient = useQueryClient();
  const ready = !loading && !!user?.id && profile?.user_id === user.id &&
    profile.ativo === true && profile.senha_provisoria === false &&
    !!profile.organization_id && roles.length > 0;
  const scope = JSON.stringify([ready, user?.id, profile?.user_id, profile?.organization_id, [...roles].sort()]);
  const current = useRef({ scope, mounted: true });
  current.current.scope = scope;
  useEffect(() => {
    current.current.mounted = true;
    return () => { current.current.mounted = false; };
  }, []);
  useEffect(() => {
    // Previous identities/tenants/roles must not retain selectable context data.
    const predicate = (q: { queryKey: readonly unknown[] }) => q.queryKey[0] === "available-portal-contexts" && q.queryKey[1] !== scope;
    void queryClient.cancelQueries({ predicate });
    queryClient.removeQueries({ predicate });
  }, [scope, queryClient]);
  const result = useQuery({
    queryKey: ["available-portal-contexts", scope],
    enabled: ready,
    staleTime: 0,
    gcTime: 2 * 60_000,
    retry: 1,
    refetchOnWindowFocus: true,
    queryFn: async ({ signal }): Promise<AvailableContexts> => {
      if (!ready) throw new Error("portal_context_not_ready");
      const { data, error } = await supabase.rpc("get_my_available_portal_contexts").abortSignal(signal);
      if (signal.aborted || !current.current.mounted || current.current.scope !== scope) throw new Error("portal_context_changed");
      if (error) throw new Error("portal_context_unavailable");
      const raw = (data ?? {}) as unknown as Partial<AvailableContexts>;
      const valid = (value: unknown): value is PortalContext => value === "admin" || value === "b2b" || value === "technical";
      const contexts = Array.isArray(raw.available_contexts) ? raw.available_contexts.filter(valid) : [];
      return {
        available_contexts: contexts,
        default_context: valid(raw.default_context) && contexts.includes(raw.default_context) ? raw.default_context : null,
        must_select_context: raw.must_select_context === true,
        has_b2b_access: raw.has_b2b_access === true,
        has_technical_access: raw.has_technical_access === true,
        is_admin: raw.is_admin === true,
        preferred_context: valid(raw.preferred_context) && contexts.includes(raw.preferred_context) ? raw.preferred_context : null,
        skip_context_selector: raw.skip_context_selector === true,
      };
    },
  });
  return { ...result, data: ready ? result.data : undefined, ready, scope,
    isLoading: loading || (ready && result.isLoading) };

}

/** Registra `login_redirect` via RPC segura (metadata fixa no servidor). */
export async function registerLoginRedirect(context: PortalContext) {
  const { data, error } = await supabase.rpc("register_my_login_redirect_secure", {
    p_context: context,
  });
  if (error) {
    // Logamos apenas — falha no log de auditoria não deve bloquear o acesso já autorizado
    console.warn("[multiportal] redirect_audit_unavailable");
  }
  return data;
}
