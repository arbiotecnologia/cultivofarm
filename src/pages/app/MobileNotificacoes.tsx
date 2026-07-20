import { formatDateTimeDisplay } from "@/lib/date-utils";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Bell, Smartphone } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { usePortalCliente } from "@/hooks/usePortalCliente";
import { usePushSubscription } from "@/hooks/usePushSubscription";
import { Button } from "@/components/ui/button";

const TIPO_ICONS: Record<string, string> = {
  informativo: "bg-blue-100 text-blue-700",
  alerta: "bg-amber-100 text-amber-700",
  entrega: "bg-emerald-100 text-emerald-700",
  recomendacao: "bg-purple-100 text-purple-700",
  aplicacao: "bg-sky-100 text-sky-700",
  sistema: "bg-muted text-muted-foreground",
};

export default function MobileNotificacoes() {
  const { role } = useAuth();
  const { clienteId } = usePortalCliente();
  const { permission, subscribe } = usePushSubscription();

  const { data: notificacoes, isLoading } = useQuery({
    queryKey: ["mobile-notificacoes", clienteId],
    queryFn: async () => {
      if (role === "cliente_produtor" && clienteId) {
        const { data } = await supabase
          .from("portal_notificacoes")
          .select("*")
          .eq("cliente_id", clienteId)
          .order("created_at", { ascending: false })
          .limit(30);
        return data || [];
      }
      // For non-producer roles, show all notifications they can access
      const { data } = await supabase
        .from("portal_notificacoes")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(30);
      return data || [];
    },
  });

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-xl font-bold text-foreground">Notificações</h1>

      {permission === "default" && (
        <Card className="p-4 bg-primary/5 border-primary/20 space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <Smartphone className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-sm font-semibold">Ativar notificações?</p>
              <p className="text-xs text-muted-foreground leading-tight">Receba alertas de visitas e prazos direto no seu celular.</p>
            </div>
          </div>
          <Button size="sm" className="w-full h-9 bg-primary text-white" onClick={subscribe}>
            Permitir Notificações
          </Button>
        </Card>
      )}

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 rounded-xl bg-muted animate-pulse" />
          ))}
        </div>
      ) : notificacoes?.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Bell className="h-10 w-10 mx-auto mb-2 opacity-50" />
          <p className="text-sm">Nenhuma notificação</p>
        </div>
      ) : (
        <div className="space-y-2">
          {notificacoes?.map((n) => (
            <Card key={n.id} className={`p-3 ${!n.lido ? "border-primary/30 bg-primary/5" : ""}`}>
              <div className="flex items-start gap-3">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${TIPO_ICONS[n.tipo] || TIPO_ICONS.sistema}`}>
                  <Bell className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="font-medium text-sm text-foreground">{n.titulo}</p>
                  {n.mensagem && (
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.mensagem}</p>
                  )}
                  <p className="text-[10px] text-muted-foreground mt-1">
                    {new Date(n.created_at).toLocaleDateString("pt-BR", {
                      day: "2-digit",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
                {!n.lido && <div className="w-2 h-2 rounded-full bg-primary shrink-0 mt-1.5" />}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
