import { Card, CardContent } from "@/components/ui/card";
import { Bell, AlertTriangle, Flame, CheckCircle2, Sparkles, MailOpen } from "lucide-react";

interface Props {
  totalAbertos: number;
  totalNaoLidos?: number;
  totalCriticos: number;
  totalAlta: number;
  totalResolvidos: number;
  totalGeradosHoje?: number;
}

export function AlertasResumoCards({
  totalAbertos,
  totalNaoLidos,
  totalCriticos,
  totalAlta,
  totalResolvidos,
  totalGeradosHoje,
}: Props) {
  const cards = [
    { label: "Abertos", value: totalAbertos, icon: Bell, cls: "text-primary" },
    ...(typeof totalNaoLidos === "number"
      ? [{ label: "Não lidos", value: totalNaoLidos, icon: MailOpen, cls: "text-amber-600" }]
      : []),
    { label: "Críticos", value: totalCriticos, icon: Flame, cls: "text-destructive" },
    { label: "Alta gravidade", value: totalAlta, icon: AlertTriangle, cls: "text-orange-500" },
    { label: "Resolvidos", value: totalResolvidos, icon: CheckCircle2, cls: "text-emerald-600" },
    ...(typeof totalGeradosHoje === "number"
      ? [{ label: "Gerados hoje", value: totalGeradosHoje, icon: Sparkles, cls: "text-blue-500" }]
      : []),
  ];
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
      {cards.map((c) => (
        <Card key={c.label}>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground">{c.label}</p>
              <p className="text-2xl font-bold">{c.value}</p>
            </div>
            <c.icon className={`h-6 w-6 ${c.cls}`} />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
