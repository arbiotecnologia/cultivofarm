import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  AlertTriangle, AlertCircle, Clock, UserX, Truck, Receipt,
  CalendarClock, Beaker, Package, Bell
} from "lucide-react";

interface Resumo {
  alertas_abertos: number;
  alertas_criticos: number;
  alertas_altos: number;
  sla_vencidos: number;
  sla_vencendo_hoje: number;
  alertas_sem_responsavel: number;
  entregas_sem_comprovante: number;
  entregas_nao_faturadas: number;
  os_atrasadas: number;
  cq_pendente: number;
  embalagens_sem_etiqueta: number;
}

interface Props {
  resumo?: Resumo;
  indisponiveis?: string[];
  isLoading?: boolean;
}

export function ExecutivoAlertasCards({ resumo, indisponiveis = [], isLoading }: Props) {
  const nav = useNavigate();

  const cards: Array<{
    key: keyof Resumo;
    label: string;
    icon: React.ComponentType<any>;
    tone: "danger" | "warn" | "info";
    route?: string;
  }> = [
    { key: "alertas_abertos", label: "Alertas abertos", icon: Bell, tone: "info", route: "/alertas-operacionais" },
    { key: "alertas_criticos", label: "Críticos", icon: AlertCircle, tone: "danger", route: "/alertas-operacionais?gravidade=critica" },
    { key: "alertas_altos", label: "Altos", icon: AlertTriangle, tone: "warn", route: "/alertas-operacionais?gravidade=alta" },
    { key: "sla_vencidos", label: "SLA vencidos", icon: Clock, tone: "danger", route: "/alertas-operacionais" },
    { key: "sla_vencendo_hoje", label: "Vencendo hoje", icon: CalendarClock, tone: "warn", route: "/alertas-operacionais" },
    { key: "alertas_sem_responsavel", label: "Sem responsável", icon: UserX, tone: "warn", route: "/alertas-operacionais" },
    { key: "entregas_sem_comprovante", label: "Entregas s/ comprovante", icon: Truck, tone: "warn", route: "/entregas" },
    { key: "entregas_nao_faturadas", label: "Entregas não faturadas", icon: Receipt, tone: "warn", route: "/financeiro/entregas-nao-faturadas" },
    { key: "os_atrasadas", label: "OS atrasadas", icon: Clock, tone: "danger", route: "/ordens-servico" },
    { key: "embalagens_sem_etiqueta", label: "Embalagens s/ etiqueta", icon: Package, tone: "warn", route: "/estoque/embalagens" },
  ];

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-2">
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="h-20 bg-muted rounded animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-2">
      {cards.map(({ key, label, icon: Icon, tone, route }) => {
        const indisponivel = indisponiveis.includes(key);
        const valor = resumo?.[key] ?? 0;
        const toneCls = tone === "danger" ? "text-destructive" : tone === "warn" ? "text-amber-600" : "text-foreground";
        return (
          <Card
            key={key}
            className={`p-3 cursor-pointer hover:shadow-md transition ${route ? "" : "opacity-90"}`}
            onClick={() => route && nav(route)}
            role={route ? "button" : undefined}
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</span>
              <Icon className={`h-3.5 w-3.5 ${toneCls}`} />
            </div>
            <div className={`mt-1 text-xl font-semibold ${toneCls}`}>
              {indisponivel ? <Badge variant="outline" className="text-[10px]">Sem dados suficientes</Badge> : valor}
            </div>
          </Card>
        );
      })}
    </div>
  );
}
