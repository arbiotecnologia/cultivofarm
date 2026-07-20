import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Activity, AlertTriangle, CheckCircle2, HelpCircle } from "lucide-react";

interface Props {
  score: number;
  classificacao: string;
  motivos: string[];
}

const CLASSIF_MAP: Record<string, { label: string; color: string; icon: any }> = {
  saudavel: { label: "Saudável", color: "bg-green-500", icon: CheckCircle2 },
  atencao: { label: "Atenção", color: "bg-amber-500", icon: AlertTriangle },
  critico: { label: "Crítico", color: "bg-red-500", icon: AlertTriangle },
  sem_dados: { label: "Sem dados", color: "bg-muted", icon: HelpCircle },
};

export function ExecutivoSaudeOperacional({ score, classificacao, motivos }: Props) {
  const c = CLASSIF_MAP[classificacao] ?? CLASSIF_MAP.sem_dados;
  const Icon = c.icon;
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Saúde operacional</h2>
        </div>
        <Badge className={`${c.color} hover:${c.color} text-white`}>
          <Icon className="h-3 w-3 mr-1" /> {c.label}
        </Badge>
      </div>
      <div className="flex items-end gap-3 mb-3">
        <div className="text-4xl font-bold">{score}</div>
        <div className="text-xs text-muted-foreground pb-2">/ 100</div>
      </div>
      <div className="h-2 w-full bg-muted rounded-full overflow-hidden mb-3">
        <div className={`h-full ${c.color}`} style={{ width: `${score}%` }} />
      </div>
      {motivos?.length > 0 ? (
        <ul className="space-y-1 text-xs text-muted-foreground">
          {motivos.map((m, i) => (
            <li key={i} className="flex items-start gap-2">
              <span className="text-muted-foreground">•</span>
              <span>{m}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">Nenhuma pendência crítica.</p>
      )}
    </Card>
  );
}
