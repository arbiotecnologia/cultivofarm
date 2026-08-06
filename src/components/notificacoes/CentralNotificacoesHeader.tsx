import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Bell, AlertTriangle, ExternalLink, Check, Inbox } from "lucide-react";
import { useAlertasResumo } from "@/hooks/useAlertasResumo";
import { useNotificacoesUnificadas, type NotificacaoUnificada } from "@/hooks/useNotificacoesUnificadas";
import { AlertasMiniList } from "@/components/alertas/AlertasMiniList";
import { cn } from "@/lib/utils";
import { classifyDeepLink, CENTRAL_NOTIFICACOES_ROUTE } from "@/lib/notificacoes/deepLinkAllowlist";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";

const TIPO_ICON: Record<string, React.ElementType> = {
  urgencia_critica: AlertTriangle,
  nova_solicitacao: Inbox,
};

const TIPO_COLOR: Record<string, string> = {
  urgencia_critica: "text-destructive",
  nova_solicitacao: "text-primary",
};

export function CentralNotificacoesHeader() {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<string | null>(null);

  const navigate = useNavigate();
  const { roles } = useAuth();

  const {
    podeVer: podeVerAlertas,
    loading: loadingAlertas,
    totalCriticos,
    totalNaoLidos: totalAlertasNaoLidos,
    alertasPrioritarios,
    alertasRecentes,
    lidoIds,
  } = useAlertasResumo({ limitePrioritarios: 5, limiteRecentes: 5 });

  const {
    data: notificacoes,
    unreadCount: unreadNotificacoes,
    isLoading: loadingNotificacoes,
    markRead,
    markAllRead,
  } = useNotificacoesUnificadas({ limit: 8 });

  const listaAlertas = alertasPrioritarios.length > 0 ? alertasPrioritarios : alertasRecentes;

  // Sem permissão de alertas (produtor, parceiro B2B), a central mostra só notificações.
  const abaAtiva = activeTab ?? (podeVerAlertas ? "alertas" : "notificacoes");


  const badgeCount = totalCriticos > 0
    ? totalCriticos
    : totalAlertasNaoLidos > 0
    ? totalAlertasNaoLidos
    : unreadNotificacoes;

  const isCritico = totalCriticos > 0;
  const exibirBadge = badgeCount > 0;

  const handleNotificacaoClick = (n: NotificacaoUnificada) => {
    if (!n.lido) markRead.mutate(n.id);
    if (!n.link) return;
    const decision = classifyDeepLink(n.link, roles ?? []);
    if (decision.ok === true) {
      navigate(decision.safePath);
    } else {
      toast.error("Link indisponível. Abrindo a central.");
      navigate(CENTRAL_NOTIFICACOES_ROUTE);
    }
    setOpen(false);
  };

  const handleMarkAllRead = () => {
    markAllRead.mutate();
  };

  const NotificacaoIcon = ({ tipo }: { tipo: string }) => {
    const Icon = TIPO_ICON[tipo] || Bell;
    return <Icon className={cn("h-4 w-4 shrink-0 mt-0.5", TIPO_COLOR[tipo] || "text-muted-foreground")} />;
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative h-9 w-9 shrink-0"
          aria-label={`Central de notificações${badgeCount > 0 ? `, ${badgeCount} não lidas` : ""}`}
        >
          <Bell className="h-4 w-4" />
          {exibirBadge && (
            <span
              className={cn(
                "absolute -top-0.5 -right-0.5 inline-flex items-center justify-center rounded-full h-4 min-w-[16px] px-1 text-[9px] font-bold",
                isCritico
                  ? "bg-destructive text-destructive-foreground animate-pulse"
                  : "bg-primary text-primary-foreground"
              )}
            >
              {badgeCount > 99 ? "99+" : badgeCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-[360px] p-0" sideOffset={8}>
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <div className="px-3 pt-3 pb-2 border-b">
            <TabsList className="grid w-full grid-cols-2 h-9">
              <TabsTrigger value="alertas" className="text-xs">
                Alertas
                {totalAlertasNaoLidos > 0 && (
                  <Badge
                    variant={isCritico ? "destructive" : "secondary"}
                    className="ml-1.5 h-4 px-1 text-[10px]"
                  >
                    {totalAlertasNaoLidos > 99 ? "99+" : totalAlertasNaoLidos}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="notificacoes" className="text-xs">
                Notificações
                {unreadNotificacoes > 0 && (
                  <Badge variant="secondary" className="ml-1.5 h-4 px-1 text-[10px]">
                    {unreadNotificacoes > 99 ? "99+" : unreadNotificacoes}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="alertas" className="mt-0">
            <div className="px-3 py-2 border-b flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold">Alertas prioritários</p>
                <p className="text-[10px] text-muted-foreground">
                  {totalCriticos} críticos · {totalAlertasNaoLidos} não lidos
                </p>
              </div>
            </div>
            <ScrollArea className="h-64">
              {loadingAlertas ? (
                <p className="text-xs text-muted-foreground text-center py-6">Carregando…</p>
              ) : !podeVerAlertas ? (
                <p className="text-xs text-muted-foreground text-center py-6">
                  Sem permissão para visualizar alertas.
                </p>
              ) : (
                <AlertasMiniList
                  alertas={listaAlertas}
                  lidoIds={lidoIds}
                  onSelect={(id) => {
                    navigate(`/alertas-operacionais?alerta=${id}`);
                    setOpen(false);
                  }}
                />
              )}
            </ScrollArea>
            <div className="border-t p-2">
              <Button asChild size="sm" variant="secondary" className="w-full">
                <Link to="/alertas-operacionais">
                  <ExternalLink className="h-3 w-3 mr-1.5" />
                  Ver alertas
                </Link>
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="notificacoes" className="mt-0">
            <div className="px-3 py-2 border-b flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold">Notificações</p>
                <p className="text-[10px] text-muted-foreground">
                  {unreadNotificacoes} não lidas
                </p>
              </div>
              {unreadNotificacoes > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={handleMarkAllRead}
                >
                  <Check className="h-3 w-3 mr-1" />
                  Marcar todas
                </Button>
              )}
            </div>
            <ScrollArea className="h-64">
              {loadingNotificacoes ? (
                <p className="text-xs text-muted-foreground text-center py-6">Carregando…</p>
              ) : !notificacoes || notificacoes.length === 0 ? (
                <div className="p-6 text-center text-sm text-muted-foreground">
                  Sem notificações
                </div>
              ) : (
                <div className="divide-y divide-border/50">
                  {notificacoes.map((n) => (
                    <button
                      key={n.id}
                      onClick={() => handleNotificacaoClick(n)}
                      className={cn(
                        "w-full text-left px-3 py-2.5 hover:bg-muted/50 transition flex gap-2.5",
                        !n.lido && "bg-primary/5"
                      )}
                    >
                      <NotificacaoIcon tipo={n.tipo} />
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
                          {format(new Date(n.created_at), "dd/MM HH:mm", { locale: ptBR })} ·{" "}
                          {n.origem === "portal" ? "Portal" : "Operacional"}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </ScrollArea>
            <div className="border-t p-2">
              <Button
                variant="ghost"
                size="sm"
                className="w-full h-8 text-xs justify-center"
                onClick={() => {
                  navigate(CENTRAL_NOTIFICACOES_ROUTE);
                  setOpen(false);
                }}
              >
                <ExternalLink className="h-3 w-3 mr-1.5" /> Abrir central
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </PopoverContent>
    </Popover>
  );
}
