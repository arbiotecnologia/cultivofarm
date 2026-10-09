/**
 * Workspace consolidado da visita técnica.
 *
 * Fonte única e autoritativa: `rpc_get_visita_workspace` retorna, em uma única
 * chamada, os dados da visita (identificação, equipe, check-ins, campo,
 * diagnósticos, evidências, recomendações, aprovações, timeline, monitoramento,
 * OS e retornos) junto das permissões efetivas do usuário autenticado.
 *
 * O front NÃO deve derivar permissão local: sempre usar `permissions` do servidor.
 */
import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export const TECHNICAL_STALE_REVALIDATION = {
  staleTime: 15_000,
  refetchOnMount: true,
  refetchOnWindowFocus: true,
} as const;

/** Scope is a cache fence, not authorization; the server remains authoritative. */
export function useTechnicalQuerySession(prefix: string) {
  const { user, profile, roles, loading } = useAuth();
  const client = useQueryClient();
  const ready = !loading && !!user?.id && profile?.user_id === user.id &&
    profile.ativo === true && !!profile.organization_id && roles.length > 0;
  const scope = JSON.stringify([ready, user?.id, profile?.user_id, profile?.organization_id, [...roles].sort()]);
  const current = useRef({ scope, epoch: 0 });
  if (current.current.scope !== scope) {
    current.current = { scope, epoch: current.current.epoch + 1 };
  }
  useEffect(() => {
    const predicate = (query: { queryKey: readonly unknown[] }) =>
      query.queryKey[0] === prefix && query.queryKey[query.queryKey.length - 1] !== scope;
    void client.cancelQueries({ predicate });
    client.removeQueries({ predicate });
  }, [client, prefix, scope]);
  const fence = () => {
    const epoch = current.current.epoch;
    return (signal: AbortSignal) => {
      if (!ready || signal.aborted || current.current.scope !== scope || current.current.epoch !== epoch) {
        throw new Error("technical_query_context_changed");
      }
    };
  };
  return { ready, scope, fence };
}

export interface VisitaWorkspacePermissions {
  can_view: boolean;
  can_manage: boolean;
  can_edit: boolean;
  can_checkin: boolean;
  can_checkout: boolean;
  can_approve: boolean;
  can_manage_team: boolean;
  can_convert_os: boolean;
  can_view_internal: boolean;
  is_editable_status: boolean;
  is_admin: boolean;
  is_manager: boolean;
  is_participant: boolean;
}

export type VisitaAudience = "interna" | "produtor";

export interface VisitaWorkspace {
  audience: VisitaAudience;
  registro: Record<string, any> | null;
  version: number | null;
  status: string | null;
  permissions: VisitaWorkspacePermissions;
  cliente: Record<string, any> | null;
  fazenda: Record<string, any> | null;
  talhao: Record<string, any> | null;
  cultura: Record<string, any> | null;
  solicitacao: Record<string, any> | null;
  equipe: Record<string, any>[];
  checkins: Record<string, any>[];
  campo: Record<string, any> | null;
  diagnosticos: Record<string, any>[];
  evidencias: Record<string, any>[];
  recomendacoes: Record<string, any>[];
  comentarios: Record<string, any>[];
  aprovacoes: Record<string, any>[];
  timeline: Record<string, any>[];
  monitoramento: Record<string, any>[];
  ordens_servico: Record<string, any>[];
  retornos: Record<string, any>[];
}

export const EMPTY_VISITA_PERMISSIONS: VisitaWorkspacePermissions = {
  can_view: false,
  can_manage: false,
  can_edit: false,
  can_checkin: false,
  can_checkout: false,
  can_approve: false,
  can_manage_team: false,
  can_convert_os: false,
  can_view_internal: false,
  is_editable_status: false,
  is_admin: false,
  is_manager: false,
  is_participant: false,
};

export function visitaWorkspaceKey(registroId?: string | null, scope?: string) {
  return scope ? ["visita-workspace", registroId ?? null, scope] as const
    : ["visita-workspace", registroId ?? null] as const;
}

export function useVisitaWorkspace(registroId?: string | null) {
  const session = useTechnicalQuerySession("visita-workspace");
  const result = useQuery({
    queryKey: visitaWorkspaceKey(registroId, session.scope),
    enabled: !!registroId && session.ready,
    ...TECHNICAL_STALE_REVALIDATION,
    queryFn: async ({ signal }): Promise<VisitaWorkspace> => {
      const assertCurrent = session.fence();
      assertCurrent(signal);
      const { data, error } = await supabase.rpc("rpc_get_visita_workspace" as never, {
        p_registro_id: registroId,
      } as never);
      assertCurrent(signal);
      if (error) throw error;
      const ws = (data ?? {}) as any;
      return {
        ...ws,
        permissions: { ...EMPTY_VISITA_PERMISSIONS, ...(ws.permissions ?? {}) },
        equipe: ws.equipe ?? [],
        checkins: ws.checkins ?? [],
        diagnosticos: ws.diagnosticos ?? [],
        evidencias: ws.evidencias ?? [],
        recomendacoes: ws.recomendacoes ?? [],
        comentarios: ws.comentarios ?? [],
        aprovacoes: ws.aprovacoes ?? [],
        timeline: ws.timeline ?? [],
        monitoramento: ws.monitoramento ?? [],
        ordens_servico: ws.ordens_servico ?? [],
        retornos: ws.retornos ?? [],
      } as VisitaWorkspace;
    },
  });
  return { ...result, data: session.ready ? result.data : undefined };
}
