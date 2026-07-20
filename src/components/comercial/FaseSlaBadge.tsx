import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { AlertTriangle, Clock } from "lucide-react";
import { FASE_LABEL, type SlaBadgeInfo } from "@/lib/b2bSla";

type Props = {
  info: SlaBadgeInfo | null | undefined;
  /** Para o portal do parceiro: mostra só "Em atraso" sem expor limite interno. */
  modoParceiro?: boolean;
  className?: string;
};

export function FaseSlaBadge({ info, modoParceiro, className }: Props) {
  if (!info) return null;
  if (!info.atrasada && !info.proximoEstouro) return null;

  const horas = info.horasDecorridas.toFixed(1);
  const tooltip = modoParceiro
    ? info.atrasada
      ? "Pedido com tempo de etapa acima do esperado"
      : ""
    : `Fase ${FASE_LABEL[info.fase]} há ${horas}h (limite ${info.prazo}h)`;

  const label = info.atrasada
    ? modoParceiro ? "Em atraso" : `Atrasado · ${FASE_LABEL[info.fase]}`
    : `Próx. limite · ${FASE_LABEL[info.fase]}`;

  const Icon = info.atrasada ? AlertTriangle : Clock;
  const variant = info.atrasada ? "destructive" : "outline";

  const badge = (
    <Badge variant={variant as any} className={`gap-1 ${className ?? ""}`}>
      <Icon className="h-3 w-3" />
      {label}
    </Badge>
  );

  if (!tooltip) return badge;
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex">{badge}</span>
        </TooltipTrigger>
        <TooltipContent>{tooltip}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
