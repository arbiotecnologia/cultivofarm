import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ExternalLink } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface Item {
  tipo: string;
  titulo: string;
  descricao: string;
  gravidade: string;
  status: string;
  cliente?: string;
  fazenda?: string;
  responsavel?: string;
  sla_resolucao_em?: string;
  sla_vencido?: boolean;
  dias_em_aberto?: number;
  referencia_id?: string;
  acao_recomendada?: string;
  rota_origem?: string;
}

interface Props {
  prioridades: Item[];
  isLoading?: boolean;
}

const gravBadge = (g: string) => {
  const map: Record<string, string> = {
    critica: "bg-destructive text-destructive-foreground",
    alta: "bg-amber-500 text-white",
    media: "bg-yellow-400 text-black",
    baixa: "bg-muted text-muted-foreground",
  };
  return map[g] ?? "bg-muted text-muted-foreground";
};

export function ExecutivoPrioridades({ prioridades, isLoading }: Props) {
  const nav = useNavigate();

  if (isLoading) {
    return (
      <Card className="p-4">
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-14 bg-muted rounded animate-pulse" />)}
        </div>
      </Card>
    );
  }

  if (!prioridades.length) {
    return <Card className="p-6 text-center text-sm text-muted-foreground">Sem prioridades no momento.</Card>;
  }

  return (
    <Card className="p-3 md:p-4">
      <h3 className="text-sm font-semibold mb-3">Prioridades executivas</h3>
      <ul className="space-y-2">
        {prioridades.map((p, i) => (
          <li key={i} className="border rounded-md p-3 hover:bg-muted/40 transition">
            <div className="flex flex-wrap items-start gap-2">
              <Badge className={`text-[10px] ${gravBadge(p.gravidade)}`}>{p.gravidade}</Badge>
              {p.sla_vencido && <Badge variant="destructive" className="text-[10px]">SLA vencido</Badge>}
              {!p.responsavel || p.responsavel === "Sem responsável" ? (
                <Badge variant="outline" className="text-[10px] text-amber-600">Sem responsável</Badge>
              ) : null}
              <span className="text-xs font-medium truncate flex-1">{p.titulo}</span>
              {p.rota_origem && (
                <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => nav(p.rota_origem!)}>
                  <ExternalLink className="h-3 w-3 mr-1" /> Abrir origem
                </Button>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground mt-1 line-clamp-2">{p.descricao}</p>
            <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 text-[10px] text-muted-foreground">
              {p.cliente && <span>👤 {p.cliente}</span>}
              {p.fazenda && <span>🌾 {p.fazenda}</span>}
              {p.responsavel && <span>👨‍💼 {p.responsavel}</span>}
              {typeof p.dias_em_aberto === "number" && <span>⏱ {p.dias_em_aberto}d em aberto</span>}
              {p.acao_recomendada && <span className="text-primary">→ {p.acao_recomendada}</span>}
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
