import { Card } from "@/components/ui/card";
import { ShieldCheck, ShieldAlert, ShieldX, Shield } from "lucide-react";

interface Props {
  score: number;
  classificacao: string;
  motivos: string[];
}

export function ExecutivoSaudeCarteira({ score, classificacao, motivos }: Props) {
  const cfg =
    classificacao === "saudavel" ? { Icon: ShieldCheck, cls: "text-emerald-600", label: "Saudável" } :
    classificacao === "atencao"  ? { Icon: ShieldAlert, cls: "text-amber-600",   label: "Atenção" } :
    classificacao === "critico"  ? { Icon: ShieldX,     cls: "text-destructive", label: "Crítico" } :
                                   { Icon: Shield,      cls: "text-muted-foreground", label: "Sem dados" };
  const { Icon } = cfg;

  return (
    <Card className="p-4 h-full">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Icon className={`h-4 w-4 ${cfg.cls}`} />
        <span>Saúde da Carteira</span>
      </div>
      <div className={`mt-2 text-3xl font-bold ${cfg.cls}`}>{score}</div>
      <div className={`text-xs ${cfg.cls}`}>{cfg.label}</div>
      {motivos.length > 0 && (
        <ul className="mt-3 space-y-1 text-xs text-muted-foreground list-disc pl-4">
          {motivos.slice(0, 4).map((m, i) => <li key={i}>{m}</li>)}
        </ul>
      )}
    </Card>
  );
}
