import { Badge } from "@/components/ui/badge";
import type { AlertaStatus } from "@/hooks/useAlertasOperacionais";

const MAP: Record<AlertaStatus, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  aberto: { label: "Aberto", variant: "destructive" },
  lido: { label: "Lido", variant: "default" },
  resolvido: { label: "Resolvido", variant: "secondary" },
  ignorado: { label: "Ignorado", variant: "outline" },
  reaberto: { label: "Reaberto", variant: "destructive" },
};

export function AlertaStatusBadge({ status }: { status: AlertaStatus }) {
  const cfg = MAP[status] ?? MAP.aberto;
  return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
}
