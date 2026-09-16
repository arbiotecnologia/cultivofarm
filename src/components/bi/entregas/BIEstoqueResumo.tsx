import { BICardKPI } from "../BICardKPI";
import { Package, Warehouse, Truck, CheckCircle2 } from "lucide-react";

interface BIEstoqueResumoProps {
  indicadores: {
    volumeSolicitado: number | null;
    volumeSolicitadoAprovado: number | null;
    volumeSolicitadoEntregue: number | null;
    volumeProduzidoReal: number | null;
    volumeEmEstoqueReal: number | null;
    volumeReservadoReal: number | null;
    volumeDisponivelReal: number | null;
    volumeEntregueReal: number | null;
  };
  loading?: boolean;
}

export function BIEstoqueResumo({ indicadores, loading }: BIEstoqueResumoProps) {
  const formatValue = (val: number | null) => {
    if (val === null || val === undefined) return "Sem dados suficientes";
    return val.toLocaleString();
  };

  const getSufixo = (val: number | null) => {
    return (val !== null && val !== undefined) ? "L" : "";
  };

  return (
    <div className="space-y-4">
      <div className="bg-blue-50 border border-blue-200 p-2 rounded text-[10px] text-blue-700 italic mb-2">
        Os indicadores físicos de estoque são globais e não são filtrados por cliente/fazenda quando não há vínculo direto no estoque.
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <BICardKPI 
          titulo="Volume Solicitado" 
          valor={formatValue(indicadores.volumeSolicitado)} 
          sufixo={getSufixo(indicadores.volumeSolicitado)}
          loading={loading}
          icone={Warehouse}
          descricao="Volume total vinculado a OS de Produção e Manuais"
        />
        <BICardKPI 
          titulo="Solicitado Aprovado" 
          valor={formatValue(indicadores.volumeSolicitadoAprovado)} 
          sufixo={getSufixo(indicadores.volumeSolicitadoAprovado)}
          loading={loading}
          icone={Warehouse}
          descricao="Volume de solicitações com CQ Aprovado"
        />
        <BICardKPI 
          titulo="Solicitado Entregue" 
          valor={formatValue(indicadores.volumeSolicitadoEntregue)} 
          sufixo={getSufixo(indicadores.volumeSolicitadoEntregue)}
          loading={loading}
          icone={Truck}
          descricao="Volume de solicitações com entrega confirmada"
        />
        <BICardKPI 
          titulo="Total em Estoque" 
          valor={formatValue(indicadores.volumeEmEstoqueReal)} 
          sufixo={getSufixo(indicadores.volumeEmEstoqueReal)}
          loading={loading}
          icone={Warehouse}
          descricao="Volume físico total disponível nas unidades (auditado)"
        />
        <BICardKPI 
          titulo="Produzido Real" 
          valor={formatValue(indicadores.volumeProduzidoReal)} 
          sufixo={getSufixo(indicadores.volumeProduzidoReal)}
          loading={loading}
          icone={Warehouse}
          descricao="Volume físico real produzido (requer auditoria física)"
        />
        <BICardKPI 
          titulo="Reservado Real" 
          valor={formatValue(indicadores.volumeReservadoReal)} 
          sufixo={getSufixo(indicadores.volumeReservadoReal)}
          loading={loading}
          icone={Package}
          descricao="Estoque físico reservado para OS em andamento"
        />
        <BICardKPI 
          titulo="Saldo Disponível" 
          valor={formatValue(indicadores.volumeDisponivelReal)} 
          sufixo={getSufixo(indicadores.volumeDisponivelReal)}
          loading={loading}
          icone={CheckCircle2}
          descricao="Volume livre para novas solicitações (Total - Reservado)"
        />
        <BICardKPI 
          titulo="Entregue Real" 
          valor={formatValue(indicadores.volumeEntregueReal)} 
          sufixo={getSufixo(indicadores.volumeEntregueReal)}
          loading={loading}
          icone={Truck}
          descricao="Volume físico real entregue (requer auditoria on-farm)"
        />
      </div>
    </div>
  );
}


