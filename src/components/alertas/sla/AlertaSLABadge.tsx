import { Badge } from "@/components/ui/badge";
import { Clock, AlertTriangle, CheckCircle2, ArrowUpCircle, MinusCircle } from "lucide-react";

interface Props {
  slaResolucaoEm?: string | null;
  slaVencido?: boolean;
  escalonado?: boolean;
  resolvido?: boolean;
}

function formatRemaining(ms: number) {
  const abs = Math.abs(ms);
  const mins = Math.round(abs / 60000);
  if (mins < 60) return `${mins}min`;
  const hrs = Math.round(mins / 60);
  if (hrs < 48) return `${hrs}h`;
  return `${Math.round(hrs / 24)}d`;
}

export function AlertaSLABadge({ slaResolucaoEm, slaVencido, escalonado, resolvido }: Props) {
  if (!slaResolucaoEm) {
    return (
      <Badge variant="outline" className="gap-1 text-muted-foreground">
        <MinusCircle className="h-3 w-3" /> Sem SLA
      </Badge>
    );
  }

  if (escalonado) {
    return (
      <Badge variant="outline" className="gap-1 border-orange-500/40 bg-orange-500/10 text-orange-700 dark:text-orange-400">
        <ArrowUpCircle className="h-3 w-3" /> Escalonado
      </Badge>
    );
  }

  if (slaVencido) {
    return (
      <Badge variant="outline" className="gap-1 border-destructive/40 bg-destructive/10 text-destructive">
        <AlertTriangle className="h-3 w-3" /> SLA vencido
      </Badge>
    );
  }

  const diff = new Date(slaResolucaoEm).getTime() - Date.now();
  if (resolvido) {
    return (
      <Badge variant="outline" className="gap-1 border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">
        <CheckCircle2 className="h-3 w-3" /> Resolvido
      </Badge>
    );
  }

  return (
    <Badge variant="outline" className="gap-1">
      <Clock className="h-3 w-3" /> Vence em {formatRemaining(diff)}
    </Badge>
  );
}
