import { BICardKPI } from "../BICardKPI";
import { 
  FileCheck, 
  TrendingUp, 
  Clock, 
  FileX, 
  FileText, 
  Zap, 
  ArrowRightCircle,
  Timer
} from "lucide-react";

interface BIConversaoKPIsProps {
  indicadores: {
    emitidas: number;
    liberadas: number;
    aguardandoDecisao: number;
    convertidasOS: number;
    naoConvertidas: number;
    taxaConversao: number;
    taxaLiberacao: number;
  };
  indicadoresTempo: {
    emissaoAteLiberacao: number | null;
    aprovacaoAteOS: number | null;
  };
  loading?: boolean;
}

export function BIConversaoKPIs({ indicadores, indicadoresTempo, loading }: BIConversaoKPIsProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      <BICardKPI 
        titulo="Recomendações Emitidas" 
        valor={indicadores.emitidas} 
        loading={loading}
        icone={FileText}
        descricao="Total de laudos técnicos emitidos pela equipe"
      />
      <BICardKPI 
        titulo="Taxa de Liberação" 
        valor={indicadores.taxaLiberacao.toFixed(1)} 
        sufixo="%"
        loading={loading}
        icone={Zap}
        descricao="Laudos prontos para o produtor decidir"
      />
      <BICardKPI 
        titulo="Convertidas em OS" 
        valor={indicadores.convertidasOS} 
        loading={loading}
        icone={TrendingUp}
        variant="success"
        descricao="Oportunidades que viraram ordens de serviço"
      />
      <BICardKPI 
        titulo="Taxa de Conversão OS" 
        valor={indicadores.taxaConversao.toFixed(1)} 
        sufixo="%"
        loading={loading}
        icone={ArrowRightCircle}
        variant="success"
        descricao="Eficiência comercial de recomendação -> OS"
      />
      
      <BICardKPI 
        titulo="Aguardando Decisão" 
        valor={indicadores.aguardandoDecisao} 
        loading={loading}
        icone={Clock}
        variant="warning"
        descricao="Liberadas aguardando aceite (dentro do prazo)"
      />
      <BICardKPI 
        titulo="Oportunidades Perdidas" 
        valor={indicadores.naoConvertidas} 
        loading={loading}
        icone={FileX}
        variant="error"
        descricao="Liberadas sem OS há mais de 15 dias"
      />
      <BICardKPI 
        titulo="Tempo Emissão → Liberação" 
        valor={indicadoresTempo.emissaoAteLiberacao?.toFixed(1) || "Sem dados"} 
        sufixo="h"
        loading={loading}
        icone={Timer}
        descricao="Agilidade na revisão técnica interna"
      />
      <BICardKPI 
        titulo="Tempo Liberação → OS" 
        valor={indicadoresTempo.aprovacaoAteOS?.toFixed(1) || "Sem dados"} 
        sufixo="h"
        loading={loading}
        icone={Timer}
        descricao="Tempo de fechamento do negócio"
      />
    </div>
  );
}
