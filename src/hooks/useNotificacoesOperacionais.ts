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
  const { user } = useAuth();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["notificacoes-operacionais", user?.id],
    queryFn: async (): Promise<NotificacaoOperacional[]> => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("notificacoes_operacionais")
        .select("id, usuario_id, tipo, titulo, mensagem, link, lido, created_at")
        .eq("usuario_id", user.id)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data as NotificacaoOperacional[]) || [];
    },
    enabled: !!user,
    refetchInterval: 180_000,
    staleTime: 30_000,
  });

  // Realtime subscription
  useEffect(() => {
    if (!user) return;
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
          qc.invalidateQueries({ queryKey: ["notificacoes-operacionais", user.id] });
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, qc]);

  const markRead = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("notificacoes_operacionais")
        .update({ lido: true })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notificacoes-operacionais", user?.id] }),
  });

  const markAllRead = useMutation({
    mutationFn: async () => {
      if (!user) return;
      const { error } = await supabase
        .from("notificacoes_operacionais")
        .update({ lido: true })
        .eq("usuario_id", user.id)
        .eq("lido", false);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notificacoes-operacionais", user?.id] }),
  });

  const unreadCount = (query.data || []).filter((n) => !n.lido).length;

  return { ...query, unreadCount, markRead, markAllRead };
}
