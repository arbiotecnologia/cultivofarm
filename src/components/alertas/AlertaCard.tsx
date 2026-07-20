import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertaGravidadeBadge } from "./AlertaGravidadeBadge";
import { AlertaStatusBadge } from "./AlertaStatusBadge";
import { AlertaSLABadge } from "./sla/AlertaSLABadge";
import type { AlertaOperacional } from "@/hooks/useAlertasOperacionais";
import { ArrowRight, ArrowUpCircle, AlertTriangle } from "lucide-react";
import { formatDateDisplay } from "@/lib/date-utils";

interface Props {
  alerta: AlertaOperacional;
  onOpen: (a: AlertaOperacional) => void;
  lido?: boolean;
}

export function AlertaCard({ alerta, onOpen, lido }: Props) {
  const critico = alerta.gravidade === "critica";
  const highPriority = (alerta.prioridade_score ?? 0) >= 100;
  return (
    <Card
      className={`hover:shadow-md transition-shadow ${
        critico || highPriority ? "border-destructive border-l-4 shadow-sm" : ""
      } ${lido === false ? "bg-primary/5" : ""}`}
    >
      <CardContent className="p-4 space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <AlertaGravidadeBadge gravidade={alerta.gravidade} />
              <AlertaStatusBadge status={alerta.status} />
              <span className="text-xs text-muted-foreground uppercase">{alerta.origem}</span>
              <AlertaSLABadge
                slaResolucaoEm={alerta.sla_resolucao_em}
                slaVencido={!!alerta.sla_vencido}
                escalonado={!!alerta.escalonado}
                resolvido={alerta.status === "resolvido"}
              />
              {alerta.sla_vencido && (
                <Badge variant="outline" className="gap-1 border-destructive/40 bg-destructive/10 text-destructive text-[10px]">
                  <AlertTriangle className="h-3 w-3" /> Vencido
                </Badge>
              )}
              {alerta.escalonado && (
                <Badge variant="outline" className="gap-1 border-orange-500/40 bg-orange-500/10 text-orange-700 dark:text-orange-400 text-[10px]">
                  <ArrowUpCircle className="h-3 w-3" /> Escalonado
                </Badge>
              )}
              {typeof alerta.prioridade_score === "number" && alerta.prioridade_score > 0 && (
                <Badge variant="secondary" className="text-[10px]">
                  P{alerta.prioridade_score}
                </Badge>
              )}
              {lido === false && (
                <span className="h-2 w-2 rounded-full bg-primary" aria-label="Não lido" />
              )}
            </div>
            <h3 className="font-semibold text-sm truncate">{alerta.titulo}</h3>
            <p className="text-sm text-muted-foreground line-clamp-2">{alerta.descricao}</p>
          </div>
          <Button size="sm" variant="outline" onClick={() => onOpen(alerta)}>
            Detalhe <ArrowRight className="h-3 w-3 ml-1" />
          </Button>
        </div>
        {alerta.proxima_acao && (
          <p className="text-xs"><span className="font-medium">Próxima ação:</span> {alerta.proxima_acao}</p>
        )}
        <p className="text-xs text-muted-foreground">Criado em {formatDateDisplay(alerta.created_at)}</p>
      </CardContent>
    </Card>
  );
}
