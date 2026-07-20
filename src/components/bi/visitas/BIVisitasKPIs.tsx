import { BICardKPI } from "../BICardKPI";
import { 
  Users, 
  ClipboardCheck, 
  MapPin, 
  ClipboardList, 
  FlaskRound, 
  Camera, 
  FileWarning,
  FileCheck2,
  CalendarDays,
  Clock
} from "lucide-react";

interface BIVisitasKPIsProps {
  indicadores: {
    solicitacoesAbertas: number;
    visitasAgendadas: number;
    checkinsRealizados: number;
    visitasRealizadas: number;
    visitasComDiagnostico: number;
    visitasComEvidencias: number;
    visitasPendentesRecomendacao: number;
  };
  indicadoresRecomendacoes: {
    emitidas: number;
    liberadas: number;
    aguardandoDecisao: number;
  };
  loading?: boolean;
}

export function BIVisitasKPIs({ indicadores, indicadoresRecomendacoes, loading }: BIVisitasKPIsProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
      <BICardKPI 
        titulo="Solicitações Abertas" 
        valor={indicadores.solicitacoesAbertas} 
        loading={loading}
        icone={ClipboardList}
        descricao="Novas demandas aguardando atendimento"
      />
      <BICardKPI 
        titulo="Visitas Agendadas" 
        valor={indicadores.visitasAgendadas} 
        loading={loading}
        icone={CalendarDays}
        descricao="Visitas marcadas no calendário técnico"
      />
      <BICardKPI 
        titulo="Check-ins Realizados" 
        valor={indicadores.checkinsRealizados} 
        loading={loading}
        icone={MapPin}
        descricao="Chegadas registradas via GPS"
      />
      <BICardKPI 
        titulo="Visitas Finalizadas" 
        valor={indicadores.visitasRealizadas} 
        loading={loading}
        icone={ClipboardCheck}
        descricao="Visitas técnicas concluídas no período"
      />
      <BICardKPI 
        titulo="Pendente Recomendação" 
        valor={indicadores.visitasPendentesRecomendacao} 
        loading={loading}
        icone={FileWarning}
        variant="warning"
        descricao="Visitas sem recomendação agronômica"
      />
      <BICardKPI 
        titulo="Com Diagnóstico" 
        valor={indicadores.visitasComDiagnostico} 
        loading={loading}
        icone={Users}
        descricao="Visitas com registro de pragas/doenças"
      />
      <BICardKPI 
        titulo="Com Evidências" 
        valor={indicadores.visitasComEvidencias} 
        loading={loading}
        icone={Camera}
        descricao="Visitas com fotos ou anexos técnicos"
      />
      <BICardKPI 
        titulo="Recomendações Emitidas" 
        valor={indicadoresRecomendacoes.emitidas} 
        loading={loading}
        icone={FileCheck2}
        descricao="Total de laudos técnicos gerados"
      />
      <BICardKPI 
        titulo="Recomendações Liberadas" 
        valor={indicadoresRecomendacoes.liberadas} 
        loading={loading}
        icone={FileCheck2}
        variant="success"
        descricao="Laudos revisados e liberados para o cliente"
      />
      <BICardKPI 
        titulo="Aguardando Decisão" 
        valor={indicadoresRecomendacoes.aguardandoDecisao} 
        loading={loading}
        icone={Clock}
        variant="warning"
        descricao="Laudos liberados aguardando aceite do produtor"
      />
    </div>
  );
}
