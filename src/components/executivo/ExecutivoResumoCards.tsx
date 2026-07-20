import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Inbox, ClipboardCheck, FileText, ClipboardList, AlertCircle, ShieldCheck,
  Package, Tag, Truck, FileX, Receipt, Siren, Clock,
} from "lucide-react";

interface Props {
  resumo: Record<string, number> | undefined;
  indisponiveis: string[];
  isLoading: boolean;
}

type CardDef = {
  key: string;
  title: string;
  icon: any;
  route: string;
  gravidade?: (v: number) => "critico" | "atencao" | "ok";
};

const CARDS: CardDef[] = [
  { key: "solicitacoes_abertas", title: "Solicitações abertas", icon: Inbox, route: "/solicitacoes" },
  { key: "visitas_pendentes", title: "Visitas pendentes", icon: ClipboardCheck, route: "/visita-tecnica" },
  { key: "recomendacoes_pendentes", title: "Recomendações pendentes", icon: FileText, route: "/consultor-tecnico" },
  { key: "os_ativas", title: "OS ativas", icon: ClipboardList, route: "/ordens-servico" },
  { key: "os_atrasadas", title: "OS atrasadas", icon: AlertCircle, route: "/ordens-servico", gravidade: (v) => (v > 0 ? "critico" : "ok") },
  { key: "cq_pendente", title: "CQ pendente", icon: ShieldCheck, route: "/controle-qualidade", gravidade: (v) => (v > 0 ? "atencao" : "ok") },
  { key: "embalagens_em_estoque", title: "Embalagens em estoque", icon: Package, route: "/estoque/embalagens" },
  { key: "embalagens_sem_etiqueta", title: "Embalagens sem etiqueta", icon: Tag, route: "/estoque/embalagens", gravidade: (v) => (v > 0 ? "atencao" : "ok") },
  { key: "entregas_pendentes", title: "Entregas pendentes", icon: Truck, route: "/entregas" },
  { key: "entregas_sem_comprovante", title: "Entregas sem comprovante", icon: FileX, route: "/entregas", gravidade: (v) => (v > 0 ? "critico" : "ok") },
  { key: "entregas_nao_faturadas", title: "Entregas não faturadas", icon: Receipt, route: "/financeiro/entregas-nao-faturadas", gravidade: (v) => (v > 0 ? "atencao" : "ok") },
  { key: "alertas_criticos", title: "Alertas críticos", icon: Siren, route: "/alertas-operacionais", gravidade: (v) => (v > 0 ? "critico" : "ok") },
  { key: "sla_vencidos", title: "SLA vencidos", icon: Clock, route: "/alertas-operacionais", gravidade: (v) => (v > 0 ? "critico" : "ok") },
];

function Tag_({ kind }: { kind: "critico" | "atencao" | "ok" | "sem_dados" }) {
  if (kind === "critico") return <Badge variant="destructive">Crítico</Badge>;
  if (kind === "atencao") return <Badge className="bg-amber-500 hover:bg-amber-500">Atenção</Badge>;
  if (kind === "sem_dados") return <Badge variant="outline">Sem dados</Badge>;
  return <Badge variant="secondary">Normal</Badge>;
}

export function ExecutivoResumoCards({ resumo, indisponiveis, isLoading }: Props) {
  const navigate = useNavigate();

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
      {CARDS.map(({ key, title, icon: Icon, route, gravidade }) => {
        const isIndisp = indisponiveis?.includes(key);
        const value = resumo?.[key];
        const kind = isIndisp ? "sem_dados" : (gravidade ? gravidade(value ?? 0) : "ok");
        return (
          <Card
            key={key}
            onClick={() => navigate(route)}
            className="cursor-pointer p-4 hover:shadow-md transition-shadow"
          >
            <div className="flex items-start justify-between mb-2">
              <Icon className="h-4 w-4 text-muted-foreground" />
              <Tag_ kind={kind as any} />
            </div>
            <div className="text-2xl font-bold">
              {isLoading ? "—" : isIndisp ? <span className="text-xs text-muted-foreground font-normal">Sem dados suficientes</span> : value ?? 0}
            </div>
            <div className="text-xs text-muted-foreground mt-1">{title}</div>
          </Card>
        );
      })}
    </div>
  );
}
