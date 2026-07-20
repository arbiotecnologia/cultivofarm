import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertasMiniList } from "./AlertasMiniList";
import { useAlertasResumo } from "@/hooks/useAlertasResumo";
import { Flame, AlertTriangle, User, Clock } from "lucide-react";

interface Props {
  onSelect?: (id: string) => void;
}

/**
 * Painel de prioridades exibido no topo da Central de Alertas.
 * Usa dados resumidos independentes dos filtros principais para dar
 * uma visão rápida das prioridades atuais conforme a permissão.
 */
export function AlertasPainelPrioridades({ onSelect }: Props) {
  const {
    loading,
    podeVer,
    alertasPrioritarios,
    alertasRecentes,
    meusAlertas,
    lidoIds,
  } = useAlertasResumo({ limitePrioritarios: 5, limiteRecentes: 5 });

  if (!podeVer) return null;

  const criticos = alertasPrioritarios.filter((a) => a.gravidade === "critica");
  const altas = alertasPrioritarios.filter((a) => a.gravidade === "alta");

  const blocos = [
    { titulo: "Alertas Críticos", icon: Flame, cls: "text-destructive", lista: criticos, empty: "Nenhum alerta crítico." },
    { titulo: "Alta Prioridade", icon: AlertTriangle, cls: "text-orange-500", lista: altas, empty: "Nenhum alerta de alta prioridade." },
    { titulo: "Meus Alertas", icon: User, cls: "text-primary", lista: meusAlertas, empty: "Nenhum alerta vinculado a você." },
    { titulo: "Recentes", icon: Clock, cls: "text-muted-foreground", lista: alertasRecentes, empty: "Nenhum alerta recente." },
  ];

  return (
    <div>
      <p className="text-xs text-muted-foreground mb-2">
        Prioridades atuais conforme sua permissão.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
        {blocos.map((b) => (
          <Card key={b.titulo} className="flex flex-col">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <b.icon className={`h-4 w-4 ${b.cls}`} />
                {b.titulo}
                <span className="ml-auto text-xs text-muted-foreground font-normal">
                  {b.lista.length}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0 flex-1">
              {loading ? (
                <p className="text-xs text-muted-foreground text-center py-4">Carregando…</p>
              ) : (
                <AlertasMiniList
                  alertas={b.lista}
                  lidoIds={lidoIds}
                  onSelect={onSelect}
                  emptyLabel={b.empty}
                />
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
