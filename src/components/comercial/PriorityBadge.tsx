import { Badge } from "@/components/ui/badge";

const MAP: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  normal: { label: "Normal", variant: "outline" },
  urgente: { label: "Urgente", variant: "destructive" },
  programado: { label: "Programado", variant: "secondary" },
};

export function PriorityBadge({ priority }: { priority?: string | null }) {
  const p = MAP[priority ?? "normal"] ?? MAP.normal;
  return <Badge variant={p.variant}>{p.label}</Badge>;
}
