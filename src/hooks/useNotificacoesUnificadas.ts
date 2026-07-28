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
  const { user } = useAuth();
  const { clienteId } = usePortalCliente();
  const qc = useQueryClient();
  const displayLimit = options?.limit ?? 30;

  const opQuery = useQuery({
    queryKey: ["notif-unified", "op", user?.id],
    queryFn: async (): Promise<NotifOp[]> => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("notificacoes_operacionais")
        .select("id, tipo, titulo, mensagem, link, lido, created_at")
        .eq("usuario_id", user.id)
        .order("created_at", { ascending: false })
        .limit(OP_LIMIT);
      if (error) throw error;
      return (data as NotifOp[]) ?? [];
    },
    enabled: !!user,
    staleTime: 15_000,
    refetchInterval: 120_000,
  });

  const portalQuery = useQuery({
    queryKey: ["notif-unified", "portal", clienteId],
    queryFn: async (): Promise<NotifPortal[]> => {
      if (!clienteId) return [];
      const { data, error } = await supabase
        .from("portal_notificacoes")
        .select("id, tipo, titulo, mensagem, link, lido, created_at")
        .eq("cliente_id", clienteId)
        .order("created_at", { ascending: false })
        .limit(PORTAL_LIMIT);
      if (error) throw error;
      return (data as NotifPortal[]) ?? [];
    },
    enabled: !!clienteId,
    staleTime: 15_000,
    refetchInterval: 120_000,
  });

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`notif-unified-op-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notificacoes_operacionais",
          filter: `usuario_id=eq.${user.id}`,
        },
        () => qc.invalidateQueries({ queryKey: ["notif-unified", "op", user.id] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, qc]);

  useEffect(() => {
    if (!clienteId) return;
    const channel = supabase
      .channel(`notif-unified-portal-${clienteId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "portal_notificacoes",
          filter: `cliente_id=eq.${clienteId}`,
        },
        () => qc.invalidateQueries({ queryKey: ["notif-unified", "portal", clienteId] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [clienteId, qc]);

  const combined = useMemo<NotificacaoUnificada[]>(() => {
    const op = (opQuery.data ?? []).map<NotificacaoUnificada>((n) => ({
      id: `op:${n.id}`,
      origem: "operacional",
      tipo: n.tipo,
      titulo: n.titulo,
      mensagem: n.mensagem,
      link: n.link,
      lido: n.lido,
      created_at: n.created_at,
    }));
    const portal = (portalQuery.data ?? []).map<NotificacaoUnificada>((n) => ({
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
  }, [opQuery.data, portalQuery.data]);

  const unreadCount = combined.filter((n) => !n.lido).length;

  const markRead = useMutation({
    mutationFn: async (compositeId: string) => {
      const parsed = parseCompositeId(compositeId);
      if (!parsed) return;
      const table =
        parsed.origem === "operacional" ? "notificacoes_operacionais" : "portal_notificacoes";
      const { error } = await supabase.from(table).update({ lido: true }).eq("id", parsed.rawId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notif-unified", "op", user?.id] });
      qc.invalidateQueries({ queryKey: ["notif-unified", "portal", clienteId] });
    },
  });

  const markAllRead = useMutation({
    mutationFn: async () => {
      const tasks: Promise<{ error: unknown }>[] = [];
      if (user) {
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
      if (clienteId) {
        tasks.push(
          (async () => {
            const r = await supabase
              .from("portal_notificacoes")
              .update({ lido: true })
              .eq("cliente_id", clienteId)
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
      qc.invalidateQueries({ queryKey: ["notif-unified", "op", user?.id] });
      qc.invalidateQueries({ queryKey: ["notif-unified", "portal", clienteId] });
    },
  });

  return {
    data: combined.slice(0, displayLimit),
    all: combined,
    unreadCount,
    isLoading: opQuery.isLoading || portalQuery.isLoading,
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
  const seen = new Map<string, NotificacaoUnificada>();
  for (const it of items) {
    // Dedup por (origem, tipo, titulo, mensagem) dentro de janela de 5s
    const bucket = `${it.origem}|${it.tipo}|${it.titulo}|${it.mensagem ?? ""}|${
      Math.floor(new Date(it.created_at).getTime() / 5000)
    }`;
    const existing = seen.get(bucket);
    if (!existing) {
      seen.set(bucket, it);
    } else {
      // Preserva o mais recente e a versão "não lida" quando houver dúvida.
      const preferNew =
        new Date(it.created_at).getTime() > new Date(existing.created_at).getTime() ||
        (!it.lido && existing.lido);
      if (preferNew) seen.set(bucket, it);
    }
  }
  return Array.from(seen.values()).sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
}
