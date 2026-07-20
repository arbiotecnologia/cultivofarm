import { BICardKPI } from "../BICardKPI";
import { TrendingUp, FileCheck, CheckCircle2, Clock } from "lucide-react";

interface BIRecomendacoesResumoProps {
  indicadores: {
    emitidas: number;
    liberadas: number;
    aguardandoDecisao: number;
    convertidasOS: number;
    taxaConversao: number;
    taxaLiberacao: number;
  };
  loading?: boolean;
}

export function BIRecomendacoesResumo({ indicadores, loading }: BIRecomendacoesResumoProps) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <BICardKPI 
          titulo="Taxa de Liberação" 
          valor={indicadores.taxaLiberacao.toFixed(1)} 
          sufixo="%"
          loading={loading}
          icone={CheckCircle2}
          descricao="Recomendações liberadas vs total emitidas"
        />
        <BICardKPI 
          titulo="Taxa de Conversão OS" 
          valor={indicadores.taxaConversao.toFixed(1)} 
          sufixo="%"
          loading={loading}
          icone={TrendingUp}
          variant="success"
          descricao="Recomendações convertidas em OS vs total emitidas"
        />
        <BICardKPI 
          titulo="Aguardando Decisão" 
          valor={indicadores.aguardandoDecisao} 
          loading={loading}
          icone={Clock}
          descricao="Aguardando aceite do produtor no portal"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <BICardKPI titulo="Total Emitidas" valor={indicadores.emitidas} loading={loading} />
        <BICardKPI titulo="Total Liberadas" valor={indicadores.liberadas} loading={loading} />
        <BICardKPI titulo="Convertidas em OS" valor={indicadores.convertidasOS} loading={loading} />
        <BICardKPI titulo="Decisões Pendentes" valor={indicadores.aguardandoDecisao} loading={loading} variant="warning" />
      </div>
    </div>
  );
}
