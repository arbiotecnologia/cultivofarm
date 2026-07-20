import { BICardKPI } from "../BICardKPI";
import { 
  Truck, 
  CheckCircle2, 
  Clock, 
  FileCheck2, 
  AlertTriangle, 
  Info,
  Warehouse,
  Package
} from "lucide-react";

interface BIEntregasKPIsProps {
  indicadores: any;
  loading?: boolean;
}

export function BIEntregasKPIs({ indicadores, loading }: BIEntregasKPIsProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      <BICardKPI 
        titulo="Prontas para Entrega" 
        valor={indicadores.prontasEntrega} 
        loading={loading}
        icone={Warehouse}
        descricao="OS prontas para sair do estoque"
      />
      <BICardKPI 
        titulo="Entregas Pendentes" 
        valor={indicadores.entregasPendentes} 
        loading={loading}
        icone={Truck}
        variant="warning"
        descricao="Expedidas aguardando confirmação"
      />
      <BICardKPI 
        titulo="Entregas Confirmadas" 
        valor={indicadores.entregasConfirmadas} 
        loading={loading}
        icone={CheckCircle2}
        variant="success"
        descricao="Concluídas e auditadas"
      />
      <BICardKPI 
        titulo="OS Finalizadas" 
        valor={indicadores.osFinalizadas} 
        loading={loading}
        icone={FileCheck2}
        descricao="Ciclo total encerrado"
      />
      <BICardKPI 
        titulo="Aptas p/ Finalização" 
        valor={indicadores.aptasFinalizacao} 
        loading={loading}
        icone={CheckCircle2}
        variant="success"
        descricao="Entregues aguardando encerramento de OS"
      />
      <BICardKPI 
        titulo="Pendências Aplicação" 
        valor={indicadores.pendenciasAplicacao} 
        loading={loading}
        icone={Info}
        variant="warning"
        descricao="Informativo pós-entrega"
      />
      <BICardKPI 
        titulo="Gargalos Expedição" 
        valor={indicadores.gargalosExpedicao} 
        loading={loading}
        icone={AlertTriangle}
        variant="error"
        descricao="Impedimentos logísticos"
      />
    </div>
  );
}
