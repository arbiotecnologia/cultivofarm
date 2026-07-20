import { AlertaSLAEvento } from "@/hooks/useAlertasSLA";
import { formatDateTimeDisplay } from "@/lib/date-utils";
import { Badge } from "@/components/ui/badge";

const EVENTO_LABELS: Record<string, string> = {
  sla_configurado: "SLA configurado",
  primeira_resposta_registrada: "Primeira resposta registrada",
  sla_resposta_vencido: "Prazo de resposta vencido",
  sla_resolucao_vencido: "Prazo de resolução vencido",
  escalonado: "Alerta escalonado",
  prioridade_reclassificada: "Prioridade reclassificada",
  resolvido_dentro_sla: "Resolvido dentro do SLA",
  resolvido_fora_sla: "Resolvido fora do SLA",
  sla_cancelado: "SLA cancelado",
  sla_reaberto: "SLA reaberto",
};

interface Props {
  eventos: AlertaSLAEvento[];
}

export function AlertaSLATimeline({ eventos }: Props) {
  if (!eventos.length) {
    return <p className="text-sm text-muted-foreground">Sem eventos de SLA registrados.</p>;
  }

  return (
    <ol className="relative space-y-3 border-l border-border pl-4">
      {eventos.map((e) => (
        <li key={e.id} className="relative">
          <span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full bg-primary" />
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium">{EVENTO_LABELS[e.evento] || e.evento}</span>
            {e.gravidade_anterior && e.gravidade_nova && (
              <Badge variant="outline" className="text-xs">
                {e.gravidade_anterior} → {e.gravidade_nova}
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground">{formatDateTimeDisplay(e.created_at)}</p>
          {e.observacao && <p className="text-xs">{e.observacao}</p>}
        </li>
      ))}
    </ol>
  );
}
