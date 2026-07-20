import { BIVisitasKPIs } from "./BIVisitasKPIs";
import { BIVisitasPorConsultor } from "./BIVisitasPorConsultor";
import { BIVisitasPorCliente } from "./BIVisitasPorCliente";
import { BITabelaVisitasCriticas } from "./BITabelaVisitasCriticas";
import { BIGargalosVisitas } from "./BIGargalosVisitas";
import { BICardKPI } from "../BICardKPI";
import { Timer, AlertTriangle, TrendingUp, Filter } from "lucide-react";


interface BIVisitasResumoProps {
  indicadores: any;
  indicadoresRecomendacoes: any;
  indicadoresTempo: any;
  visitasPorConsultor: any[];
  visitasPorCliente: any[];
  visitasCriticas: any[];
  loading?: boolean;
  onConsultorClick?: (id: string, nome: string) => void;
  onClienteClick?: (id: string, nome: string) => void;
}

export function BIVisitasResumo({ 
  indicadores, 
  indicadoresRecomendacoes, 
  indicadoresTempo,
  visitasPorConsultor,
  visitasPorCliente,
  visitasCriticas,
  loading,
  onConsultorClick,
  onClienteClick
}: BIVisitasResumoProps) {
  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <h3 className="text-lg font-black text-foreground uppercase tracking-tight flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-primary" />
          Indicadores de Performance
        </h3>
        <BIVisitasKPIs 
          indicadores={indicadores} 
          indicadoresRecomendacoes={indicadoresRecomendacoes} 
          loading={loading} 
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="space-y-4">
          <h3 className="text-lg font-black text-foreground uppercase tracking-tight flex items-center gap-2">
            <Timer className="h-5 w-5 text-primary" />
            Tempos Médios de Atendimento
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <BICardKPI 
              titulo="Solicitação → Check-in" 
              valor={indicadoresTempo.solicitacaoAteCheckin?.toFixed(1) || "Sem dados"} 
              sufixo="h"
              loading={loading}
              descricao="Resposta inicial do consultor"
            />
            <BICardKPI 
              titulo="Check-in → Finalização" 
              valor={indicadoresTempo.checkinAteFinalizacao?.toFixed(1) || "Sem dados"} 
              sufixo="h"
              loading={loading}
              descricao="Tempo médio em campo"
            />
            <BICardKPI 
              titulo="Finalização → Liberação" 
              valor={indicadoresTempo.finalizacaoAteAprovacao?.toFixed(1) || "Sem dados"} 
              sufixo="h"
              loading={loading}
              descricao="Tempo de revisão técnica/gestão"
            />
            <BICardKPI 
              titulo="Liberação → OS" 
              valor={indicadoresTempo.aprovacaoAteOS?.toFixed(1) || "Sem dados"} 
              sufixo="h"
              loading={loading}
              descricao="Tempo de conversão comercial"
            />
          </div>
        </div>

        <div className="space-y-4">
          <h3 className="text-lg font-black text-foreground uppercase tracking-tight flex items-center gap-2">
            <Filter className="h-5 w-5 text-primary" />
            Resumo de Gargalos Operacionais
          </h3>
          <BIGargalosVisitas dados={visitasCriticas} loading={loading} />
          
          <h3 className="text-lg font-black text-foreground uppercase tracking-tight flex items-center gap-2 pt-4">
            <AlertTriangle className="h-5 w-5 text-red-600" />
            Visitas e Solicitações Críticas
          </h3>
          <BITabelaVisitasCriticas dados={visitasCriticas.slice(0, 5)} loading={loading} />
        </div>

      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="space-y-4">
          <h3 className="text-lg font-black text-foreground uppercase tracking-tight">Produtividade por Consultor</h3>
          <BIVisitasPorConsultor dados={visitasPorConsultor} loading={loading} onRowClick={onConsultorClick} />
        </div>
        <div className="space-y-4">
          <h3 className="text-lg font-black text-foreground uppercase tracking-tight">Atendimento por Cliente</h3>
          <BIVisitasPorCliente dados={visitasPorCliente} loading={loading} onRowClick={onClienteClick} />
        </div>
      </div>
    </div>
  );
}
