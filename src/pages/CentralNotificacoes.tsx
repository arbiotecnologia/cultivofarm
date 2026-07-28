import { useMemo, useState } from "react";
import { Bell, Check, Inbox, AlertTriangle, RefreshCw, Filter } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  useNotificacoesUnificadas,
  type NotificacaoUnificada,
} from "@/hooks/useNotificacoesUnificadas";
import { useAuth } from "@/hooks/useAuth";
import { classifyDeepLink } from "@/lib/notificacoes/deepLinkAllowlist";
import { toast } from "sonner";

type FilterMode = "todas" | "nao_lidas";
type OrigemFilter = "todas" | "operacional" | "portal";

const PAGE_SIZE = 20;

export default function CentralNotificacoes() {
  const { roles } = useAuth();
  const navigate = useNavigate();
  const { all, isLoading, isError, refetch, markRead, markAllRead, unreadCount } =
    useNotificacoesUnificadas({ limit: 200 });

  const [mode, setMode] = useState<FilterMode>("todas");
  const [origem, setOrigem] = useState<OrigemFilter>("todas");
  const [page, setPage] = useState(0);

  const filtered = useMemo<NotificacaoUnificada[]>(() => {
    return (all ?? []).filter((n) => {
      if (mode === "nao_lidas" && n.lido) return false;
      if (origem !== "todas" && n.origem !== origem) return false;
      return true;
    });
  }, [all, mode, origem]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageItems = filtered.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  const handleOpen = (n: NotificacaoUnificada) => {
    if (!n.lido) markRead.mutate(n.id);
    if (!n.link) return;
    const decision = classifyDeepLink(n.link, roles ?? []);
    if (!decision.ok) {
      toast.error(
        decision.reason === "unauthorized"
          ? "Sem acesso a este link. Abra pela central."
          : "Link inválido nesta notificação.",
      );
      return;
    }
    navigate(decision.safePath);
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Bell className="h-6 w-6" /> Central de notificações
          </h1>
          <p className="text-sm text-muted-foreground">
            {unreadCount > 0
              ? `${unreadCount} não lida${unreadCount === 1 ? "" : "s"}`
              : "Nenhuma pendência"}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-1.5" /> Atualizar
          </Button>
          <Button
            variant="default"
            size="sm"
            disabled={unreadCount === 0 || markAllRead.isPending}
            onClick={() => markAllRead.mutate()}
          >
            <Check className="h-4 w-4 mr-1.5" /> Marcar todas como lidas
          </Button>
        </div>
      </header>

      <Card className="p-3 flex flex-wrap gap-2 items-center text-sm">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <FilterChip active={mode === "todas"} onClick={() => setMode("todas")}>
          Todas
        </FilterChip>
        <FilterChip active={mode === "nao_lidas"} onClick={() => setMode("nao_lidas")}>
          Não lidas
        </FilterChip>
        <div className="mx-2 h-4 w-px bg-border" />
        <FilterChip active={origem === "todas"} onClick={() => setOrigem("todas")}>
          Todas origens
        </FilterChip>
        <FilterChip active={origem === "operacional"} onClick={() => setOrigem("operacional")}>
          Operacional
        </FilterChip>
        <FilterChip active={origem === "portal"} onClick={() => setOrigem("portal")}>
          Portal produtor
        </FilterChip>
      </Card>

      {isError && (
        <Card className="p-4 border-destructive/50 text-sm text-destructive">
          Falha ao carregar notificações. <button className="underline" onClick={() => refetch()}>Tentar novamente</button>.
        </Card>
      )}

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-16 rounded-md bg-muted animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card className="p-10 text-center text-muted-foreground">
          <Inbox className="h-10 w-10 mx-auto mb-2 opacity-40" />
          <p className="text-sm">Nenhuma notificação com esses filtros.</p>
        </Card>
      ) : (
        <ul className="space-y-1.5">
          {pageItems.map((n) => (
            <NotifRow key={n.id} n={n} onOpen={() => handleOpen(n)} />
          ))}
        </ul>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <Button
            variant="outline"
            size="sm"
            disabled={page === 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
          >
            Anterior
          </Button>
          <span className="text-muted-foreground">
            Página {page + 1} de {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page + 1 >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
          >
            Próxima
          </Button>
        </div>
      )}
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "px-2.5 py-1 rounded-full text-xs border transition",
        active
          ? "bg-primary text-primary-foreground border-primary"
          : "bg-background text-muted-foreground hover:bg-muted",
      )}
    >
      {children}
    </button>
  );
}

function NotifRow({ n, onOpen }: { n: NotificacaoUnificada; onOpen: () => void }) {
  const severity = tipoSeverity(n.tipo);
  return (
    <li>
      <button
        onClick={onOpen}
        className={cn(
          "w-full text-left flex gap-3 items-start p-3 rounded-md border transition hover:bg-muted/50",
          !n.lido && "bg-primary/5 border-primary/20",
        )}
      >
        <div className="mt-0.5">
          {severity === "critica" ? (
            <AlertTriangle className="h-4 w-4 text-destructive" />
          ) : severity === "alta" ? (
            <AlertTriangle className="h-4 w-4 text-amber-600" />
          ) : (
            <Bell className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className={cn("text-sm truncate", !n.lido && "font-semibold")}>{n.titulo}</p>
            <Badge variant="outline" className="text-[10px] py-0 px-1.5 shrink-0">
              {n.origem === "portal" ? "Portal" : "Operacional"}
            </Badge>
            {!n.lido && <span className="h-2 w-2 rounded-full bg-primary shrink-0" />}
          </div>
          {n.mensagem && (
            <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{n.mensagem}</p>
          )}
          <p className="text-[10px] text-muted-foreground mt-1">
            {format(new Date(n.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })} · {n.tipo}
          </p>
        </div>
      </button>
    </li>
  );
}

function tipoSeverity(tipo: string): "critica" | "alta" | "normal" {
  if (/urgencia_critica|critico|erro/i.test(tipo)) return "critica";
  if (/alerta|atraso|vencido|nova_solicit/i.test(tipo)) return "alta";
  return "normal";
}
