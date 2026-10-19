import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { clearActivePortalContext } from "@/lib/activePortalContext";
import { useAuth } from "@/hooks/useAuth";
import { PRODUCER_CONTEXT_MONITOR_ENABLED } from "@/lib/authz/authzEpochGate";

import { internalContextProbe } from "@/lib/authz/internalContextProbe";
import { getHomeForRole } from "@/lib/permissions";

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
  const { user, profile, roles, loading, authzReady = true, authzEpoch = 0, checkAuthzAccess } = useAuth();
  const queryClient = useQueryClient();
  const ready = !loading && !!user?.id && profile?.user_id === user.id &&
    profile.ativo === true && profile.senha_provisoria === false &&
    !!profile.organization_id && roles.length > 0 && authzReady;
  const scope = JSON.stringify([ready, user?.id, profile?.user_id, profile?.organization_id, [...roles].sort(), authzEpoch]);
  const current = useRef({ scope, mounted: true, epoch: 0 });
  if (current.current.scope !== scope) {
    current.current.scope = scope;
    current.current.epoch += 1;
    clearActivePortalContext({ preserveClientPreference: PRODUCER_CONTEXT_MONITOR_ENABLED && roles.length === 1 && roles[0] === "cliente_produtor" });
  }
  useEffect(() => {
    const state = current.current;
    state.mounted = true;
    return () => { state.mounted = false; state.epoch += 1; };
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
      const epoch = current.current.epoch;
      const { data, error } = await supabase.rpc("get_my_available_portal_contexts").abortSignal(signal);
      if (signal.aborted || !current.current.mounted || current.current.scope !== scope || current.current.epoch !== epoch) throw new Error("portal_context_changed");
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
  // Canonical internal home, never a fabricated technical portal context.
  const exclusiveOperator = roles.length === 1 && roles[0] === "operador_onfarm";
  const operatorHomeQuery = useQuery({
    queryKey: ["operator-login-home", scope], enabled: ready && exclusiveOperator,
    staleTime: 0, gcTime: 0, retry: false,
    queryFn: async ({ signal }) => {
      const epoch = current.current.epoch;
      const observation = await internalContextProbe(user?.id ?? "", profile?.organization_id ?? "", "operador_onfarm");
      if (signal.aborted || !current.current.mounted || current.current.scope !== scope || current.current.epoch !== epoch || !checkAuthzAccess()) throw new Error("operator_home_context_changed");
      if (observation.eligible !== true) throw new Error("operator_home_denied");
      return getHomeForRole("operador_onfarm");
    },
  });
  return { ...result, exclusiveOperator,
    operatorHome: ready && exclusiveOperator && !operatorHomeQuery.isFetching && !operatorHomeQuery.isError ? operatorHomeQuery.data : undefined,
    isError: result.isError || (exclusiveOperator && operatorHomeQuery.isError),
    isFetching: result.isFetching || (exclusiveOperator && operatorHomeQuery.isFetching),
    refetch: exclusiveOperator ? () => Promise.all([result.refetch(), operatorHomeQuery.refetch()]) : result.refetch,
    data: ready ? result.data : undefined, ready, scope,
    isLoading: loading || (ready && (result.isLoading || (exclusiveOperator && operatorHomeQuery.isLoading))) };

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
