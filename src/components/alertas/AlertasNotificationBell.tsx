import { Bell } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useAlertasResumo } from "@/hooks/useAlertasResumo";
import { AlertasMiniList } from "./AlertasMiniList";
import { cn } from "@/lib/utils";

/**
 * Sino de notificações para o header global. Esconde-se para perfis
 * sem permissão e indica críticos com destaque visual.
 */
export function AlertasNotificationBell() {
  const navigate = useNavigate();
  const {
    podeVer,
    loading,
    totalNaoLidos,
    totalCriticos,
    alertasPrioritarios,
    alertasRecentes,
    lidoIds,
  } = useAlertasResumo({ limitePrioritarios: 5, limiteRecentes: 5 });

  if (!podeVer) return null;

  const isCritico = totalCriticos > 0;
  const exibirBadge = totalNaoLidos > 0 || totalCriticos > 0;
  const lista = alertasPrioritarios.length > 0 ? alertasPrioritarios : alertasRecentes;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative h-9 w-9 shrink-0"
          aria-label="Alertas"
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
              {(isCritico ? totalCriticos : totalNaoLidos) > 99
                ? "99+"
                : isCritico
                ? totalCriticos
                : totalNaoLidos}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[320px] p-0 max-h-[80vh] overflow-hidden flex flex-col">
        <div className="px-3 py-2 border-b flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold">Alertas prioritários</p>
            <p className="text-[10px] text-muted-foreground">
              {totalCriticos} críticos · {totalNaoLidos} não lidos
            </p>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto max-h-[50vh]">
          {loading ? (
            <p className="text-xs text-muted-foreground text-center py-6">Carregando…</p>
          ) : (
            <AlertasMiniList
              alertas={lista}
              lidoIds={lidoIds}
              onSelect={(id) => navigate(`/alertas-operacionais?alerta=${id}`)}
            />
          )}
        </div>
        <div className="border-t p-2">
          <Button asChild size="sm" variant="secondary" className="w-full">
            <Link to="/alertas-operacionais">Ver alertas</Link>
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
