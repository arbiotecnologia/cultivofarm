import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAlertasSLA } from "@/hooks/useAlertasSLA";
import { useAuth } from "@/hooks/useAuth";
import { AlertTriangle, ArrowUpCircle, Clock, RefreshCw } from "lucide-react";

interface Props {
  metricas?: {
    vencidos: number;
    escalonados: number;
    vencendoHoje: number;
    criticosForaSla: number;
  };
}

const ROLES_APLICAR_SLA = ["administrador", "gestor", "administrativo"] as const;

export function AlertasSLAPainel({ metricas }: Props) {
  const { aplicarSLA, loading } = useAlertasSLA();
  const { role } = useAuth();
  const podeAplicar = !!role && (ROLES_APLICAR_SLA as readonly string[]).includes(role);
  const data = metricas ?? { vencidos: 0, escalonados: 0, vencendoHoje: 0, criticosForaSla: 0 };

  const cards = [
    { label: "SLA vencidos", value: data.vencidos, icon: AlertTriangle, color: "text-destructive" },
    { label: "Escalonados", value: data.escalonados, icon: ArrowUpCircle, color: "text-orange-600" },
    { label: "Vencendo hoje", value: data.vencendoHoje, icon: Clock, color: "text-amber-600" },
    { label: "Críticos fora SLA", value: data.criticosForaSla, icon: AlertTriangle, color: "text-destructive" },
  ];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-base">Painel SLA</CardTitle>
        {podeAplicar && (
          <Button size="sm" variant="outline" onClick={() => aplicarSLA()} disabled={loading}>
            <RefreshCw className="mr-2 h-3 w-3" />
            Aplicar SLA agora
          </Button>
        )}
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {cards.map((c) => (
            <div key={c.label} className="rounded-md border p-3">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <c.icon className={`h-3.5 w-3.5 ${c.color}`} />
                {c.label}
              </div>
              <div className="mt-1 text-2xl font-semibold">{c.value}</div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
