import { BICardKPI } from "../BICardKPI";
import { 
  ClipboardList, 
  CalendarCheck, 
  FlaskConical, 
  Beaker, 
  CheckCircle2, 
  Package, 
  Warehouse, 
  Truck, 
  AlertTriangle,
  FileCheck,
  Ban
} from "lucide-react";

interface BILaboratorioKPIsProps {
  indicadores: {
    abertas: number;
    programadas: number;
    emProducao: number;
    aguardandoCQ: number;
    cqAprovado: number;
    cqReprovado: number;
    emEnvase: number;
    prontoEntrega: number;
    entregaPendente: number;
    entregue: number;
    finalizadas: number;
    atrasadas: number;
    aptasFinalizacao: number;
  };
  loading?: boolean;
}

export function BILaboratorioKPIs({ indicadores, loading }: BILaboratorioKPIsProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-4">
      <BICardKPI 
        titulo="OS Abertas" 
        valor={indicadores.abertas} 
        loading={loading}
        icone={ClipboardList}
        descricao="Novas OS aguardando PCP"
      />
      <BICardKPI 
        titulo="Programadas" 
        valor={indicadores.programadas} 
        loading={loading}
        icone={CalendarCheck}
        descricao="Aguardando início da produção"
      />
      <BICardKPI 
        titulo="Em Produção" 
        valor={indicadores.emProducao} 
        loading={loading}
        icone={FlaskConical}
        descricao="Lotes ativos em fabricação"
      />
      <BICardKPI 
        titulo="Aguardando CQ" 
        valor={indicadores.aguardandoCQ} 
        loading={loading}
        icone={Beaker}
        variant="warning"
        descricao="Amostras em análise laboratorial"
      />
      <BICardKPI 
        titulo="CQ Aprovado" 
        valor={indicadores.cqAprovado} 
        loading={loading}
        icone={CheckCircle2}
        variant="success"
        descricao="Lotes liberados para envase"
      />
      <BICardKPI 
        titulo="CQ Reprovado" 
        valor={indicadores.cqReprovado} 
        loading={loading}
        icone={Ban}
        variant="error"
        descricao="Lotes com inconsistência técnica"
      />
      <BICardKPI 
        titulo="Em Envase" 
        valor={indicadores.emEnvase} 
        loading={loading}
        icone={Package}
        descricao="Processo de embalagem em curso"
      />
      <BICardKPI 
        titulo="Pronto Entrega" 
        valor={indicadores.prontoEntrega} 
        loading={loading}
        icone={Warehouse}
        descricao="Estoque reservado aguardando logística"
      />
      <BICardKPI 
        titulo="Entrega Pendente" 
        valor={indicadores.entregaPendente} 
        loading={loading}
        icone={Truck}
        variant="warning"
        descricao="Produtos em rota sem confirmação"
      />
      <BICardKPI 
        titulo="Entregas Concluídas" 
        valor={indicadores.entregue} 
        loading={loading}
        icone={CheckCircle2}
        variant="success"
        descricao="Entregas confirmadas no período"
      />
      <BICardKPI 
        titulo="OS Finalizadas" 
        valor={indicadores.finalizadas} 
        loading={loading}
        icone={FileCheck}
        descricao="Encerradas oficialmente no sistema"
      />
      <BICardKPI 
        titulo="Aptas Finalizar" 
        valor={indicadores.aptasFinalizacao} 
        loading={loading}
        icone={CheckCircle2}
        variant="success"
        descricao="Completas aguardando encerramento"
      />
      <BICardKPI 
        titulo="OS Atrasadas" 
        valor={indicadores.atrasadas} 
        loading={loading}
        icone={AlertTriangle}
        variant="error"
        descricao="Ordens fora do cronograma PCP"
      />
    </div>
  );
}
