import { Badge } from "@/components/ui/badge";
import type { AlertaGravidade } from "@/hooks/useAlertasOperacionais";
import { cn } from "@/lib/utils";

const MAP: Record<AlertaGravidade, { label: string; cls: string }> = {
  critica: { label: "Crítica", cls: "bg-destructive text-destructive-foreground" },
  alta: { label: "Alta", cls: "bg-orange-500 text-white" },
  media: { label: "Média", cls: "bg-yellow-500 text-black" },
  baixa: { label: "Baixa", cls: "bg-blue-500 text-white" },
  informativa: { label: "Info", cls: "bg-muted text-muted-foreground" },
};

export function AlertaGravidadeBadge({ gravidade }: { gravidade: AlertaGravidade }) {
  const cfg = MAP[gravidade] ?? MAP.media;
  return <Badge className={cn("font-semibold", cfg.cls)}>{cfg.label}</Badge>;
}
