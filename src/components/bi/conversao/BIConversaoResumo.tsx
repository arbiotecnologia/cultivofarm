import { BIConversaoKPIs } from "./BIConversaoKPIs";
import { BIConversaoFunil } from "./BIConversaoFunil";
import { BIConversaoPorConsultor } from "./BIConversaoPorConsultor";
import { BIConversaoPorCliente } from "./BIConversaoPorCliente";
import { BIOportunidadesParadas } from "./BIOportunidadesParadas";
import { BIGargalosTable } from "../BIGargalosTable";
import { TrendingUp, AlertTriangle, Users, LayoutGrid, Clock, Filter } from "lucide-react";

interface BIConversaoResumoProps {
  indicadores: any;
  indicadoresTempo: any;
  conversaoPorConsultor: any[];
  conversaoPorCliente: any[];
  oportunidadesParadas: any[];
  gargalosConversao: any[];
  loading?: boolean;
}

export function BIConversaoResumo({ 
  indicadores, 
  indicadoresTempo,
  conversaoPorConsultor,
  conversaoPorCliente,
  oportunidadesParadas,
  gargalosConversao,
  loading 
}: BIConversaoResumoProps) {
  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <h3 className="text-lg font-black text-foreground uppercase tracking-tight flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-primary" />
          Métricas de Conversão
        </h3>
        <BIConversaoKPIs indicadores={indicadores} indicadoresTempo={indicadoresTempo} loading={loading} />
      </div>

      <div className="space-y-4">
        <h3 className="text-lg font-black text-foreground uppercase tracking-tight flex items-center gap-2">
          <Filter className="h-5 w-5 text-primary" />
          Funil de Atendimento e Vendas
        </h3>
        <BIConversaoFunil indicadores={indicadores} loading={loading} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="space-y-4">
          <h3 className="text-lg font-black text-foreground uppercase tracking-tight flex items-center gap-2">
            <Clock className="h-5 w-5 text-orange-600" />
            Oportunidades Paradas (Aguardando Decisão)
          </h3>
          <BIOportunidadesParadas dados={oportunidadesParadas} loading={loading} />
        </div>

        <div className="space-y-4">
          <h3 className="text-lg font-black text-foreground uppercase tracking-tight flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-red-600" />
            Gargalos de Conversão
          </h3>
          <BIGargalosTable dados={gargalosConversao} loading={loading} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="space-y-4">
          <h3 className="text-lg font-black text-foreground uppercase tracking-tight flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            Performance Comercial por Consultor
          </h3>
          <BIConversaoPorConsultor dados={conversaoPorConsultor} loading={loading} />
        </div>
        <div className="space-y-4">
          <h3 className="text-lg font-black text-foreground uppercase tracking-tight flex items-center gap-2">
            <LayoutGrid className="h-5 w-5 text-primary" />
            Perfil de Conversão por Produtor
          </h3>
          <BIConversaoPorCliente dados={conversaoPorCliente} loading={loading} />
        </div>
      </div>
    </div>
  );
}
