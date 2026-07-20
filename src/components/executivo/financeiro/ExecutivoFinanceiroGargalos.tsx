import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { brl } from "@/lib/financial/format";
import type { FinanceiroGargalo } from "@/hooks/useExecutivoFinanceiroGargalos";
import { ExternalLink } from "lucide-react";

interface Props {
  gargalos: FinanceiroGargalo[];
  isLoading?: boolean;
}

const ROUTE_FOR: Record<string, string> = {
  receber_vencido: "/financeiro/receber?vencidos=1",
  pagar_vencido: "/financeiro/pagar?vencidos=1",
  entrega_nao_faturada: "/financeiro/entregas-nao-faturadas",
  fiscal_pendente: "/financeiro/notas-fiscais",
  recibo_pendente: "/financeiro/recibos",
};

const GRAV_CLS: Record<string, string> = {
  alta: "bg-destructive/10 text-destructive",
  media: "bg-amber-500/10 text-amber-700",
  baixa: "bg-muted text-muted-foreground",
};

export function ExecutivoFinanceiroGargalos({ gargalos, isLoading }: Props) {
  const navigate = useNavigate();
  return (
    <Card className="p-4">
      <h3 className="text-sm font-semibold mb-3">Gargalos financeiros</h3>
      {isLoading ? (
        <div className="text-sm text-muted-foreground">Carregando…</div>
      ) : gargalos.length === 0 ? (
        <div className="text-sm text-muted-foreground">Nenhum gargalo financeiro identificado.</div>
      ) : (
        <ul className="space-y-2">
          {gargalos.map((g, i) => (
            <li key={`${g.referencia_tabela}-${g.referencia_id}-${i}`} className="border rounded-md p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge className={GRAV_CLS[g.gravidade] ?? GRAV_CLS.baixa} variant="secondary">{g.gravidade}</Badge>
                  <span className="text-sm font-medium truncate">{g.titulo}</span>
                </div>
                <div className="text-xs text-muted-foreground mt-1 flex flex-wrap gap-x-3">
                  {g.valor != null && <span>{brl(g.valor)}</span>}
                  {g.dias_atraso > 0 && <span>{g.dias_atraso} dias</span>}
                  {g.cliente && <span>{g.cliente}</span>}
                  {g.fazenda && <span>{g.fazenda}</span>}
                  <span className="italic">{g.acao_recomendada}</span>
                </div>
              </div>
              <Button size="sm" variant="outline" onClick={() => navigate(ROUTE_FOR[g.tipo] ?? "/financeiro")}>
                <ExternalLink className="h-3 w-3 mr-1" /> Abrir origem
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
