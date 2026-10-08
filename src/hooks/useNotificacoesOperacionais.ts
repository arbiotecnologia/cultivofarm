import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface NotificacaoOperacional {
  id: string;
  usuario_id: string;
  tipo: string;
  titulo: string;
  mensagem: string | null;
  link: string | null;
  lido: boolean;
  created_at: string;
}

export function useNotificacoesOperacionais() {
  const { user, profile } = useAuth();
  const organizationId = profile?.organization_id;
  const ready = !!user && !!organizationId && profile?.ativo !== false;
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["notificacoes-operacionais", user?.id, organizationId],
    queryFn: async (): Promise<NotificacaoOperacional[]> => {
      if (!ready || !user) return [];
      const { data, error } = await supabase
        .from("notificacoes_operacionais")
        .select("id, usuario_id, tipo, titulo, mensagem, link, lido, created_at")
        .eq("usuario_id", user.id)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data as NotificacaoOperacional[]) || [];
    },
    enabled: ready,
    refetchInterval: 180_000,
    staleTime: 30_000,
  });

  // Realtime subscription
  useEffect(() => {
    if (!ready || !user) return;
    const channel = supabase
      .channel(`notif-op-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notificacoes_operacionais",
          filter: `usuario_id=eq.${user.id}`,
        },
        () => {
          qc.invalidateQueries({ queryKey: ["notificacoes-operacionais", user.id, organizationId] });
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, organizationId, ready, qc]);

  const markRead = useMutation({
    mutationFn: async (id: string) => {
      if (!ready || !user) throw new Error("NOTIF_SESSION_REQUIRED");
      const { error } = await supabase
        .from("notificacoes_operacionais")
        .update({ lido: true })
        .eq("id", id).eq("usuario_id", user.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notificacoes-operacionais", user?.id, organizationId] }),
  });

  const markAllRead = useMutation({
    mutationFn: async () => {
      if (!ready || !user) return;
      const { error } = await supabase
        .from("notificacoes_operacionais")
        .update({ lido: true })
        .eq("usuario_id", user.id)
        .eq("lido", false);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notificacoes-operacionais", user?.id, organizationId] }),
  });

  const unreadCount = (query.data || []).filter((n) => !n.lido).length;

  return { ...query, data: ready ? query.data : [], unreadCount: ready ? unreadCount : 0, markRead, markAllRead };
}
