import { BIEntregasKPIs } from "./BIEntregasKPIs";
import { BIEstoqueResumo } from "./BIEstoqueResumo";
import { BIEstoquePorProduto } from "./BIEstoquePorProduto";
import { BIEntregasPorCliente } from "./BIEntregasPorCliente";
import { BITabelaEntregasCriticas } from "./BITabelaEntregasCriticas";
import { BITabelaOSFinalizaveis } from "./BITabelaOSFinalizaveis";
import { 
  Truck, 
  Warehouse, 
  AlertTriangle, 
  CheckCircle2, 
  Users, 
  Box,
  ClipboardList
} from "lucide-react";

interface BIEntregasResumoProps {
  indicadores: any;
  indicadoresEstoque: any;
  entregasPorCliente: any[];
  estoquePorProduto: any[];
  entregasCriticas: any[];
  osFinalizaveis: any[];
  loading?: boolean;
}

export function BIEntregasResumo({ 
  indicadores, 
  indicadoresEstoque,
  entregasPorCliente,
  estoquePorProduto,
  entregasCriticas,
  osFinalizaveis,
  loading 
}: BIEntregasResumoProps) {
  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <h3 className="text-lg font-black text-foreground uppercase tracking-tight flex items-center gap-2">
          <Truck className="h-5 w-5 text-primary" />
          Métricas de Expedição e Entrega
        </h3>
        <BIEntregasKPIs indicadores={indicadores} loading={loading} />
      </div>

      <div className="space-y-4">
        <h3 className="text-lg font-black text-foreground uppercase tracking-tight flex items-center gap-2">
          <Warehouse className="h-5 w-5 text-primary" />
          Resumo do Estoque (Visão Operacional)
        </h3>
        <BIEstoqueResumo indicadores={indicadoresEstoque} loading={loading} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="space-y-4">
          <h3 className="text-lg font-black text-foreground uppercase tracking-tight flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-red-600" />
            Entregas e Expedições Críticas
          </h3>
          <BITabelaEntregasCriticas dados={entregasCriticas} loading={loading} />
        </div>

        <div className="space-y-4">
          <h3 className="text-lg font-black text-foreground uppercase tracking-tight flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            OS Aptas para Finalização
          </h3>
          <BITabelaOSFinalizaveis dados={osFinalizaveis} loading={loading} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="space-y-4">
          <h3 className="text-lg font-black text-foreground uppercase tracking-tight flex items-center gap-2">
            <Box className="h-5 w-5 text-primary" />
            Estoque Detalhado por Produto
          </h3>
          <BIEstoquePorProduto dados={estoquePorProduto} loading={loading} />
        </div>
        <div className="space-y-4">
          <h3 className="text-lg font-black text-foreground uppercase tracking-tight flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            Logística por Produtor
          </h3>
          <BIEntregasPorCliente dados={entregasPorCliente} loading={loading} />
        </div>
      </div>
    </div>
  );
}
