import { useNotificacoesUnificadas } from "@/hooks/useNotificacoesUnificadas";
import { Card } from "@/components/ui/card";
import { Bell, Smartphone, Check, RefreshCw } from "lucide-react";
import { usePushSubscription } from "@/hooks/usePushSubscription";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const TIPO_ICONS: Record<string, string> = {
  informativo: "bg-blue-100 text-blue-700",
  alerta: "bg-amber-100 text-amber-700",
  entrega: "bg-emerald-100 text-emerald-700",
  recomendacao: "bg-purple-100 text-purple-700",
  aplicacao: "bg-sky-100 text-sky-700",
  sistema: "bg-muted text-muted-foreground",
};

export default function MobileNotificacoes() {
  const { permission, subscribe } = usePushSubscription();
  const { all: notificacoes, unreadCount, isLoading, isError, refetch, markRead, markAllRead } = useNotificacoesUnificadas({ limit: 30 });

  return (
    <div className="p-4 space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="text-xl font-bold text-foreground">Notificações</h1><p className="text-xs text-muted-foreground">{unreadCount} não lidas</p></div>
        <div className="flex gap-2">
          <Button variant="outline" size="icon" aria-label="Atualizar notificações" onClick={() => refetch()}><RefreshCw className="h-4 w-4" /></Button>
          <Button size="sm" disabled={!unreadCount || markAllRead.isPending || isLoading || isError} onClick={() => markAllRead.mutate(undefined, { onError: () => toast.error("Não foi possível marcar como lidas.") })}><Check className="h-4 w-4 mr-1" />Marcar todas</Button>
        </div>
      </header>

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

      {isError ? (
        <div role="alert" className="space-y-2 text-sm text-destructive"><p>Não foi possível carregar notificações.</p><Button variant="outline" size="sm" onClick={() => refetch()}>Tentar novamente</Button></div>
      ) : isLoading ? (
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
                <div className="min-w-0 flex-1">
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
                  {!n.lido && <Button className="mt-2" variant="outline" size="sm" disabled={markRead.isPending} aria-label={`Marcar ${n.titulo} como lida`} onClick={() => markRead.mutate(n.id, { onError: () => toast.error("Não foi possível marcar como lida.") })}><Check className="h-4 w-4 mr-1" />Marcar como lida</Button>}
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
