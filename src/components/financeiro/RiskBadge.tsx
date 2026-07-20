import { Badge } from "@/components/ui/badge";

const MAP: Record<string, { label: string; cls: string }> = {
  baixo:   { label: "Baixo",    cls: "bg-emerald-100 text-emerald-800 border-emerald-200" },
  medio:   { label: "Médio",    cls: "bg-amber-100 text-amber-800 border-amber-200" },
  alto:    { label: "Alto",     cls: "bg-orange-100 text-orange-800 border-orange-200" },
  critico: { label: "Crítico",  cls: "bg-red-100 text-red-800 border-red-200" },
};

export function RiskBadge({ level, score }: { level?: string | null; score?: number | null }) {
  const m = MAP[level ?? "baixo"] ?? MAP.baixo;
  return (
    <Badge variant="outline" className={m.cls}>
      {m.label}{typeof score === "number" ? ` · ${score}` : ""}
    </Badge>
  );
}
