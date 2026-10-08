import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronRight, AlertCircle } from "lucide-react";
import type { Gargalo } from "@/hooks/useExecutivoGargalos";

interface Props {
  gargalos: Gargalo[];
  isLoading: boolean;
  indisponiveis: string[];
  motivo?: string | null;
  hasError?: boolean;
}

const ROTA_POR_TABELA: Record<string, (id: string) => string> = {
  ordens_servico_onfarm: () => "/ordens-servico",
  entregas: () => "/entregas",
  estoque_embalagens: () => "/estoque/embalagens",
  alertas_operacionais: () => "/alertas-operacionais",
};

function gravidadeBadge(g: string) {
  if (g === "alta") return <Badge variant="destructive">Alta</Badge>;
  if (g === "media") return <Badge className="bg-amber-500 hover:bg-amber-500">Média</Badge>;
  return <Badge variant="secondary">Baixa</Badge>;
}

export function ExecutivoGargalos({ gargalos, isLoading, indisponiveis, motivo, hasError }: Props) {
  const navigate = useNavigate();

  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 mb-3">
        <AlertCircle className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold">Gargalos prioritários</h2>
      </div>
      {isLoading ? (
        <p className="text-xs text-muted-foreground">Carregando…</p>
      ) : hasError || indisponiveis.length > 0 ? (
        <p role="status" className="text-xs text-muted-foreground">
          Gargalos indisponíveis. {hasError ? "Não foi possível consultar os gargalos." : motivo ?? "Fontes sem vínculo organizacional comprovado."}
        </p>
      ) : gargalos.length === 0 ? (
        <p className="text-xs text-muted-foreground">Sem gargalos identificados no período.</p>
      ) : (
        <ul className="space-y-2">
          {gargalos.map((g, i) => {
            const rotaFn = ROTA_POR_TABELA[g.referencia_tabela];
            return (
              <li key={i} className="border rounded-md p-3 flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    {gravidadeBadge(g.gravidade)}
                    <span className="text-sm font-medium truncate">{g.titulo}</span>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">{g.descricao}</p>
                  <div className="text-xs text-muted-foreground mt-1 flex flex-wrap gap-x-3">
                    {g.cliente && <span>Cliente: {g.cliente}</span>}
                    {g.fazenda && <span>Fazenda: {g.fazenda}</span>}
                    <span>{g.dias_em_aberto} dias em aberto</span>
                  </div>
                  <p className="text-xs mt-1">→ {g.acao_recomendada}</p>
                </div>
                {rotaFn && (
                  <Button variant="ghost" size="sm" onClick={() => navigate(rotaFn(g.referencia_id))}>
                    Abrir <ChevronRight className="h-3 w-3 ml-1" />
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
