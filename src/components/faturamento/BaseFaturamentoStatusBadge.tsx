import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface BaseFaturamentoStatusBadgeProps {
  status: "PENDENTE" | "LIBERADO_FATURAMENTO" | "FATURADO_PARCIAL" | "FATURADO_TOTAL" | "CANCELADO";
  className?: string;
}

const statusMap = {
  PENDENTE: { label: "Pendente", color: "bg-amber-100 text-amber-700 border-amber-200" },
  LIBERADO_FATURAMENTO: { label: "Liberado p/ Faturamento", color: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  FATURADO_PARCIAL: { label: "Faturado Parcial", color: "bg-blue-100 text-blue-700 border-blue-200" },
  FATURADO_TOTAL: { label: "Faturado Total", color: "bg-primary/10 text-primary border-primary/20" },
  CANCELADO: { label: "Cancelado", color: "bg-muted text-muted-foreground border-transparent" },
};

export function BaseFaturamentoStatusBadge({ status, className }: BaseFaturamentoStatusBadgeProps) {
  const config = statusMap[status] || { label: status, color: "bg-muted text-muted-foreground" };
  
  return (
    <Badge 
      variant="outline" 
      className={cn("font-semibold", config.color, className)}
    >
      {config.label}
    </Badge>
  );
}
