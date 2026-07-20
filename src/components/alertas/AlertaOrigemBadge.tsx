import { Badge } from "@/components/ui/badge";
import type { AlertaOrigem } from "@/hooks/useAlertasOperacionais";

const LABEL: Record<AlertaOrigem, string> = {
  visita: "Visita",
  recomendacao: "Recomendação",
  laboratorio: "Laboratório",
  cq: "CQ",
  estoque: "Estoque",
  entrega: "Entrega",
  bi: "BI",
  sistema: "Sistema",
};

export function AlertaOrigemBadge({ origem }: { origem: AlertaOrigem }) {
  return (
    <Badge variant="outline" className="text-[10px] uppercase">
      {LABEL[origem] ?? origem}
    </Badge>
  );
}
