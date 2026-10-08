import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { usePortalCliente } from "@/hooks/usePortalCliente";

/**
 * Gate 5 — leitura unificada de notificações in-app.
 *
 * Fontes:
 *   - notificacoes_operacionais (usuario_id = auth.uid): eventos operacionais/administrativos.
 *   - portal_notificacoes (cliente_id vinculado ao usuário): eventos do portal do produtor.
 *
 * Isolamento: nenhuma consulta faz `select *` global. Cada uma é escopada pelo id do usuário
 * ou pelo cliente do portal ativo. RLS no banco reforça a barreira.
 */

export type NotificacaoOrigem = "operacional" | "portal";

export interface NotificacaoUnificada {
  id: string;
  origem: NotificacaoOrigem;
  tipo: string;
  titulo: string;
  mensagem: string | null;
  link: string | null;
  lido: boolean;
  created_at: string;
}

interface NotifOp {
  id: string;
  tipo: string;
  titulo: string;
  mensagem: string | null;
  link: string | null;
  lido: boolean;
  created_at: string;
}

interface NotifPortal {
  id: string;
  tipo: string;
  titulo: string;
  mensagem: string | null;
  link: string | null;
  lido: boolean;
  created_at: string;
}

const OP_LIMIT = 50;
const PORTAL_LIMIT = 50;

export function useNotificacoesUnificadas(options?: { limit?: number }) {
  const { user, profile, roles, loading: authLoading } = useAuth();
  const { clienteId, loading: portalLoading } = usePortalCliente();
  const organizationId = profile?.organization_id ?? null;
  const ready = !authLoading && !!user && !!organizationId && profile?.user_id === user.id && profile?.ativo === true && roles.length > 0;
  const portalReady = ready && !portalLoading && roles.includes("cliente_produtor") && !!clienteId;
  const roleScope = roles.join(",");
  const scope = [user?.id, organizationId, roleScope];
  const qc = useQueryClient();
  const displayLimit = options?.limit ?? 30;

  const opQuery = useQuery({
    queryKey: ["notif-unified", "op", ...scope],
    queryFn: async (): Promise<NotifOp[]> => {
      if (!ready || !user) return [];
      const { data, error } = await supabase
        .from("notificacoes_operacionais")
        .select("id, tipo, titulo, mensagem, link, lido, created_at")
        .eq("usuario_id", user.id)
        .order("created_at", { ascending: false })
        .limit(OP_LIMIT);
      if (error) throw error;
      return (data as NotifOp[]) ?? [];
    },
    enabled: ready,
    staleTime: 15_000,
    refetchInterval: 120_000,
  });

  const portalQuery = useQuery({
    queryKey: ["notif-unified", "portal", ...scope, clienteId],
    queryFn: async (): Promise<NotifPortal[]> => {
      if (!portalReady || !clienteId || !user) return [];
      const { data, error } = await supabase
        .from("portal_notificacoes")
        .select("id, tipo, titulo, mensagem, link, lido, created_at")
        .eq("cliente_id", clienteId)
        .filter("recipient_user_id", "eq", user.id)
        .order("created_at", { ascending: false })
        .limit(PORTAL_LIMIT);
      if (error) throw error;
      return (data as NotifPortal[]) ?? [];
    },
    enabled: portalReady,
    staleTime: 15_000,
    refetchInterval: 120_000,
  });

  const userId = user?.id ?? null;

  useEffect(() => {
    if (!ready || !userId) return;
    // Sufixo único por montagem: evita reaproveitar um canal já inscrito
    // (Supabase lança erro ao registrar callbacks depois do subscribe()).
    const channel = supabase
      .channel(`notif-unified-op-${userId}-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notificacoes_operacionais",
          filter: `usuario_id=eq.${userId}`,
        },
        () => qc.invalidateQueries({ queryKey: ["notif-unified", "op", userId, organizationId, roleScope] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, organizationId, ready, roleScope, qc]);

  useEffect(() => {
    if (!portalReady || !clienteId || !userId) return;
    const channel = supabase
      .channel(`notif-unified-portal-${clienteId}-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "portal_notificacoes",
          filter: `recipient_user_id=eq.${userId}`,
        },
        () => qc.invalidateQueries({ queryKey: ["notif-unified", "portal", userId, organizationId, roleScope, clienteId] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [clienteId, userId, organizationId, portalReady, roleScope, qc]);

  const combined = useMemo<NotificacaoUnificada[]>(() => {
    const op = (ready ? opQuery.data ?? [] : []).map<NotificacaoUnificada>((n) => ({
      id: `op:${n.id}`,
      origem: "operacional",
      tipo: n.tipo,
      titulo: n.titulo,
      mensagem: n.mensagem,
      link: n.link,
      lido: n.lido,
      created_at: n.created_at,
    }));
    const portal = (portalReady ? portalQuery.data ?? [] : []).map<NotificacaoUnificada>((n) => ({
      id: `portal:${n.id}`,
      origem: "portal",
      tipo: n.tipo,
      titulo: n.titulo,
      mensagem: n.mensagem,
      link: n.link,
      lido: n.lido,
      created_at: n.created_at,
    }));
    return dedupAndSort([...op, ...portal]);
  }, [opQuery.data, portalQuery.data, ready, portalReady]);

  const unreadCount = combined.filter((n) => !n.lido).length;

  const markRead = useMutation({
    mutationFn: async (compositeId: string) => {
      const parsed = parseCompositeId(compositeId);
      if (!parsed) return;
      if (!ready || !user) throw new Error("NOTIF_SESSION_REQUIRED");
      const request = parsed.origem === "operacional"
        ? supabase.from("notificacoes_operacionais").update({ lido: true }).eq("id", parsed.rawId).eq("usuario_id", user.id)
        : portalReady && clienteId
          ? supabase.from("portal_notificacoes").update({ lido: true }).eq("id", parsed.rawId).filter("recipient_user_id", "eq", user.id).eq("cliente_id", clienteId)
          : null;
      if (!request) throw new Error("NOTIF_PORTAL_REQUIRED");
      const { error } = await request;
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notif-unified", "op", ...scope] });
      qc.invalidateQueries({ queryKey: ["notif-unified", "portal", ...scope, clienteId] });
    },
  });

  const markAllRead = useMutation({
    mutationFn: async () => {
      const tasks: Promise<{ error: unknown }>[] = [];
      if (ready && user) {
        tasks.push(
          (async () => {
            const r = await supabase
              .from("notificacoes_operacionais")
              .update({ lido: true })
              .eq("usuario_id", user.id)
              .eq("lido", false);
            return { error: r.error as unknown };
          })(),
        );
      }
      if (portalReady && user && clienteId) {
        tasks.push(
          (async () => {
            const r = await supabase
              .from("portal_notificacoes")
              .update({ lido: true })
              .eq("cliente_id", clienteId)
              .filter("recipient_user_id", "eq", user.id)
              .eq("lido", false);
            return { error: r.error as unknown };
          })(),
        );
      }
      const results = await Promise.all(tasks);
      const firstErr = results.find((r) => r.error);
      if (firstErr) throw firstErr.error;
    },

    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notif-unified", "op", ...scope] });
      qc.invalidateQueries({ queryKey: ["notif-unified", "portal", ...scope, clienteId] });
    },
  });

  return {
    data: combined.slice(0, displayLimit),
    all: combined,
    unreadCount,
    isLoading: (ready && opQuery.isLoading) || (portalReady && portalQuery.isLoading),
    isError: opQuery.isError || portalQuery.isError,
    error: opQuery.error ?? portalQuery.error,
    refetch: () => {
      opQuery.refetch();
      portalQuery.refetch();
    },
    markRead,
    markAllRead,
  };
}

export function parseCompositeId(
  id: string,
): { origem: NotificacaoOrigem; rawId: string } | null {
  const [prefix, ...rest] = id.split(":");
  const rawId = rest.join(":");
  if (!rawId) return null;
  if (prefix === "op") return { origem: "operacional", rawId };
  if (prefix === "portal") return { origem: "portal", rawId };
  return null;
}

export function dedupAndSort(items: NotificacaoUnificada[]): NotificacaoUnificada[] {
  const DEDUP_WINDOW_MS = 5000;
  // Janela deslizante por grupo lógico — evita flakiness de bucketing absoluto
  // quando dois eventos idênticos caem em janelas de 5s vizinhas.
  const groups = new Map<string, NotificacaoUnificada[]>();
  for (const it of items) {
    const key = `${it.origem}|${it.tipo}|${it.titulo}|${it.mensagem ?? ""}`;
    const arr = groups.get(key);
    if (arr) arr.push(it);
    else groups.set(key, [it]);
  }

  const kept: NotificacaoUnificada[] = [];
  for (const arr of groups.values()) {
    // Ordena por data ascendente para coalescer sequencialmente.
    arr.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    let cluster: NotificacaoUnificada[] = [];
    const flush = () => {
      if (!cluster.length) return;
      // Regras: preservar não-lido; em empate, mais recente.
      const chosen = cluster.reduce((best, cur) => {
        if (!cur.lido && best.lido) return cur;
        if (cur.lido && !best.lido) return best;
        return new Date(cur.created_at).getTime() > new Date(best.created_at).getTime()
          ? cur
          : best;
      });
      kept.push(chosen);
      cluster = [];
    };
    for (const it of arr) {
      if (!cluster.length) {
        cluster.push(it);
        continue;
      }
      const first = cluster[0];
      const delta = new Date(it.created_at).getTime() - new Date(first.created_at).getTime();
      if (delta <= DEDUP_WINDOW_MS) cluster.push(it);
      else {
        flush();
        cluster.push(it);
      }
    }
    flush();
  }

  return kept.sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
}

