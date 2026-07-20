import { BICardKPI } from "../BICardKPI";
import { BIEmptyState } from "../BIEmptyState";
import { Beaker, CheckCircle2, Ban, PackageSearch, AlertTriangle } from "lucide-react";

interface BIQualidadeCQProps {
  indicadores: {
    aprovados: number;
    reprovados: number;
    taxaAprovacao: number;
    taxaReprovacao: number;
    aguardandoCQ: number;
    produtosReprovacao: Map<string, number>;
  };
  loading?: boolean;
}

export function BIQualidadeCQ({ indicadores, loading }: BIQualidadeCQProps) {
  if (loading) return <div className="h-40 w-full bg-muted animate-pulse rounded-xl" />;

  const total = indicadores.aprovados + indicadores.reprovados;
  
  if (total === 0 && indicadores.aguardandoCQ === 0) {
    return <BIEmptyState mensagem="Nenhum dado de controle de qualidade no período." />;
  }

  const produtosTopReprovacao = Array.from(indicadores.produtosReprovacao.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <BICardKPI 
          titulo="Lotes Aprovados" 
          valor={indicadores.aprovados} 
          loading={loading}
          icone={CheckCircle2}
          variant="success"
        />
        <BICardKPI 
          titulo="Lotes Reprovados" 
          valor={indicadores.reprovados} 
          loading={loading}
          icone={Ban}
          variant="error"
        />
        <BICardKPI 
          titulo="Taxa de Aprovação" 
          valor={total > 0 ? indicadores.taxaAprovacao.toFixed(1) : "—"} 
          sufixo="%"
          loading={loading}
          icone={CheckCircle2}
        />
        <BICardKPI 
          titulo="Aguardando Análise" 
          valor={indicadores.aguardandoCQ} 
          loading={loading}
          icone={Beaker}
          variant="warning"
        />
      </div>

      {produtosTopReprovacao.length > 0 && (
        <div className="bg-white p-4 rounded-xl border shadow-sm">
          <h4 className="text-xs font-bold text-muted-foreground uppercase mb-3 flex items-center gap-2">
            <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
            Produtos com maior taxa de reprovação
          </h4>
          <div className="space-y-2">
            {produtosTopReprovacao.map(([nome, count]) => (
              <div key={nome} className="flex items-center justify-between py-1 border-b last:border-0 border-slate-50">
                <span className="text-sm font-medium">{nome}</span>
                <span className="text-sm font-black text-red-600">{count} lotes</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
