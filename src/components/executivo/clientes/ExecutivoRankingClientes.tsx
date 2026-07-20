import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { brl } from "@/lib/financial/format";
import type { RankingClienteItem } from "@/hooks/useExecutivoClientesRanking";

interface Props {
  ranking: RankingClienteItem[];
  isLoading?: boolean;
  onSelect: (clienteId: string) => void;
}

function classifBadge(c: string) {
  const tone = c === "saudavel" ? "bg-emerald-100 text-emerald-700"
            : c === "atencao"  ? "bg-amber-100 text-amber-700"
            : c === "critico"  ? "bg-destructive/10 text-destructive"
            : "bg-muted text-muted-foreground";
  const lab = c === "saudavel" ? "Saudável" : c === "atencao" ? "Atenção" : c === "critico" ? "Crítico" : c;
  return <span className={`text-[10px] px-1.5 py-0.5 rounded ${tone}`}>{lab}</span>;
}

export function ExecutivoRankingClientes({ ranking, isLoading, onSelect }: Props) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold">Ranking de Clientes</h3>
        <Badge variant="outline" className="text-[10px]">{ranking.length}</Badge>
      </div>
      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-10 bg-muted rounded animate-pulse" />)}</div>
      ) : ranking.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nenhum cliente encontrado para os filtros aplicados.</p>
      ) : (
        <div className="space-y-1.5 max-h-[420px] overflow-auto">
          {ranking.map((c) => (
            <button
              key={c.cliente_id}
              onClick={() => onSelect(c.cliente_id)}
              className="w-full text-left p-2 rounded-md border bg-card hover:bg-accent transition-colors"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-medium truncate">{c.cliente_nome}</div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {classifBadge(c.classificacao)}
                  <span className="text-xs font-semibold">{c.score_cliente}</span>
                </div>
              </div>
              <div className="mt-1 grid grid-cols-2 md:grid-cols-4 gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                <span>Vencido: <strong className="text-destructive">{brl(Number(c.valor_vencido || 0))}</strong></span>
                <span>A receber: {brl(Number(c.valor_a_receber || 0))}</span>
                <span>Não faturadas: {c.entregas_nao_faturadas}</span>
                <span>Alertas: {c.alertas_criticos}</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </Card>
  );
}
