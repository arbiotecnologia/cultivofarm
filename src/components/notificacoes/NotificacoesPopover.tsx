import { Bell, Check, AlertTriangle, Inbox } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useNotificacoesOperacionais } from "@/hooks/useNotificacoesOperacionais";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";

const TIPO_ICON: Record<string, any> = {
  urgencia_critica: AlertTriangle,
  nova_solicitacao: Inbox,
};

const TIPO_COLOR: Record<string, string> = {
  urgencia_critica: "text-destructive",
  nova_solicitacao: "text-primary",
};

export function NotificacoesPopover() {
  const navigate = useNavigate();
  const { data, unreadCount, markRead, markAllRead } = useNotificacoesOperacionais();

  const handleClick = (id: string, link: string | null) => {
    markRead.mutate(id);
    if (link) navigate(link);
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative shrink-0">
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 h-4 min-w-4 px-1 text-[10px] flex items-center justify-center rounded-full"
            >
              {unreadCount > 9 ? "9+" : unreadCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between px-3 py-2 border-b">
          <p className="text-sm font-semibold">Notificações</p>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => markAllRead.mutate()}
            >
              <Check className="h-3 w-3 mr-1" />
              Marcar todas
            </Button>
          )}
        </div>
        <ScrollArea className="h-80">
          {(!data || data.length === 0) && (
            <div className="p-6 text-center text-sm text-muted-foreground">
              Sem notificações
            </div>
          )}
          {(data || []).map((n) => {
            const Icon = TIPO_ICON[n.tipo] || Bell;
            return (
              <button
                key={n.id}
                onClick={() => handleClick(n.id, n.link)}
                className={cn(
                  "w-full text-left px-3 py-2.5 border-b border-border/50 hover:bg-muted/50 transition flex gap-2.5",
                  !n.lido && "bg-primary/5"
                )}
              >
                <Icon className={cn("h-4 w-4 shrink-0 mt-0.5", TIPO_COLOR[n.tipo] || "text-muted-foreground")} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className={cn("text-sm truncate", !n.lido && "font-semibold")}>
                      {n.titulo}
                    </p>
                    {!n.lido && <span className="h-2 w-2 rounded-full bg-primary shrink-0" />}
                  </div>
                  {n.mensagem && (
                    <p className="text-xs text-muted-foreground truncate">{n.mensagem}</p>
                  )}
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {format(new Date(n.created_at), "dd/MM HH:mm", { locale: ptBR })}
                  </p>
                </div>
              </button>
            );
          })}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
