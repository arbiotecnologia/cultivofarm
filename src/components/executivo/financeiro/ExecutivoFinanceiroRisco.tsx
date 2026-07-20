import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Heart, AlertTriangle, ShieldAlert, HelpCircle } from "lucide-react";

interface Props {
  score: number;
  classificacao: string;
  motivos: string[];
}

const MAP: Record<string, { icon: any; label: string; cls: string }> = {
  saudavel: { icon: Heart, label: "Saudável", cls: "bg-emerald-500/10 text-emerald-700" },
  atencao: { icon: AlertTriangle, label: "Atenção", cls: "bg-amber-500/10 text-amber-700" },
  critico: { icon: ShieldAlert, label: "Crítico", cls: "bg-destructive/10 text-destructive" },
  sem_dados: { icon: HelpCircle, label: "Sem dados", cls: "bg-muted text-muted-foreground" },
};

export function ExecutivoFinanceiroRisco({ score, classificacao, motivos }: Props) {
  const cfg = MAP[classificacao] ?? MAP.sem_dados;
  const Icon = cfg.icon;
  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Risco financeiro</h3>
        <Badge className={cfg.cls} variant="secondary">
          <Icon className="h-3 w-3 mr-1" />
          {cfg.label}
        </Badge>
      </div>
      <div className="text-3xl font-bold">{score}</div>
      {motivos.length > 0 ? (
        <ul className="text-xs text-muted-foreground space-y-1 list-disc pl-4">
          {motivos.map((m, i) => <li key={i}>{m}</li>)}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">Sem motivos relevantes no período.</p>
      )}
    </Card>
  );
}
