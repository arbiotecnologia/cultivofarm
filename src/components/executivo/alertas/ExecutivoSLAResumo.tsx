import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ShieldAlert, ShieldCheck, ShieldQuestion } from "lucide-react";

interface Props {
  score: number;
  classificacao: "saudavel" | "atencao" | "critico" | "sem_dados";
  motivos: string[];
}

export function ExecutivoSLAResumo({ score, classificacao, motivos }: Props) {
  const cfg = {
    saudavel: { Icon: ShieldCheck, color: "text-emerald-600", label: "Saudável", bg: "bg-emerald-50 dark:bg-emerald-950/30" },
    atencao: { Icon: ShieldAlert, color: "text-amber-600", label: "Atenção", bg: "bg-amber-50 dark:bg-amber-950/30" },
    critico: { Icon: ShieldAlert, color: "text-destructive", label: "Crítico", bg: "bg-destructive/10" },
    sem_dados: { Icon: ShieldQuestion, color: "text-muted-foreground", label: "Sem dados", bg: "bg-muted/30" },
  }[classificacao] ?? { Icon: ShieldQuestion, color: "text-muted-foreground", label: "—", bg: "bg-muted/30" };

  const { Icon } = cfg;

  return (
    <Card className={`p-4 h-full ${cfg.bg}`}>
      <div className="flex items-center gap-2">
        <Icon className={`h-5 w-5 ${cfg.color}`} />
        <h3 className="text-sm font-semibold">Saúde dos Alertas</h3>
      </div>
      <div className="mt-3 flex items-baseline gap-2">
        <span className={`text-3xl font-bold ${cfg.color}`}>{score}</span>
        <Badge variant="outline" className={cfg.color}>{cfg.label}</Badge>
      </div>
      {motivos.length > 0 && (
        <ul className="mt-3 space-y-1 text-xs text-muted-foreground list-disc pl-4">
          {motivos.slice(0, 4).map((m, i) => <li key={i}>{m}</li>)}
        </ul>
      )}
    </Card>
  );
}
